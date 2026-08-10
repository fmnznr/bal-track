import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { getJoker } from '../catalog/catalog';
import { mostPlayedHand, playConfidence, playShare, playSignalForJoker, totalPlays } from './playSignals';
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

  it('scales an owned Green Joker up and Ice Cream down with hands played', () => {
    const run = runWith({ Flush: 10 });
    expect(playSignalForJoker(greenJoker, run, 'owned').delta).toBeCloseTo(0.8);
    expect(playSignalForJoker(iceCream, run, 'owned').delta).toBeCloseTo(-0.8);
  });

  it('leaves both alone in the shop, where a fresh copy starts over', () => {
    const run = runWith({ Flush: 10 });
    expect(playSignalForJoker(greenJoker, run)).toEqual({ delta: 0, notes: [] });
    expect(playSignalForJoker(iceCream, run)).toEqual({ delta: 0, notes: [] });
  });

  it('scales Banner with discards per round', () => {
    expect(playSignalForJoker(banner, runWith({}, { discardsPerRound: 5 })).delta).toBeCloseTo(1);
    expect(playSignalForJoker(banner, runWith({}, { discardsPerRound: 2 })).delta).toBeCloseTo(-0.5);
  });

  it('ignores untouched jokers', () => {
    expect(playSignalForJoker(blueprint, runWith({ Flush: 10 }))).toEqual({ delta: 0, notes: [] });
  });
});

describe('playSignals — review follow-ups', () => {
  it('ramps the statistic in with sample size', () => {
    expect(playConfidence(runWith({ Flush: 7 }))).toBe(0);
    expect(playConfidence(runWith({ Flush: 9 }))).toBeCloseTo(0.75);
    expect(playConfidence(runWith({ Flush: 12 }))).toBe(1);
    expect(playConfidence(runWith({ Flush: 40 }))).toBe(1);
  });

  it('counts the Red deck extra discard as a real advantage', () => {
    const red = newRunState('Red', 'White');
    const banner = getJoker('banner')!;
    expect(red.discardsPerRound).toBe(4);
    expect(playSignalForJoker(banner, red).delta).toBeCloseTo(0.5);
  });
});
