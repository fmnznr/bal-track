import { getConsumable, getJoker, getPack, getVoucher } from '../catalog/catalog';
import { phaseForAnte } from '../types';
import type {
  Edition, Phase, RecKind, Recommendation, RunState, ShopCardSlot, ShopState,
} from '../types';
import { detectArchetype, TAG_HAND_AFFINITY } from './archetype';
import type { ArchetypeProfile } from './archetype';
import { interest, interestCapFor, interestLost, sellValue } from './economy';
import { adviseStrategy, getArchetype } from './strategy';
import type { ArchetypeDef, StrategyCandidate } from '../types';

export const EDITION_SCORE_BONUS: Record<Edition, number> = {
  base: 0,
  foil: 0.5,
  holographic: 0.8,
  polychrome: 1.5,
  negative: 2.5, // also does not use a slot
};

function rec(kind: RecKind, action: string, score: number, reasons: string[], refId?: string): Recommendation {
  return { kind, action, score, confidence: 'low', reasons, refId };
}

function finalize(recs: Recommendation[]): Recommendation[] {
  return [...recs]
    .sort((a, b) => b.score - a.score)
    .map(r => ({ ...r, confidence: r.score >= 7 ? 'high' : r.score >= 4 ? 'medium' : 'low' }));
}

function economyNotes(run: RunState, price: number, weight: number): { penalty: number; notes: string[] } {
  const cap = interestCapFor(run.vouchers);
  const lost = interestLost(run.money, price, cap);
  if (lost <= 0) return { penalty: 0, notes: [] };
  return {
    penalty: lost * weight,
    notes: [`Drops your interest by $${lost}/round ($${run.money} → $${run.money - price})`],
  };
}

function usedJokerSlots(run: RunState): number {
  return run.jokers.filter(j => j.edition !== 'negative').length;
}

/** Heuristic value of an owned joker in the current context (used to find the weakest). */
function ownedJokerValue(run: RunState, index: number, phase: Phase, profile: ArchetypeProfile): number {
  const owned = run.jokers[index];
  const def = getJoker(owned.jokerId);
  if (!def) return 0;
  const synergy = def.tags.filter(t => profile.dominant.includes(t)).length;
  return def.rating[phase] + Math.min(3, synergy * 1.2) + EDITION_SCORE_BONUS[owned.edition];
}

function planetBonus(run: RunState, profile: ArchetypeProfile, consumableId: string): { bonus: number; notes: string[] } {
  const def = getConsumable(consumableId);
  if (def?.kind !== 'planet' || !def.hand) return { bonus: 0, notes: [] };
  let bonus = 0;
  const notes: string[] = [];
  if (profile.dominant.some(t => (TAG_HAND_AFFINITY[t] ?? []).includes(def.hand!))) {
    bonus += 2;
    notes.push(`Levels ${def.hand} — matches your build`);
  }
  const level = run.handLevels[def.hand];
  if (level > 1) {
    bonus += Math.min(2, (level - 1) * 0.5);
    notes.push(`${def.hand} is already level ${level} — keep stacking it`);
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
    return { bonus: 1.2, notes: [`On the watchlist for your recommended ${plan.name} plan`] };
  }
  if (tags.some(t => (arch.coreTags as readonly string[]).includes(t))) {
    return { bonus: 0.8, notes: [`Fits your recommended ${plan.name} plan`] };
  }
  return { bonus: 0, notes: [] };
}

