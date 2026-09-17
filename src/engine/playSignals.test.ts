import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { getJoker } from '../catalog/catalog';
import { playSignalForJoker } from './playSignals';
import type { HandType, RunState } from '../types';

function runWith(primaryHand: HandType | null = null, resource: Partial<RunState> = {}): RunState {
  return { ...newRunState('Magic', 'White'), primaryHand, ...resource };
}

describe('playSignalForJoker', () => {
  const supernova = getJoker('supernova')!;
  const obelisk = getJoker('obelisk')!;
  const banner = getJoker('banner')!;
  const blueprint = getJoker('blueprint')!;

  it('is neutral at default resources with no hand declared', () => {
    const fresh = runWith();
    for (const def of [supernova, obelisk, banner, blueprint]) {
      expect(playSignalForJoker(def, fresh), def.id).toEqual({ delta: 0, notes: [] });
    }
  });

  it('rewards Supernova once a hand is declared', () => {
    const signal = playSignalForJoker(supernova, runWith('Flush'));
    expect(signal.delta).toBeCloseTo(1);
    expect(signal.notes.join(' ')).toMatch(/Flush/);
  });

  it('warns that Obelisk wants variety in a declared build', () => {
    const signal = playSignalForJoker(obelisk, runWith('Flush'));
    expect(signal.delta).toBe(-1.5);
    expect(signal.notes.join(' ')).toMatch(/variety/i);
  });

  it('scales Banner with discards per round, independent of the declared hand', () => {
    expect(playSignalForJoker(banner, runWith(null, { discardsPerRound: 5 })).delta).toBeCloseTo(1);
    expect(playSignalForJoker(banner, runWith(null, { discardsPerRound: 2 })).delta).toBeCloseTo(-0.5);
  });

  it('ignores untouched jokers', () => {
    expect(playSignalForJoker(blueprint, runWith('Flush'))).toEqual({ delta: 0, notes: [] });
  });

  it('counts the Red deck extra discard as a real advantage', () => {
    const red = newRunState('Red', 'White');
    expect(red.discardsPerRound).toBe(4);
    expect(playSignalForJoker(banner, red).delta).toBeCloseTo(0.5);
  });
});
