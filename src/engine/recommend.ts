import { getConsumable, getJoker, getPack, getVoucher } from '../catalog/catalog';
import { phaseForAnte } from '../types';
import type {
  Edition, JokerStickers, Phase, RecKind, Recommendation, RunState, ShopCardSlot, ShopState,
} from '../types';
import { interestCapFor, runInterest, runInterestLost, sellValue } from './economy';
import { earnsInterest, hasFreeJokerSlot, rentalUpkeep } from './gameRules';
import { cardImpact, contextFor, formatMultiplier, jokerImpact, priorFromRating } from './impact';
import type { Impact, JokerContext } from './impact';
import { adviseStrategy, getArchetype } from './strategy';
import { TUNING } from './tuning';

/**
 * Rounds of play left in the run, which is what turns a per-round cost into a
 * total one. A rental joker bought in ante 1 pays its upkeep eight times as
 * often as the same joker bought in ante 8.
 */
export function roundsRemaining(ante: number): number {
  const { antesPerRun, roundsPerAnte } = TUNING.economy;
  return Math.max(1, (antesPerRun - Math.floor(ante) + 1) * roundsPerAnte);
}

/**
 * Converts dollars given up into the same unit as a score multiplier.
 *
 * This is the only place money and score meet. Spending is a real loss of
 * purchasing power, so a purchase has to earn its price back in hand score
 * before it beats keeping the money.
 */
export function economyMultiplier(dollars: number): number {
  return 2 ** (-dollars / TUNING.economy.dollarsPerDoubling);
}

interface Cost {
  dollars: number;
  reasons: string[];
}

/**
 * What an action really costs: the price, plus the interest it stops earning
 * for every remaining round, plus any per-round upkeep it brings with it.
 */
function costOf(run: RunState, price: number, stickers?: JokerStickers): Cost {
  const rounds = roundsRemaining(run.ante);
  const reasons: string[] = [];
  let dollars = price;

  // Interest is charged over the recovery horizon, not the whole run: you earn
  // through the next blinds and climb back out of the tier you dropped.
  const lostPerRound = runInterestLost(run, price);
  if (lostPerRound > 0) {
    const recovery = Math.min(rounds, TUNING.economy.interestRecoveryRounds);
    dollars += lostPerRound * recovery;
    reasons.push(
      `Drops your interest by $${lostPerRound}/round while you rebuild ($${run.money} → $${run.money - price})`,
    );
  }

  const upkeep = rentalUpkeep(stickers);
  if (upkeep > 0) {
    dollars += upkeep * rounds;
    reasons.push(`Rental upkeep costs $${upkeep} × ${rounds} remaining rounds`);
  }

  return { dollars, reasons };
}

function rec(
  kind: RecKind,
  action: string,
  impact: number,
  costDollars: number,
  reasons: string[],
  refId?: string,
  evidence: Recommendation['evidence'] = 'heuristic',
): Recommendation {
  const score = impact * economyMultiplier(costDollars);
  return { kind, action, score, impact, costDollars, priority: 'low', evidence, reasons, refId };
}

/** An action that cannot be taken at all, so it ranks below everything. */
function unavailable(kind: RecKind, action: string, reason: string, refId?: string): Recommendation {
  return {
    kind, action, score: 0, impact: 0, costDollars: 0, priority: 'low',
    evidence: 'heuristic', reasons: [reason], refId,
  };
}

function finalize(recs: Recommendation[]): Recommendation[] {
  return [...recs]
    .sort((a, b) => b.score - a.score)
    .map(r => ({
      ...r,
      priority: r.score >= TUNING.priority.high ? 'high' : r.score >= TUNING.priority.medium ? 'medium' : 'low',
    }));
}

interface WeakestOwned {
  index: number;
  impact: Impact;
  name: string;
  cost: number;
  edition: Edition;
  stickers?: JokerStickers;
}

/** The owned joker contributing least, judged the same way a shop card is. */
function findWeakestOwned(run: RunState, ctx: JokerContext): WeakestOwned | null {
  let weakest: WeakestOwned | null = null;
  run.jokers.forEach((owned, i) => {
    if (owned.edition === 'negative' || owned.stickers?.eternal) return;
    const def = getJoker(owned.jokerId);
    if (!def) return;
    const impact = jokerImpact(run, def, owned.edition, owned.stickers, ctx);
    if (!weakest || impact.multiplier < weakest.impact.multiplier) {
      weakest = {
        index: i, impact, name: def.name, cost: def.cost, edition: owned.edition, stickers: owned.stickers,
      };
    }
  });
  return weakest;
}