function planPlanetBonus(consumableId: string, plan: StrategyCandidate | null): { bonus: number; notes: string[] } {
  if (!plan) return { bonus: 0, notes: [] };
  const def = getConsumable(consumableId);
  if (def?.kind !== 'planet' || !def.hand || !plan.hands.includes(def.hand)) return { bonus: 0, notes: [] };
  return { bonus: 1.5, notes: [`Levels ${def.hand} for your recommended ${plan.name} plan`] };
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
      score -= 1;
      reasons.push('Your consumable slots are full');
    }
    const econ = economyNotes(run, slot.price, 0.8);
    score -= econ.penalty;
    reasons.push(...econ.notes);
    return rec('buy-consumable', action, score, reasons, def.id);
  }

  const def = getJoker(slot.jokerId);
  if (!def) return rec('buy-joker', 'Buy unknown joker', 0, ['Unknown catalog id']);
  const action = `Buy ${def.name} ($${slot.price})`;
  if (slot.price > run.money) {
    return rec('buy-joker', action, 0, [`Not affordable ($${slot.price} > $${run.money})`], def.id);
  }

  const synMatches = def.tags.filter(t => profile.dominant.includes(t));
  let rawScore = def.rating[phase] + Math.min(3, synMatches.length * 1.2) + EDITION_SCORE_BONUS[slot.edition];
  const baseReasons: string[] = [`${def.rarity} joker rated ${def.rating[phase]}/10 at this stage`];
  if (synMatches.length > 0) baseReasons.push(`Fits your build: ${synMatches.join(', ')}`);
  if (slot.edition !== 'base') baseReasons.push(`${slot.edition} edition is a bonus`);
  const planB = planJokerBonus(def.id, def.tags, plan);
  rawScore += planB.bonus;
  baseReasons.push(...planB.notes);
  const econ = economyNotes(run, slot.price, 0.8);

  const slotsFull = usedJokerSlots(run) >= run.jokerSlots && slot.edition !== 'negative';
  if (!slotsFull) {
    return rec('buy-joker', action, rawScore - econ.penalty, [...baseReasons, ...econ.notes], def.id);
  }

  // Slots full: compare against the weakest owned joker.
  let weakestIndex = -1;
  let weakestValue = Infinity;
  run.jokers.forEach((o, i) => {
    if (o.edition === 'negative') return;
    const v = ownedJokerValue(run, i, phase, profile);
    if (v < weakestValue) {
      weakestValue = v;
      weakestIndex = i;
    }
  });
  const weakest = run.jokers[weakestIndex];
  const weakestDef = weakest ? getJoker(weakest.jokerId) : undefined;
  if (weakestDef) {
    // The sell refund offsets part of the price, so economy impact is on the NET cost.
    const refund = sellValue(weakestDef.cost, weakest.edition);
    const netEcon = economyNotes(run, slot.price - refund, 0.8);
    const netScore = rawScore - netEcon.penalty;
    if (netScore > weakestValue + 1) {
      return rec(
        'sell-and-buy',
        `Sell ${weakestDef.name}, buy ${def.name} ($${slot.price})`,
        netScore - weakestValue * 0.4,
        [
          ...baseReasons,
          ...netEcon.notes,
          `Slots full — ${weakestDef.name} is your weakest (${weakestValue.toFixed(1)} vs ${netScore.toFixed(1)})`,
          `Selling refunds $${refund}`,
        ],
        def.id,
      );
    }
  }
  return rec('buy-joker', action, Math.min(rawScore - econ.penalty, 2), [
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
    score -= 1.5;
    reasons.push('Late in the run — less time to profit from it');
  }
  const econ = economyNotes(run, def.cost, 0.5);
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
  const econ = economyNotes(run, def.cost, 0.6);
  score -= econ.penalty;
  reasons.push(...econ.notes);
  return rec('buy-pack', action, score, reasons, def.id);
}

function evalReroll(run: RunState, shop: ShopState, bestBuy: number): Recommendation {
  const action = `Reroll ($${shop.rerollCost})`;
  if (shop.rerollCost > run.money) {
    return rec('reroll', action, 0, [`Not affordable ($${shop.rerollCost} > $${run.money})`]);
  }
  let score = 1.5;
  const reasons: string[] = [`Costs $${shop.rerollCost}`];
  if (bestBuy < 4) {
    score += 2.5;
    reasons.push('Current offers are weak — fishing for better is reasonable');
  }
  if (interestLost(run.money, shop.rerollCost, interestCapFor(run.vouchers)) === 0) {
    score += 1;
    reasons.push('Rerolling costs you no interest');
  }
  return rec('reroll', action, score, reasons);
}

function evalSkip(run: RunState, bestBuy: number, phase: Phase, plan: StrategyCandidate | null): Recommendation {
  const cap = interestCapFor(run.vouchers);
  const earned = interest(run.money, cap);
  let score = 3 + Math.min(1, earned * 0.15);
  const reasons: string[] = [`Banking $${run.money} earns $${earned} interest per round`];
  const growthRoom = earned < cap;
  if (growthRoom && phase !== 'late') {
    score += phase === 'early' ? 1 : 0.5;
    reasons.push('Growing your interest pays off every remaining round');
  }
  const toNextTier = run.money >= 0 ? (5 - (run.money % 5)) % 5 : 0;
  if (growthRoom && toNextTier > 0 && toNextTier <= 2) {
    score += 0.5;
    reasons.push(`Save $${toNextTier} more to reach the next interest tier`);
  }
  if (plan?.archetypeId === 'economy') {
    score += 1;
    reasons.push(`Banking fits your recommended ${plan.name} plan`);
  }
  if (bestBuy >= 7) {
    score -= 1.5;
    reasons.push('But there is a strong buy available');
  } else if (bestBuy < 4) {
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
      let score = joker.rating[phase] + Math.min(3, synMatches.length * 1.2);
      const reasons: string[] = [`Rated ${joker.rating[phase]}/10 at this stage`];
      if (synMatches.length > 0) reasons.push(`Fits your build: ${synMatches.join(', ')}`);
      if (usedJokerSlots(run) >= run.jokerSlots) reasons.push('Careful: your joker slots are full');
      const planB = planJokerBonus(joker.id, joker.tags, plan);
      score += planB.bonus;
      reasons.push(...planB.notes);
      return rec('pick', `Take ${joker.name}`, score, reasons, id);
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
