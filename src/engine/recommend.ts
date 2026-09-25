import { getConsumable, getJoker, getPack, getVoucher } from '../catalog/catalog';
import { phaseForAnte } from '../types';
import type { Edition, JokerStickers, Phase, RecKind, Recommendation, RunState, ShopCardSlot, ShopHabits, ShopState } from '../types';
import { interestCapFor, runInterest, sellValue } from './economy';
import { earnsInterest, hasFreeJokerSlot, rentalUpkeep } from './gameRules';
import { cardImpact, contextFor, formatMultiplier, jokerImpact, priorContribution, voucherPriorContribution } from './impact';
import type { Impact, JokerContext } from './impact';
import { marginalMultiplier, referenceHand } from './score';
import { packPrice, voucherPrice } from './prices';
import { horizonRounds, interestCost, projectMoney, roundsRemaining } from './projection';
import { adviseStrategy, getArchetype } from './strategy';
import { TUNING } from './tuning';
import { voucherValue } from './vouchers';

export { roundsRemaining };

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
 * over the planning horizon, plus any per-round upkeep it brings with it.
 */
function costOf(run: RunState, price: number, stickers?: JokerStickers): Cost {
  const rounds = roundsRemaining(run.ante);
  const reasons: string[] = [];
  let dollars = price;

  // Played forward rather than guessed: a buy that keeps you at the interest
  // cap costs nothing extra, one that empties the bank costs every tier you
  // would otherwise have climbed back through.
  const lost = interestCost(run, price);
  if (lost > 0) {
    dollars += lost;
    reasons.push(
      `Costs about $${Math.round(lost)} of interest over the next ${horizonRounds(run.ante)} rounds`
      + ` ($${run.money} → $${run.money - price})`,
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

/**
 * A card's whole worth on the ranking scale: what it does for your score, and
 * what it earns, converted at the same exchange rate every cost uses.
 */
function worth(impact: Impact): number {
  return impact.multiplier * economyMultiplier(-impact.incomeDollars);
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
    const impact = jokerImpact(run, def, owned.edition, owned.stickers, ctx, i);
    if (!weakest || worth(impact) < worth(weakest.impact)) {
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
    return rec(
      kind, action, impact.multiplier, cost.dollars - impact.incomeDollars,
      [...impact.reasons, ...cost.reasons], def.id, impact.evidence,
    );
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
    // ratio between them rather than the newcomer's own multiplier. Income is
    // part of both sides: selling a Golden Joker gives up what it earns.
    const swap = worth(impact) / worth(weakest.impact);
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
          `Slots full — ${weakest.name} contributes least (${formatMultiplier(worth(weakest.impact))}`
          + ` against this card's ${formatMultiplier(worth(impact))})`,
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
    kind, action, impact.multiplier * TUNING.slots.blockedPenalty, cost.dollars - impact.incomeDollars,
    [...impact.reasons, ...cost.reasons, 'Joker slots are full and nothing is clearly worth selling for this'],
    def.id, impact.evidence,
  );
}

function evalVoucher(
  run: RunState, voucherId: string, ante: number, ctx: JokerContext, habits?: ShopHabits,
): Recommendation {
  const def = getVoucher(voucherId);
  if (!def) return unavailable('buy-voucher', 'Buy unknown voucher', 'Unknown catalog id');
  const price = voucherPrice(run, def);
  const action = `Buy ${def.name} ($${price})`;
  if (price > run.money) {
    return unavailable('buy-voucher', action, `Not affordable ($${price} > $${run.money})`, def.id);
  }

  const cost = costOf(run, price);
  const modelled = voucherValue(run, def.id, price, {
    habits,
    weakest: () => {
      const w = findWeakestOwned(run, ctx);
      return w && {
        name: w.name, multiplier: w.impact.multiplier, incomeDollars: w.impact.incomeDollars,
        modelled: w.impact.evidence === 'modeled',
      };
    },
  });
  if (modelled) {
    return rec(
      'buy-voucher', action, modelled.multiplier, cost.dollars - modelled.incomeDollars,
      [def.effect, ...modelled.reasons, ...cost.reasons], def.id, modelled.evidence,
    );
  }

  // Not modelled yet: the rating stands in, on the voucher curve. A voucher
  // pays out over the rest of the run, so the same one is worth less the later
  // it is bought.
  const rounds = roundsRemaining(ante);
  const multiplier = ratedVoucherMultiplier(run, def.rating);
  const reasons = [def.effect, `Not modelled yet: rated ${def.rating}/10 on a curve fitted to the modelled vouchers`];
  if (rounds < TUNING.economy.antesPerRun * TUNING.economy.roundsPerAnte) {
    reasons.push(`${rounds} rounds left to profit from it`);
  }

  return rec('buy-voucher', action, multiplier, cost.dollars, [...reasons, ...cost.reasons], def.id);
}

/** A voucher's rating as a multiplier, scaled by the share of the run left to use it. */
function ratedVoucherMultiplier(run: RunState, rating: number, topShare?: number): number {
  const fullRun = TUNING.economy.antesPerRun * TUNING.economy.roundsPerAnte;
  const share = roundsRemaining(run.ante) / fullRun;
  return marginalMultiplier(run, referenceHand(run), voucherPriorContribution(run, rating, topShare) * share);
}

/**
 * A modelled voucher's worth next to what its rating would say, both on the
 * ranking scale before the price. Only the calibration script reads this: it
 * is how the voucher curve's scale is fitted.
 */
export function voucherCalibrationPair(
  run: RunState, voucherId: string,
): { model: number; rating: (topShare: number) => number } | null {
  const def = getVoucher(voucherId);
  if (!def || run.vouchers.includes(voucherId)) return null;
  const ctx = contextFor(run, phaseForAnte(run.ante), planFor(run));
  const modelled = voucherValue(run, voucherId, voucherPrice(run, def), {
    weakest: () => {
      const w = findWeakestOwned(run, ctx);
      return w && {
        name: w.name, multiplier: w.impact.multiplier, incomeDollars: w.impact.incomeDollars,
        modelled: w.impact.evidence === 'modeled',
      };
    },
  });
  if (!modelled) return null;
  return {
    model: modelled.multiplier * economyMultiplier(-modelled.incomeDollars),
    rating: topShare => ratedVoucherMultiplier(run, def.rating, topShare),
  };
}

function evalPack(run: RunState, packId: string, phase: Phase): Recommendation {
  const def = getPack(packId);
  if (!def) return unavailable('buy-pack', 'Buy unknown pack', 'Unknown catalog id');
  const price = packPrice(run, def);
  const action = `Buy ${def.name} ($${price})`;
  if (price > run.money) {
    return unavailable('buy-pack', action, `Not affordable ($${price} > $${run.money})`, def.id);
  }
  const cost = costOf(run, price);
  const hand = referenceHand(run);
  const multiplier = marginalMultiplier(run, hand, priorContribution(run, def.rating[phase]));
  return rec(
    'buy-pack', action, multiplier, cost.dollars,
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
  const path = projectMoney(run, horizonRounds(run.ante));
  if (path.length > 0) {
    reasons.push(
      path.length > 1
        ? `Banked, that is about $${Math.round(path[0])} next shop and $${Math.round(path[path.length - 1])} in ${path.length} rounds`
        : `Banked, that is about $${Math.round(path[0])} next shop`,
    );
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

export function recommend(run: RunState, shop: ShopState, habits?: ShopHabits): Recommendation[] {
  const phase = phaseForAnte(run.ante);
  const ctx = contextFor(run, phase, planFor(run));
  const recs: Recommendation[] = [];
  for (const slot of shop.cards) recs.push(evalShopCard(run, slot, ctx));
  if (shop.voucherId) recs.push(evalVoucher(run, shop.voucherId, run.ante, ctx, habits));
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
      if (weakest && worth(impact) / worth(weakest.impact) >= TUNING.slots.sellAndBuyMargin) {
        reasons.push(`Slots full — sell ${weakest.name} (${formatMultiplier(worth(weakest.impact))}) to make room`);
      } else {
        reasons.push('Careful: your joker slots are full and nothing is clearly worth selling');
      }
    }
    return rec('pick', `Take ${name}`, impact.multiplier, -impact.incomeDollars, reasons, id, impact.evidence);
  });
  return finalize(recs);
}
