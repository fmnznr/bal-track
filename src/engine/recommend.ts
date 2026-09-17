import { getConsumable, getJoker, getPack, getVoucher } from '../catalog/catalog';
import { phaseForAnte } from '../types';
import type {
  Edition, JokerDef, Phase, RecKind, Recommendation, RunState, ShopCardSlot, ShopState,
} from '../types';
import { detectArchetype, TAG_HAND_AFFINITY } from './archetype';
import type { ArchetypeProfile } from './archetype';
import { deckSignalForJoker } from './deckSignals';
import { INTEREST_TIER_DOLLARS, interestCapFor, runInterest, runInterestLost, sellValue } from './economy';
import { earnsInterest, hasFreeJokerSlot, rentalUpkeep, usedJokerSlots } from './gameRules';
import { playSignalForJoker } from './playSignals';
import { estimateHandScore, estimateJokerDelta, referenceHand } from './score';
import { adviseStrategy, getArchetype } from './strategy';
import { TUNING } from './tuning';
import type { ArchetypeDef, StrategyCandidate } from '../types';

/** Desirability an edition adds to a card, not what it adds to a hand's score. */
export const EDITION_SCORE_BONUS: Record<Edition, number> = TUNING.edition;

function rec(
  kind: RecKind,
  action: string,
  score: number,
  reasons: string[],
  refId?: string,
  evidence: Recommendation['evidence'] = 'heuristic',
): Recommendation {
  return { kind, action, score, priority: 'low', evidence, reasons, refId };
}

function finalize(recs: Recommendation[]): Recommendation[] {
  return [...recs]
    .sort((a, b) => b.score - a.score)
    .map(r => ({
      ...r,
      priority: r.score >= TUNING.priority.high ? 'high' : r.score >= TUNING.priority.medium ? 'medium' : 'low',
    }));
}

function economyNotes(run: RunState, price: number, weight: number): { penalty: number; notes: string[] } {
  const lost = runInterestLost(run, price);
  if (lost <= 0) return { penalty: 0, notes: [] };
  return {
    penalty: lost * weight,
    notes: [`Drops your interest by $${lost}/round ($${run.money} → $${run.money - price})`],
  };
}

/** Capped bonus for however many of the run's dominant tags a card carries. */
function synergyBonus(matches: number): number {
  return Math.min(TUNING.synergy.cap, matches * TUNING.synergy.perMatchingTag);
}

/** Heuristic value of an owned joker in the current context (used to find the weakest). */
function ownedJokerValue(run: RunState, index: number, phase: Phase, profile: ArchetypeProfile): number {
  const owned = run.jokers[index];
  const def = getJoker(owned.jokerId);
  if (!def) return 0;
  const synergy = def.tags.filter(t => profile.dominant.includes(t)).length;
  const deckSig = deckSignalForJoker(def, run.deckProfile);
  let value = def.rating[phase] + synergyBonus(synergy) + EDITION_SCORE_BONUS[owned.edition] + deckSig.delta;
  if (deckSig.capAt !== undefined) value = Math.min(value, deckSig.capAt);
  value += playSignalForJoker(def, run).delta;
  value -= rentalUpkeep(owned.stickers) * TUNING.stickers.owned.rentalPerUpkeepDollar;
  if (owned.stickers?.perishable) value += TUNING.stickers.owned.perishable;
  return value;
}

function planetBonus(run: RunState, profile: ArchetypeProfile, consumableId: string): { bonus: number; notes: string[] } {
  const def = getConsumable(consumableId);
  if (def?.kind !== 'planet' || !def.hand) return { bonus: 0, notes: [] };
  let bonus = 0;
  const notes: string[] = [];
  if (profile.dominant.some(t => (TAG_HAND_AFFINITY[t] ?? []).includes(def.hand!))) {
    bonus += TUNING.planet.matchesBuild;
    notes.push(`Levels ${def.hand} — matches your build`);
  }
  const level = run.handLevels[def.hand];
  if (level > 1) {
    bonus += Math.min(TUNING.planet.perExistingLevelCap, (level - 1) * TUNING.planet.perExistingLevel);
    notes.push(`${def.hand} is already level ${level} — keep stacking it`);
  }
  if (run.primaryHand && def.hand === run.primaryHand) {
    bonus += TUNING.planet.matchesPrimaryHand;
    notes.push(`${def.hand} is the hand you build around`);
  }
  return { bonus, notes };
}

