import handValuesJson from '../data/handValues.json';
import blindsJson from '../data/blinds.json';
import { getJoker } from '../catalog/catalog';
import { HAND_TYPES } from '../types';
import type { Edition, HandType, HandValueDef, RunState } from '../types';
import { mostPlayedHand } from './playSignals';

const handValues = handValuesJson as unknown as HandValueDef[];
const blinds = blindsJson as { anteBase: number[]; multipliers: { small: number; big: number; boss: number } };
const byHand = new Map(handValues.map(h => [h.hand, h]));

/** Chips an average played card contributes, nudged by the deck's face-card share. */
function averageCardChips(run: RunState): number {
  const { deckSize, faceCards } = run.deckProfile;
  if (deckSize <= 0) return 7.3;
  const faceShare = Math.min(1, faceCards / deckSize);
  // Numbered cards average ~6, face cards 10, and aces sit just above face value.
  return 6 + faceShare * 4.5;
}

export function blindTargets(ante: number): { small: number; big: number; boss: number } {
  const index = Math.min(8, Math.max(1, Math.floor(ante)));
  const base = blinds.anteBase[index];
  return {
    small: Math.round(base * blinds.multipliers.small),
    big: Math.round(base * blinds.multipliers.big),
    boss: Math.round(base * blinds.multipliers.boss),
  };
}

/** The hand the estimate should describe: what you play, else what you levelled. */
export function referenceHand(run: RunState): HandType {
  const played = mostPlayedHand(run);
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
  unmodeled: string[];
}

export function estimateHandScore(run: RunState, hand: HandType): ScoreEstimate {
  const def = byHand.get(hand);
  if (!def) return { chips: 0, mult: 0, score: 0, modeled: [], unmodeled: [] };

  const level = run.handLevels[hand] ?? 1;
  let chips = def.baseChips + def.chipsPerLevel * (level - 1) + def.scoringCards * averageCardChips(run);
  let mult = def.baseMult + def.multPerLevel * (level - 1);
  let xmult = 1;
  const modeled: string[] = [];
  const unmodeled: string[] = [];

  for (const owned of run.jokers) {
    const joker = getJoker(owned.jokerId);
    if (!joker) continue;
    const score = joker.score;
    const applies = score !== undefined && (!score.requiresHand || score.requiresHand === hand);

    if (!score) {
      unmodeled.push(joker.name);
    } else if (applies) {
      chips += score.chips ?? 0;
      mult += score.mult ?? 0;
      xmult *= score.xmult ?? 1;
      modeled.push(joker.name);
    }
    // A joker's requiresHand gates its own ability, but its edition (foil/holo/polychrome)
    // is a flat bonus on the card itself: it scores every hand regardless of whether the
    // joker's own effect fires. Base/negative editions add zero, so this is a no-op for them.
    chips += EDITION_CHIPS[owned.edition];
    mult += EDITION_MULT[owned.edition];
    xmult *= EDITION_XMULT[owned.edition];
  }

  mult *= xmult;
  const rounded = { chips: Math.round(chips), mult: Math.round(mult * 100) / 100 };
  return { ...rounded, score: Math.round(rounded.chips * rounded.mult), modeled, unmodeled };
}

/** Estimated score gain from adding this joker to the current run. */
export function estimateJokerDelta(run: RunState, hand: HandType, jokerId: string, edition: Edition): number {
  const joker = getJoker(jokerId);
  if (!joker?.score) return 0;
  const before = estimateHandScore(run, hand).score;
  const after = estimateHandScore({ ...run, jokers: [...run.jokers, { jokerId, edition }] }, hand).score;
  return after - before;
}
