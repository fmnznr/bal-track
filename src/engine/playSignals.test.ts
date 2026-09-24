import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { getJoker } from '../catalog/catalog';
import { playMultiplierForJoker } from './playSignals';
import { TUNING } from './tuning';
import type { HandType, RunState } from '../types';

function runWith(primaryHand: HandType | null = null, resource: Partial<RunState> = {}): RunState {
  return { ...newRunState('Magic', 'White'), primaryHand, ...resource };
}

describe('playMultiplierForJoker', () => {
  const supernova = getJoker('supernova')!;
  const obelisk = getJoker('obelisk')!;
  const banner = getJoker('banner')!;
  const delayed = getJoker('delayed-gratification')!;
  const blueprint = getJoker('blueprint')!;

  it('is neutral at default resources with no hand declared', () => {
    const fresh = runWith();
    for (const def of [supernova, obelisk, delayed, blueprint]) {
      expect(playMultiplierForJoker(def, fresh), def.id).toEqual({ multiplier: 1, reasons: [] });
    }
  });

  it('rewards Supernova once a hand is declared', () => {
    const signal = playMultiplierForJoker(supernova, runWith('Flush'));
    expect(signal.multiplier).toBe(TUNING.play.consistentHand);
    expect(signal.multiplier).toBeGreaterThan(1);
    expect(signal.reasons.join(' ')).toMatch(/Flush/);
  });

  it('warns that Obelisk wants variety in a declared build', () => {
    const signal = playMultiplierForJoker(obelisk, runWith('Flush'));
    expect(signal.multiplier).toBe(TUNING.play.varietyJoker);
    expect(signal.multiplier).toBeLessThan(1);
    expect(signal.reasons.join(' ')).toMatch(/variety/i);
  });

  it('leaves Delayed Gratification to the projection rather than signalling it twice', () => {
    // Its $2 per unused discard is money there; charging the discard count
    // again here would pay for the same fact twice, as Banner used to.
    expect(playMultiplierForJoker(delayed, runWith(null, { discardsPerRound: 5 })))
      .toEqual({ multiplier: 1, reasons: [] });
  });

  it('leaves Banner to the score model rather than signalling it twice', () => {
    expect(playMultiplierForJoker(banner, runWith(null, { discardsPerRound: 5 })))
      .toEqual({ multiplier: 1, reasons: [] });
  });

  it('ignores untouched jokers', () => {
    expect(playMultiplierForJoker(blueprint, runWith('Flush'))).toEqual({ multiplier: 1, reasons: [] });
  });

});