function activePlan(run: RunState): StrategyCandidate | null {
  const advice = adviseStrategy(run);
  if (advice.commitment === 'open') return null;
  return advice.candidates[0] ?? null;
}

function planJokerBonus(defId: string, tags: readonly string[], plan: StrategyCandidate | null): { bonus: number; notes: string[] } {
  if (!plan) return { bonus: 0, notes: [] };
  const arch: ArchetypeDef | undefined = getArchetype(plan.archetypeId);
  if (!arch) return { bonus: 0, notes: [] };
  if (arch.keyJokers.includes(defId)) {
    return { bonus: TUNING.plan.keyJoker, notes: [`On the watchlist for your recommended ${plan.name} plan`] };
  }
  if (tags.some(t => (arch.coreTags as readonly string[]).includes(t))) {
    return { bonus: TUNING.plan.coreTag, notes: [`Fits your recommended ${plan.name} plan`] };
  }
  return { bonus: 0, notes: [] };
}

function planPlanetBonus(consumableId: string, plan: StrategyCandidate | null): { bonus: number; notes: string[] } {
  if (!plan) return { bonus: 0, notes: [] };
  const def = getConsumable(consumableId);
  if (def?.kind !== 'planet' || !def.hand || !plan.hands.includes(def.hand)) return { bonus: 0, notes: [] };
  return {
    bonus: TUNING.planet.matchesPlan,
    notes: [`Levels ${def.hand} for your recommended ${plan.name} plan`],
  };
}

interface WeakestOwned {
  index: number;
  value: number;
  def: JokerDef;
  edition: Edition;
}

/** Weakest non-negative owned joker by current heuristic value, or null if none. */
function findWeakestOwned(run: RunState, phase: Phase, profile: ArchetypeProfile): WeakestOwned | null {
  let index = -1;
  let value = Infinity;
  run.jokers.forEach((owned, i) => {
    if (owned.edition === 'negative' || owned.stickers?.eternal) return;
    const v = ownedJokerValue(run, i, phase, profile);
    if (v < value) {
      value = v;
      index = i;
    }
  });
  const owned = run.jokers[index];
  const def = owned ? getJoker(owned.jokerId) : undefined;
  if (!owned || !def) return null;
  return { index, value, def, edition: owned.edition };
}

