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
  const blueprint = getJoker('blueprint')!;

  it('is neutral at default resources with no hand declared', () => {
    const fresh = runWith();
    for (const def of [supernova, obelisk, banner, blueprint]) {
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

  it('scales Banner with discards per round, independent of the declared hand', () => {
    expect(playMultiplierForJoker(banner, runWith(null, { discardsPerRound: 5 })).multiplier)
      .toBeCloseTo(TUNING.play.perExtraDiscard ** 2);
    expect(playMultiplierForJoker(banner, runWith(null, { discardsPerRound: 2 })).multiplier)
      .toBeCloseTo(TUNING.play.perExtraDiscard ** -1);
  });

  it('ignores untouched jokers', () => {
    expect(playMultiplierForJoker(blueprint, runWith('Flush'))).toEqual({ multiplier: 1, reasons: [] });
  });

  it('counts the Red deck extra discard as a real advantage', () => {
    const red = newRunState('Red', 'White');
    expect(red.discardsPerRound).toBe(4);
    expect(playMultiplierForJoker(banner, red).multiplier).toBeCloseTo(TUNING.play.perExtraDiscard);
  });
});