function evalShopCard(run: RunState, slot: ShopCardSlot, ctx: JokerContext): Recommendation {
  const id = slot.kind === 'joker' ? slot.jokerId : slot.consumableId;
  const def = slot.kind === 'joker' ? getJoker(id) : getConsumable(id);
  if (!def) return unavailable(slot.kind === 'joker' ? 'buy-joker' : 'buy-consumable', 'Buy unknown card', 'Unknown catalog id');

  const stickers = slot.kind === 'joker' ? slot.stickers : undefined;
  const edition: Edition = slot.kind === 'joker' ? slot.edition : 'base';
  const impact = cardImpact(run, id, edition, stickers, ctx)!;
  const action = `Buy ${def.name} ($${slot.price})`;
  const kind: RecKind = slot.kind === 'joker' ? 'buy-joker' : 'buy-consumable';

  if (slot.kind === 'consumable') {
    if (slot.price > run.money) {
      return unavailable(kind, action, `Not affordable ($${slot.price} > $${run.money})`, def.id);
    }
    const cost = costOf(run, slot.price);
    const reasons = [...impact.reasons, ...cost.reasons];
    if (run.consumables.length >= run.consumableSlots) {
      reasons.push('Your consumable slots are full — using one first is part of the price');
    }
    return rec(kind, action, impact.multiplier, cost.dollars, reasons, def.id, impact.evidence);
  }

  const cost = costOf(run, slot.price, stickers);

  if (hasFreeJokerSlot(run, slot.edition)) {
    if (slot.price > run.money) {
      return unavailable(kind, action, `Not affordable ($${slot.price} > $${run.money})`, def.id);
    }
    return rec(kind, action, impact.multiplier, cost.dollars, [...impact.reasons, ...cost.reasons], def.id, impact.evidence);
  }

  // Slots are full, so the real choice is trading a joker you own for this one.
  const weakest = findWeakestOwned(run, ctx);
  if (weakest) {
    const refund = sellValue(weakest.cost, weakest.edition, weakest.stickers);
    if (slot.price > run.money + refund) {
      return unavailable(
        kind, action,
        `Not affordable even after selling ${weakest.name} ($${run.money} + $${refund} < $${slot.price})`,
        def.id,
      );
    }
    // Swapping trades one card's contribution for another's, so the gain is the
    // ratio between them rather than the newcomer's own multiplier.
    const swap = impact.multiplier / weakest.impact.multiplier;
    if (swap >= TUNING.slots.sellAndBuyMargin) {
      const netCost = costOf(run, Math.max(0, slot.price - refund), stickers);
      return rec(
        'sell-and-buy',
        `Sell ${weakest.name}, buy ${def.name} ($${slot.price})`,
        swap,
        netCost.dollars,
        [
          ...impact.reasons,
          ...netCost.reasons,
          `Slots full — ${weakest.name} contributes least (${formatMultiplier(weakest.impact.multiplier)}`
          + ` against this card's ${formatMultiplier(impact.multiplier)})`,
          `Selling refunds $${refund}`,
        ],
        def.id,
        impact.evidence,
      );
    }
  }

  if (slot.price > run.money) {
    return unavailable(kind, action, `Not affordable without a sellable joker ($${slot.price} > $${run.money})`, def.id);
  }
  return rec(
    kind, action, impact.multiplier * TUNING.slots.blockedPenalty, cost.dollars,
    [...impact.reasons, ...cost.reasons, 'Joker slots are full and nothing is clearly worth selling for this'],
    def.id, impact.evidence,
  );
}

function evalVoucher(run: RunState, voucherId: string, ante: number): Recommendation {
  const def = getVoucher(voucherId);
  if (!def) return unavailable('buy-voucher', 'Buy unknown voucher', 'Unknown catalog id');
  const action = `Buy ${def.name} ($${def.cost})`;
  if (def.cost > run.money) {
    return unavailable('buy-voucher', action, `Not affordable ($${def.cost} > $${run.money})`, def.id);
  }

  // A voucher pays out over the rest of the run, so the same voucher is worth
  // less the later it is bought. That replaces a flat late-game penalty with
  // the reason behind it.
  const rounds = roundsRemaining(ante);
  const fullRun = TUNING.economy.antesPerRun * TUNING.economy.roundsPerAnte;
  const share = rounds / fullRun;
  const multiplier = 1 + (priorFromRating(def.rating) - 1) * share;
  const reasons = [def.effect];
  if (share < 1) reasons.push(`${rounds} rounds left to profit from it`);

  const cost = costOf(run, def.cost);
  return rec('buy-voucher', action, multiplier, cost.dollars, [...reasons, ...cost.reasons], def.id);
}

function evalPack(run: RunState, packId: string, phase: Phase): Recommendation {
  const def = getPack(packId);
  if (!def) return unavailable('buy-pack', 'Buy unknown pack', 'Unknown catalog id');
  const action = `Buy ${def.name} ($${def.cost})`;
  if (def.cost > run.money) {
    return unavailable('buy-pack', action, `Not affordable ($${def.cost} > $${run.money})`, def.id);
  }
  const cost = costOf(run, def.cost);
  return rec(
    'buy-pack', action, priorFromRating(def.rating[phase]), cost.dollars,
    [`${def.options} options, pick ${def.picks}`, ...cost.reasons], def.id,
  );
}