function evalShopCard(run: RunState, slot: ShopCardSlot, phase: Phase, profile: ArchetypeProfile, plan: StrategyCandidate | null): Recommendation {
  if (slot.kind === 'consumable') {
    const def = getConsumable(slot.consumableId);
    if (!def) return rec('buy-consumable', 'Buy unknown card', 0, ['Unknown catalog id']);
    const action = `Buy ${def.name} ($${slot.price})`;
    if (slot.price > run.money) {
      return rec('buy-consumable', action, 0, [`Not affordable ($${slot.price} > $${run.money})`], def.id);
    }
    let score = def.rating;
    const reasons: string[] = [def.effect];
    const planet = planetBonus(run, profile, def.id);
    score += planet.bonus;
    reasons.push(...planet.notes);
    const planPlanet = planPlanetBonus(def.id, plan);
    score += planPlanet.bonus;
    reasons.push(...planPlanet.notes);
    if (run.consumables.length >= run.consumableSlots) {
      score += TUNING.slotsFull.consumable;
      reasons.push('Your consumable slots are full');
    }
    const econ = economyNotes(run, slot.price, TUNING.interestWeight.card);
    score -= econ.penalty;
    reasons.push(...econ.notes);
    return rec('buy-consumable', action, score, reasons, def.id);
  }

  const def = getJoker(slot.jokerId);
  if (!def) return rec('buy-joker', 'Buy unknown joker', 0, ['Unknown catalog id']);
  const action = `Buy ${def.name} ($${slot.price})`;
  const synMatches = def.tags.filter(t => profile.dominant.includes(t));
  let rawScore = def.rating[phase] + synergyBonus(synMatches.length) + EDITION_SCORE_BONUS[slot.edition];
  const baseReasons: string[] = [`${def.rarity} joker rated ${def.rating[phase]}/10 at this stage`];
  if (synMatches.length > 0) baseReasons.push(`Fits your build: ${synMatches.join(', ')}`);
  if (slot.edition !== 'base') baseReasons.push(`${slot.edition} edition is a bonus`);
  if (slot.stickers?.eternal) {
    rawScore += TUNING.stickers.eternal;
    baseReasons.push('Eternal — cannot be sold or destroyed later');
  }
  if (slot.stickers?.perishable) {
    rawScore += TUNING.stickers.perishable;
    baseReasons.push('Perishable — debuffed after 5 rounds');
  }
  if (slot.stickers?.rental) {
    rawScore += TUNING.stickers.rental;
    baseReasons.push('Rental — costs $3 at the end of every round');
  }
  const planB = planJokerBonus(def.id, def.tags, plan);
  rawScore += planB.bonus;
  baseReasons.push(...planB.notes);
  const deckSig = deckSignalForJoker(def, run.deckProfile);
  rawScore += deckSig.delta;
  if (deckSig.capAt !== undefined) rawScore = Math.min(rawScore, deckSig.capAt);
  baseReasons.push(...deckSig.notes);
  const playSig = playSignalForJoker(def, run);
  rawScore += playSig.delta;
  baseReasons.push(...playSig.notes);
  const hand = referenceHand(run);
  const delta = estimateJokerDelta(run, hand, def.id, slot.edition);
  if (delta > 0) {
    const current = estimateHandScore(run, hand).score;
    // Capped: the estimate breaks ties, it does not carry a card.
    const { relativeGainFactor, cap, fallbackWhenNoBaseline } = TUNING.scoreEstimate;
    rawScore += Math.min(cap, current > 0 ? (delta / current) * relativeGainFactor : fallbackWhenNoBaseline);
    baseReasons.push(`+${delta.toLocaleString('en-US')} estimated on your ${hand}`);
  }
  const econ = economyNotes(run, slot.price, TUNING.interestWeight.card);

  const slotsFull = !hasFreeJokerSlot(run, slot.edition);
  if (!slotsFull) {
    if (slot.price > run.money) {
      return rec('buy-joker', action, 0, [`Not affordable ($${slot.price} > $${run.money})`], def.id);
    }
    return rec('buy-joker', action, rawScore - econ.penalty, [...baseReasons, ...econ.notes], def.id, def.score ? 'partial' : 'heuristic');
  }

  // Slots full: compare against the weakest owned joker.
  const weakest = findWeakestOwned(run, phase, profile);
  if (weakest) {
    const refund = sellValue(weakest.def.cost, weakest.edition, run.jokers[weakest.index].stickers);
    if (slot.price > run.money + refund) {
      return rec('buy-joker', action, 0, [
        `Not affordable even after selling ${weakest.def.name} ($${run.money} + $${refund} < $${slot.price})`,
      ], def.id);
    }
    const netEcon = economyNotes(run, slot.price - refund, TUNING.interestWeight.card);
    const netScore = rawScore - netEcon.penalty;
    if (netScore > weakest.value + TUNING.slotsFull.sellAndBuyMargin) {
      return rec(
        'sell-and-buy',
        `Sell ${weakest.def.name}, buy ${def.name} ($${slot.price})`,
        netScore - weakest.value * TUNING.slotsFull.sellAndBuyValueDrag,
        [
          ...baseReasons,
          ...netEcon.notes,
          `Slots full — ${weakest.def.name} is your weakest (${weakest.value.toFixed(1)} vs ${netScore.toFixed(1)})`,
          `Selling refunds $${refund}`,
        ],
        def.id,
        def.score ? 'partial' : 'heuristic',
      );
    }
  }
  if (slot.price > run.money) {
    return rec('buy-joker', action, 0, [`Not affordable without a sellable joker ($${slot.price} > $${run.money})`], def.id);
  }
  return rec('buy-joker', action, Math.min(rawScore - econ.penalty, TUNING.slotsFull.blockedBuyCap), [
    ...baseReasons,
    ...econ.notes,
    'Joker slots are full and nothing is clearly worth selling for this',
  ], def.id);
}

