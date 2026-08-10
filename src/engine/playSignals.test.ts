import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { getJoker } from '../catalog/catalog';
import { mostPlayedHand, playShare, playSignalForJoker, totalPlays } from './playSignals';
import type { HandType, RunState } from '../types';

function runWith(plays: Partial<Record<HandType, number>> = {}, resource: Partial<RunState> = {}): RunState {
  const base = newRunState('Magic', 'White');
  return { ...base, handPlays: { ...base.handPlays, ...plays }, ...resource };
}

describe('play statistics', () => {
  it('sums plays and finds the most played hand', () => {
    const run = runWith({ Flush: 8, Pair: 4 });
    expect(totalPlays(run)).toBe(12);
    expect(mostPlayedHand(run)).toBe('Flush');
    expect(playShare(run, ['Flush'])).toBeCloseTo(8 / 12);
    expect(mostPlayedHand(runWith())).toBeNull();
  });
});

describe('playSignalForJoker', () => {
  const supernova = getJoker('supernova')!;
  const obelisk = getJoker('obelisk')!;
  const greenJoker = getJoker('green-joker')!;
  const iceCream = getJoker('ice-cream')!;
  const banner = getJoker('banner')!;
  const blueprint = getJoker('blueprint')!;

  it('is neutral at default resources with nothing played', () => {
    const fresh = runWith();
    for (const def of [supernova, obelisk, greenJoker, iceCream, banner, blueprint]) {
      expect(playSignalForJoker(def, fresh), def.id).toEqual({ delta: 0, notes: [] });
    }
  });

  it('rewards Supernova for a well-played hand', () => {
    const signal = playSignalForJoker(supernova, runWith({ Flush: 10 }));
    expect(signal.delta).toBeCloseTo(1.5);
    expect(signal.notes.join(' ')).toMatch(/10 plays/);
  });

  it('warns that Obelisk wants variety in a focused build', () => {
    const signal = playSignalForJoker(obelisk, runWith({ Flush: 9, Pair: 1 }));
    expect(signal.delta).toBe(-2);
    expect(signal.notes.join(' ')).toMatch(/90%/);
  });

  it('scales Green Joker up and Ice Cream down with hands played', () => {
    const run = runWith({ Flush: 10 });
    expect(playSignalForJoker(greenJoker, run).delta).toBeCloseTo(0.8);
    expect(playSignalForJoker(iceCream, run).delta).toBeCloseTo(-0.8);
  });

  it('scales Banner with discards per round', () => {
    expect(playSignalForJoker(banner, runWith({}, { discardsPerRound: 5 })).delta).toBeCloseTo(1);
    expect(playSignalForJoker(banner, runWith({}, { discardsPerRound: 2 })).delta).toBeCloseTo(-0.5);
  });

  it('ignores untouched jokers', () => {
    expect(playSignalForJoker(blueprint, runWith({ Flush: 10 }))).toEqual({ delta: 0, notes: [] });
  });
});