function evalReroll(run: RunState, shop: ShopState): Recommendation {
  const action = `Reroll ($${shop.rerollCost})`;
  if (shop.rerollCost > run.money) {
    return unavailable('reroll', action, `Not affordable ($${shop.rerollCost} > $${run.money})`);
  }
  const cost = costOf(run, shop.rerollCost);
  // No comparison against the current shop is needed: a card already on offer
  // that beats an average shop simply outranks this on the same scale.
  return rec('reroll', action, TUNING.reroll.expectedNetGain, cost.dollars, [
    `Costs $${shop.rerollCost}`,
    `A fresh shop is worth about ${formatMultiplier(TUNING.reroll.expectedNetGain)} on average,`
    + ' once you have paid for whatever it turns up',
    ...cost.reasons,
  ]);
}

/**
 * Buying nothing is the zero point of the whole scale: no score gained, no
 * dollars given up, so exactly 1.0. Every other action is measured against it,
 * which is why banking needs no bonuses of its own — the cost of spending is
 * already charged to the things that spend.
 */
function evalSkip(run: RunState, plan: JokerContext['plan']): Recommendation {
  const reasons: string[] = [];
  if (earnsInterest(run)) {
    const earned = runInterest(run);
    const cap = interestCapFor(run.vouchers);
    reasons.push(`Banking $${run.money} earns $${earned} interest per round`);
    if (earned < cap) {
      const toNextTier = run.money >= 0 ? (5 - (run.money % 5)) % 5 : 0;
      if (toNextTier > 0) reasons.push(`$${toNextTier} more reaches the next interest tier`);
      else reasons.push(`Still below the $${cap}/round cap, so saving keeps compounding`);
    }
  } else {
    reasons.push('Green Deck earns no interest — cash can be spent without breaking an interest tier');
  }
  if (plan?.archetypeId === 'economy') {
    // Context, not a score change: the model prices what spending costs you now,
    // not how an economy build compounds what you keep.
    reasons.push(`Banking fits your recommended ${plan.name} plan`);
  }
  reasons.push('Nothing bought means nothing given up — every other option is measured against this');
  return rec('skip', 'Buy nothing', 1, 0, reasons);
}

function planFor(run: RunState): JokerContext['plan'] {
  const advice = adviseStrategy(run);
  if (advice.commitment === 'open') return null;
  const candidate = advice.candidates[0];
  const arch = candidate ? getArchetype(candidate.archetypeId) : undefined;
  if (!candidate || !arch) return null;
  return {
    archetypeId: arch.id,
    name: candidate.name,
    keyJokers: arch.keyJokers,
    coreTags: arch.coreTags,
    hands: arch.hands,
  };
}

export function recommend(run: RunState, shop: ShopState): Recommendation[] {
  const phase = phaseForAnte(run.ante);
  const ctx = contextFor(run, phase, planFor(run));
  const recs: Recommendation[] = [];
  for (const slot of shop.cards) recs.push(evalShopCard(run, slot, ctx));
  if (shop.voucherId) recs.push(evalVoucher(run, shop.voucherId, run.ante));
  for (const packId of shop.packIds) recs.push(evalPack(run, packId, phase));
  recs.push(evalReroll(run, shop), evalSkip(run, ctx.plan));
  return finalize(recs);
}

/**
 * Ranks the options inside an opened booster pack.
 * `optionIds` may contain joker ids (Buffoon packs) and consumable ids.
 *
 * A pack pick is free, so there is no cost side here — only which option does
 * the most for your hand.
 */
export function recommendPackPick(run: RunState, optionIds: string[]): Recommendation[] {
  const phase = phaseForAnte(run.ante);
  const ctx = contextFor(run, phase, planFor(run));
  const recs = optionIds.map(id => {
    const impact = cardImpact(run, id, 'base', undefined, ctx);
    if (!impact) return unavailable('pick', `Take ${id}`, 'Unknown catalog id', id);
    const name = getJoker(id)?.name ?? getConsumable(id)?.name ?? id;
    const reasons = [...impact.reasons];

    if (getJoker(id) && !hasFreeJokerSlot(run, 'base')) {
      const weakest = findWeakestOwned(run, ctx);
      if (weakest && impact.multiplier / weakest.impact.multiplier >= TUNING.slots.sellAndBuyMargin) {
        reasons.push(`Slots full — sell ${weakest.name} (${formatMultiplier(weakest.impact.multiplier)}) to make room`);
      } else {
        reasons.push('Careful: your joker slots are full and nothing is clearly worth selling');
      }
    }
    return rec('pick', `Take ${name}`, impact.multiplier, 0, reasons, id, impact.evidence);
  });
  return finalize(recs);
}