function evalVoucher(run: RunState, voucherId: string, phase: Phase): Recommendation {
  const def = getVoucher(voucherId);
  if (!def) return rec('buy-voucher', 'Buy unknown voucher', 0, ['Unknown catalog id']);
  const action = `Buy ${def.name} ($${def.cost})`;
  if (def.cost > run.money) {
    return rec('buy-voucher', action, 0, [`Not affordable ($${def.cost} > $${run.money})`], def.id);
  }
  let score = def.rating;
  const reasons: string[] = [def.effect];
  if (phase === 'late') {
    score += TUNING.voucher.latePenalty;
    reasons.push('Late in the run — less time to profit from it');
  }
  const econ = economyNotes(run, def.cost, TUNING.interestWeight.voucher);
  score -= econ.penalty;
  reasons.push(...econ.notes);
  return rec('buy-voucher', action, score, reasons, def.id);
}

function evalPack(run: RunState, packId: string, phase: Phase): Recommendation {
  const def = getPack(packId);
  if (!def) return rec('buy-pack', 'Buy unknown pack', 0, ['Unknown catalog id']);
  const action = `Buy ${def.name} ($${def.cost})`;
  if (def.cost > run.money) {
    return rec('buy-pack', action, 0, [`Not affordable ($${def.cost} > $${run.money})`], def.id);
  }
  let score = def.rating[phase];
  const reasons: string[] = [`${def.options} options, pick ${def.picks}`];
  const econ = economyNotes(run, def.cost, TUNING.interestWeight.pack);
  score -= econ.penalty;
  reasons.push(...econ.notes);
  return rec('buy-pack', action, score, reasons, def.id);
}

function evalReroll(run: RunState, shop: ShopState, bestBuy: number): Recommendation {
  const action = `Reroll ($${shop.rerollCost})`;
  if (shop.rerollCost > run.money) {
    return rec('reroll', action, 0, [`Not affordable ($${shop.rerollCost} > $${run.money})`]);
  }
  let score = TUNING.reroll.base;
  const reasons: string[] = [`Costs $${shop.rerollCost}`];
  if (bestBuy < TUNING.reroll.weakShopThreshold) {
    score += TUNING.reroll.weakShopBonus;
    reasons.push('Current offers are weak — fishing for better is reasonable');
  }
  if (runInterestLost(run, shop.rerollCost) === 0) {
    score += TUNING.reroll.freeOfInterestBonus;
    reasons.push('Rerolling costs you no interest');
  }
  return rec('reroll', action, score, reasons);
}

function evalSkip(run: RunState, bestBuy: number, phase: Phase, plan: StrategyCandidate | null): Recommendation {
  const canEarnInterest = earnsInterest(run);
  const cap = canEarnInterest ? interestCapFor(run.vouchers) : 0;
  const earned = runInterest(run);
  let score = TUNING.skip.base
    + Math.min(TUNING.skip.perInterestDollarCap, earned * TUNING.skip.perInterestDollar);
  const reasons: string[] = canEarnInterest
    ? [`Banking $${run.money} earns $${earned} interest per round`]
    : ['Green Deck earns no interest — cash can be spent without breaking an interest tier'];
  const growthRoom = earned < cap;
  if (growthRoom && phase !== 'late') {
    score += phase === 'early' ? TUNING.skip.growthRoom.early : TUNING.skip.growthRoom.mid;
    reasons.push('Growing your interest pays off every remaining round');
  }
  const toNextTier = run.money >= 0
    ? (INTEREST_TIER_DOLLARS - (run.money % INTEREST_TIER_DOLLARS)) % INTEREST_TIER_DOLLARS
    : 0;
  if (growthRoom && phase !== 'late' && toNextTier > 0 && toNextTier <= TUNING.skip.nearNextTierWithin) {
    score += TUNING.skip.nearNextTierBonus;
    reasons.push(`Save $${toNextTier} more to reach the next interest tier`);
  }
  if (plan?.archetypeId === 'economy') {
    score += TUNING.plan.economySkip;
    reasons.push(`Banking fits your recommended ${plan.name} plan`);
  }
  if (bestBuy >= TUNING.skip.strongBuyThreshold) {
    score += TUNING.skip.strongBuyPenalty;
    reasons.push('But there is a strong buy available');
  } else if (bestBuy < TUNING.skip.weakShopThreshold) {
    reasons.push('Nothing in this shop is a clear upgrade');
  }
  return rec('skip', 'Buy nothing', score, reasons);
}

