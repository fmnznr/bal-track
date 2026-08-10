import { HAND_TYPES } from '../types';
import type { HandType, JokerDef, RunState } from '../types';

export function totalPlays(run: RunState): number {
  return HAND_TYPES.reduce((sum, hand) => sum + (run.handPlays[hand] ?? 0), 0);
}

export function mostPlayedHand(run: RunState): HandType | null {
  let best: HandType | null = null;
  for (const hand of HAND_TYPES) {
    const plays = run.handPlays[hand] ?? 0;
    if (plays > 0 && (best === null || plays > run.handPlays[best])) best = hand;
  }
  return best;
}

export function playShare(run: RunState, hands: readonly HandType[]): number {
  const total = totalPlays(run);
  if (total === 0) return 0;
  return hands.reduce((sum, hand) => sum + (run.handPlays[hand] ?? 0), 0) / total;
}

/** Below this many hands the statistic is noise, not a signal. */
export const MIN_PLAYS = 3;

export interface PlaySignal {
  delta: number;
  notes: string[];
}

const NEUTRAL: PlaySignal = { delta: 0, notes: [] };

/**
 * Score adjustment from what the player actually does — hands played and the
 * per-round resource. Returns a neutral signal at default values so a fresh
 * run scores exactly as before.
 */
export function playSignalForJoker(def: JokerDef, run: RunState): PlaySignal {
  const total = totalPlays(run);
  const extraDiscards = run.discardsPerRound - 3;

  switch (def.id) {
    case 'supernova': {
      const best = mostPlayedHand(run);
      if (!best || total < MIN_PLAYS) return NEUTRAL;
      const plays = run.handPlays[best];
      return {
        delta: Math.min(3, plays * 0.15),
        notes: [`Your most played hand (${best}) has ${plays} plays`],
      };
    }
    case 'obelisk': {
      if (total < MIN_PLAYS) return NEUTRAL;
      const best = mostPlayedHand(run);
      const share = best ? run.handPlays[best] / total : 0;
      if (share <= 0.6) return NEUTRAL;
      return {
        delta: -2,
        notes: [`Obelisk wants hand variety, but ${Math.round(share * 100)}% of your hands are ${best}`],
      };
    }
    case 'green-joker':
      if (total < MIN_PLAYS) return NEUTRAL;
      return { delta: Math.min(2, total * 0.08), notes: [`${total} hands played so far`] };
    case 'ice-cream':
      if (total < MIN_PLAYS) return NEUTRAL;
      return { delta: -Math.min(2, total * 0.08), notes: [`Ice Cream has already melted through ${total} hands`] };
    case 'banner':
    case 'delayed-gratification': {
      if (extraDiscards === 0) return NEUTRAL;
      return {
        delta: extraDiscards * 0.5,
        notes: [`${run.discardsPerRound} discards per round`],
      };
    }
    default:
      return NEUTRAL;
  }
}
