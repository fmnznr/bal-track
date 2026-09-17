import type { JokerDef, RunState } from '../types';
import { TUNING } from './tuning';

export interface PlaySignal {
  delta: number;
  notes: string[];
}

const NEUTRAL: PlaySignal = { delta: 0, notes: [] };

/**
 * Score adjustment from how the player actually plays.
 *
 * This used to read per-hand play counters, which meant maintaining thirteen
 * numbers by hand during a run. It now reads the single declared primary hand
 * plus the per-round resources the app books itself from vouchers and the deck.
 * The estimates are coarser in exchange: a declared hand tells us the player is
 * consistent, not how many times they have played it.
 *
 * Returns a neutral signal when nothing has been declared, so a fresh run and
 * an undeclared run both score exactly as they did before.
 */
export function playSignalForJoker(def: JokerDef, run: RunState): PlaySignal {
  const primary = run.primaryHand;
  const extraDiscards = run.discardsPerRound - TUNING.play.baselineDiscardsPerRound;

  switch (def.id) {
    // Scales with repeat plays of one hand, so a declared plan is what makes it good.
    case 'supernova':
      if (!primary) return NEUTRAL;
      return {
        delta: TUNING.play.consistentHandBonus,
        notes: [`You build around ${primary}, so Supernova keeps climbing`],
      };
    // Wants the opposite: it rewards never repeating a hand.
    case 'obelisk':
      if (!primary) return NEUTRAL;
      return {
        delta: TUNING.play.varietyJokerPenalty,
        notes: [`Obelisk wants hand variety, but you build around ${primary}`],
      };
    case 'banner':
    case 'delayed-gratification': {
      if (extraDiscards === 0) return NEUTRAL;
      return {
        delta: extraDiscards * TUNING.play.perExtraDiscard,
        notes: [`${run.discardsPerRound} discards per round`],
      };
    }
    default:
      return NEUTRAL;
  }
}