export function recommend(run: RunState, shop: ShopState): Recommendation[] {
  const phase = phaseForAnte(run.ante);
  const profile = detectArchetype(run);
  const plan = activePlan(run);
  const buys: Recommendation[] = [];
  for (const slot of shop.cards) buys.push(evalShopCard(run, slot, phase, profile, plan));
  if (shop.voucherId) buys.push(evalVoucher(run, shop.voucherId, phase));
  for (const packId of shop.packIds) buys.push(evalPack(run, packId, phase));
  const bestBuy = buys.reduce((max, r) => Math.max(max, r.score), 0);
  return finalize([...buys, evalReroll(run, shop, bestBuy), evalSkip(run, bestBuy, phase, plan)]);
}

/**
 * Ranks the options inside an opened booster pack.
 * `optionIds` may contain joker ids (Buffoon packs) and consumable ids.
 */
export function recommendPackPick(run: RunState, optionIds: string[]): Recommendation[] {
  const phase = phaseForAnte(run.ante);
  const profile = detectArchetype(run);
  const plan = activePlan(run);
  const recs = optionIds.map(id => {
    const joker = getJoker(id);
    if (joker) {
      const synMatches = joker.tags.filter(t => profile.dominant.includes(t));
      let score = joker.rating[phase] + synergyBonus(synMatches.length);
      const reasons: string[] = [`Rated ${joker.rating[phase]}/10 at this stage`];
      if (synMatches.length > 0) reasons.push(`Fits your build: ${synMatches.join(', ')}`);
      const planB = planJokerBonus(joker.id, joker.tags, plan);
      score += planB.bonus;
      reasons.push(...planB.notes);
      const deckSig = deckSignalForJoker(joker, run.deckProfile);
      score += deckSig.delta;
      if (deckSig.capAt !== undefined) score = Math.min(score, deckSig.capAt);
      reasons.push(...deckSig.notes);
      const playSig = playSignalForJoker(joker, run);
      score += playSig.delta;
      reasons.push(...playSig.notes);
      if (usedJokerSlots(run) >= run.jokerSlots) {
        const weakest = findWeakestOwned(run, phase, profile);
        if (weakest && score > weakest.value + TUNING.slotsFull.sellAndBuyMargin) {
          reasons.push(`Slots full — sell ${weakest.def.name} (worth ${weakest.value.toFixed(1)}) to make room`);
        } else {
          reasons.push('Careful: your joker slots are full and nothing is clearly worth selling');
        }
      }
      return rec('pick', `Take ${joker.name}`, score, reasons, id, joker.score ? 'partial' : 'heuristic');
    }
    const c = getConsumable(id);
    if (!c) return rec('pick', `Take ${id}`, 0, ['Unknown catalog id']);
    let score = c.rating;
    const reasons: string[] = [c.effect];
    const planet = planetBonus(run, profile, c.id);
    score += planet.bonus;
    reasons.push(...planet.notes);
    const planPlanet = planPlanetBonus(c.id, plan);
    score += planPlanet.bonus;
    reasons.push(...planPlanet.notes);
    return rec('pick', `Take ${c.name}`, score, reasons, id);
  });
  return finalize(recs);
}
