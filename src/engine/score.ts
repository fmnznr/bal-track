import handValuesJson from '../data/handValues.json';
import blindsJson from '../data/blinds.json';
import { getJoker } from '../catalog/catalog';
import { HAND_TYPES } from '../types';
import type { Edition, HandType, HandValueDef, RunState } from '../types';
import { MIN_PLAYS, mostPlayedHand, totalPlays } from './playSignals';

const handValues = handValuesJson as unknown as HandValueDef[];
const blinds = blindsJson as { anteBase: number[]; multipliers: { small: number; big: number; boss: number } };
const byHand = new Map(handValues.map(h => [h.hand, h]));

/**
 * Which hand types a played hand also counts as. Balatro's joker conditions read
 * "if played hand contains a Pair", so a Full House triggers every Pair joker.
 * The gaps are deliberate: Four of a Kind is not Two Pair, and Five of a Kind is
 * neither Two Pair nor a Full House.
 */
const HAND_CONTAINS: Record<HandType, readonly HandType[]> = {
  'High Card': ['High Card'],
  Pair: ['Pair'],
  'Two Pair': ['Pair', 'Two Pair'],
  'Three of a Kind': ['Pair', 'Three of a Kind'],
  Straight: ['Straight'],
  Flush: ['Flush'],
  'Full House': ['Pair', 'Two Pair', 'Three of a Kind', 'Full House'],
  'Four of a Kind': ['Pair', 'Three of a Kind', 'Four of a Kind'],
  'Straight Flush': ['Straight', 'Flush', 'Straight Flush'],
  'Five of a Kind': ['Pair', 'Three of a Kind', 'Four of a Kind', 'Five of a Kind'],
  'Flush House': ['Pair', 'Two Pair', 'Three of a Kind', 'Full House', 'Flush', 'Flush House'],
  'Flush Five': ['Pair', 'Three of a Kind', 'Four of a Kind', 'Five of a Kind', 'Flush', 'Flush Five'],
};

/** Whether a joker requiring `required` fires on a played `hand`. */
export function handContains(hand: HandType, required: HandType): boolean {
  return HAND_CONTAINS[hand].includes(required);
}

/** Chips an average played card contributes, nudged by the deck's face-card share. */
function averageCardChips(run: RunState): number {
  const { deckSize, faceCards } = run.deckProfile;
  // 2-10 and aces average 6.5 chips; J/Q/K contribute 10.
  if (deckSize <= 0) return 6.5;
  const faceShare = Math.min(1, Math.max(0, faceCards / deckSize));
  return 6.5 + faceShare * 3.5;
}

export function blindTargets(ante: number, deck?: string): { small: number; big: number; boss: number } {
  const safeAnte = Number.isFinite(ante) ? Math.floor(ante) : 1;
  const base = blinds.anteBase[Math.min(8, Math.max(1, safeAnte))];
  // Plasma doubles every blind requirement.
  const deckFactor = deck === 'Plasma' ? 2 : 1;
  return {
    small: Math.round(base * blinds.multipliers.small * deckFactor),
    big: Math.round(base * blinds.multipliers.big * deckFactor),
    boss: Math.round(base * blinds.multipliers.boss * deckFactor),
  };
}

/** The hand the estimate should describe: what you play, else what you levelled. */
export function referenceHand(run: RunState): HandType {
  // Same noise floor as every other play-statistic signal.
  const played = totalPlays(run) >= MIN_PLAYS ? mostPlayedHand(run) : null;
  if (played) return played;
  let best: HandType = 'High Card';
  for (const hand of HAND_TYPES) {
    if (run.handLevels[hand] > run.handLevels[best]) best = hand;
  }
  return best;
}

const EDITION_CHIPS: Record<Edition, number> = { base: 0, foil: 50, holographic: 0, polychrome: 0, negative: 0 };
const EDITION_MULT: Record<Edition, number> = { base: 0, foil: 0, holographic: 10, polychrome: 0, negative: 0 };
const EDITION_XMULT: Record<Edition, number> = { base: 1, foil: 1, holographic: 1, polychrome: 1.5, negative: 1 };

export interface ScoreEstimate {
  chips: number;
  mult: number;
  score: number;
  modeled: string[];
  /** Modelled, but this hand does not trigger them. */
  inactive: string[];
  unmodeled: string[];
}

export function estimateHandScore(run: RunState, hand: HandType): ScoreEstimate {
  const def = byHand.get(hand);
  if (!def) return { chips: 0, mult: 0, score: 0, modeled: [], inactive: [], unmodeled: [] };

  const level = run.handLevels[hand] ?? 1;
  let chips = def.baseChips + def.chipsPerLevel * (level - 1) + def.scoringCards * averageCardChips(run);
  let mult = def.baseMult + def.multPerLevel * (level - 1);
  const modeled: string[] = [];
  const inactive: string[] = [];
  const unmodeled: string[] = [];

  // Jokers trigger left to right, so additive and multiplicative effects are applied
  // in board order — the same order jokerOrder.ts advises on.
  for (const owned of run.jokers) {
    const joker = getJoker(owned.jokerId);
    if (!joker) continue;
    const score = joker.score;
    const applies = score !== undefined && (!score.requiresHand || handContains(hand, score.requiresHand));

    if (!score) {
      unmodeled.push(joker.name);
    } else if (applies) {
      chips += score.chips ?? 0;
      mult += score.mult ?? 0;
      mult *= score.xmult ?? 1;
      modeled.push(joker.name);
    } else {
      inactive.push(joker.name);
    }
    // A joker's requiresHand gates its own ability, but its edition (foil/holo/polychrome)
    // is a flat bonus on the card itself: it scores every hand regardless of whether the
    // joker's own effect fires. Base/negative editions add zero, so this is a no-op for them.
    chips += EDITION_CHIPS[owned.edition];
    mult += EDITION_MULT[owned.edition];
    mult *= EDITION_XMULT[owned.edition];
  }

  const rounded = { chips: Math.round(chips), mult: Math.round(mult * 100) / 100 };
  return { ...rounded, score: Math.round(rounded.chips * rounded.mult), modeled, inactive, unmodeled };
}

/** Estimated score gain from adding this joker to the current run. */
export function estimateJokerDelta(run: RunState, hand: HandType, jokerId: string, edition: Edition): number {
  const joker = getJoker(jokerId);
  if (!joker?.score) return 0;
  const before = estimateHandScore(run, hand).score;
  const after = estimateHandScore({ ...run, jokers: [...run.jokers, { jokerId, edition }] }, hand).score;
  return after - before;
}
