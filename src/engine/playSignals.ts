import type { JokerDef, RunState } from '../types';
import { TUNING } from './tuning';

export interface PlaySignal {
  multiplier: number;
  reasons: string[];
}

const NEUTRAL: PlaySignal = { multiplier: 1, reasons: [] };

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
export function playMultiplierForJoker(def: JokerDef, run: RunState): PlaySignal {
  const primary = run.primaryHand;

  switch (def.id) {
    // Scales with repeat plays of one hand, so a declared plan is what makes it good.
    case 'supernova':
      if (!primary) return NEUTRAL;
      return {
        multiplier: TUNING.play.consistentHand,
        reasons: [`You build around ${primary}, so Supernova keeps climbing`],
      };
    // Wants the opposite: it rewards never repeating a hand.
    case 'obelisk':
      if (!primary) return NEUTRAL;
      return {
        multiplier: TUNING.play.varietyJoker,
        reasons: [`Obelisk wants hand variety, but you build around ${primary}`],
      };
    // Banner used to be here too. Its +30 Chips per discard is now modelled from
    // the real discard count, so this would charge the same fact twice.
    // Delayed Gratification used to be here too. Its $2 per unused discard is
    // now money in the projection, so this would charge the same fact twice —
    // the same reason Banner left.
    default:
      return NEUTRAL;
  }
}
