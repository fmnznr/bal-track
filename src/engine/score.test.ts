import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { blindTargets, estimateHandScore, estimateJokerDelta, handContains, referenceHand } from './score';
import type { RunState } from '../types';

function runWith(jokerIds: string[] = [], overrides: Partial<RunState> = {}): RunState {
  return {
    ...newRunState('Magic', 'White'),
    jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })),
    ...overrides,
  };
}

describe('blindTargets', () => {
  it('scales the ante base by blind type', () => {
    expect(blindTargets(1)).toEqual({ small: 300, big: 450, boss: 600 });
    expect(blindTargets(3).boss).toBe(4000);
  });
  it('clamps out-of-range antes', () => {
    expect(blindTargets(0).small).toBe(300);
    expect(blindTargets(99).small).toBe(50000);
  });
});

describe('referenceHand', () => {
  it('prefers the most played hand, then the highest level, then High Card', () => {
    const base = runWith();
    expect(referenceHand(base)).toBe('High Card');
    const leveled = { ...base, handLevels: { ...base.handLevels, Flush: 4 } };
    expect(referenceHand(leveled)).toBe('Flush');
    const played = { ...leveled, handPlays: { ...base.handPlays, Pair: 9 } };
    expect(referenceHand(played)).toBe('Pair');
  });
});

describe('estimateHandScore', () => {
  it('uses base values and card chips with no jokers', () => {
    const estimate = estimateHandScore(runWith(), 'Pair');
    // 10 base chips + 2 cards of roughly 7 chips each, times 2 mult
    expect(estimate.chips).toBeGreaterThan(20);
    expect(estimate.mult).toBe(2);
    expect(estimate.score).toBe(estimate.chips * estimate.mult);
    expect(estimate.modeled).toEqual([]);
    expect(estimate.unmodeled).toEqual([]);
  });

  it('scales with hand level', () => {
    const base = runWith();
    const leveled = { ...base, handLevels: { ...base.handLevels, Pair: 3 } };
    expect(estimateHandScore(leveled, 'Pair').score).toBeGreaterThan(estimateHandScore(base, 'Pair').score);
  });

  it('adds modeled jokers and names the unmodeled ones', () => {
    const estimate = estimateHandScore(runWith(['joker', 'green-joker']), 'Pair');
    expect(estimate.mult).toBe(6); // 2 base + 4
    expect(estimate.modeled).toContain('Joker');
    expect(estimate.unmodeled).toContain('Green Joker');
  });

  it('applies jokers in board order, the way the game does', () => {
    const additiveFirst = estimateHandScore(runWith(['joker', 'cavendish']), 'Pair');
    const multiplicativeFirst = estimateHandScore(runWith(['cavendish', 'joker']), 'Pair');
    expect(additiveFirst.mult).toBe(18); // (2 + 4) * 3
    expect(multiplicativeFirst.mult).toBe(10); // 2 * 3 + 4 — the order warning is earned
  });

  it('honours hand requirements', () => {
    const withJolly = runWith(['jolly-joker']);
    expect(estimateHandScore(withJolly, 'Pair').mult).toBeGreaterThan(estimateHandScore(withJolly, 'Flush').mult - 3);
    expect(estimateHandScore(withJolly, 'Flush').modeled).toEqual([]);
  });

  it('counts editions', () => {
    const base = runWith(['joker']);
    const polychrome = { ...base, jokers: [{ jokerId: 'joker', edition: 'polychrome' as const }] };
    expect(estimateHandScore(polychrome, 'Pair').mult).toBeGreaterThan(estimateHandScore(base, 'Pair').mult);
  });
});

describe('estimateJokerDelta', () => {
  it('reports the gain a joker would add', () => {
    const run = runWith();
    expect(estimateJokerDelta(run, 'Pair', 'joker', 'base')).toBeGreaterThan(0);
  });
  it('is zero for unmodeled jokers', () => {
    expect(estimateJokerDelta(runWith(), 'Pair', 'green-joker', 'base')).toBe(0);
  });
});

describe('score — review fixes', () => {
  it('fires hand-family jokers on every hand that contains their requirement', () => {
    expect(handContains('Full House', 'Pair')).toBe(true);
    expect(handContains('Four of a Kind', 'Three of a Kind')).toBe(true);
    expect(handContains('Straight Flush', 'Flush')).toBe(true);
    expect(handContains('Flush House', 'Full House')).toBe(true);
    // The documented exceptions.
    expect(handContains('Four of a Kind', 'Two Pair')).toBe(false);
    expect(handContains('Five of a Kind', 'Full House')).toBe(false);
    expect(handContains('Five of a Kind', 'Two Pair')).toBe(false);
    expect(handContains('Pair', 'Two Pair')).toBe(false);
  });

  it('counts a pair joker towards a full house', () => {
    const estimate = estimateHandScore(runWith(['jolly-joker', 'the-duo']), 'Full House');
    expect(estimate.modeled).toEqual(['Jolly Joker', 'The Duo']);
    expect(estimate.inactive).toEqual([]);
    expect(estimate.mult).toBe(24); // (4 + 8) * 2
  });

  it('names jokers that this hand does not trigger instead of hiding them', () => {
    const estimate = estimateHandScore(runWith(['jolly-joker', 'green-joker']), 'Flush');
    expect(estimate.modeled).toEqual([]);
    expect(estimate.inactive).toEqual(['Jolly Joker']);
    expect(estimate.unmodeled).toEqual(['Green Joker']);
  });

  it('doubles the blind targets on the Plasma deck', () => {
    expect(blindTargets(1, 'Plasma')).toEqual({ small: 600, big: 900, boss: 1200 });
    expect(blindTargets(1, 'Red')).toEqual({ small: 300, big: 450, boss: 600 });
    expect(blindTargets(Number.NaN).small).toBe(300);
  });

  it('ignores a handful of recorded plays when picking the reference hand', () => {
    const base = runWith([], { handLevels: { ...newRunState('Magic', 'White').handLevels, Flush: 8 } });
    const onePlay = { ...base, handPlays: { ...base.handPlays, 'Five of a Kind': 1 } };
    expect(referenceHand(onePlay)).toBe('Flush');
    const manyPlays = { ...base, handPlays: { ...base.handPlays, 'Five of a Kind': 9 } };
    expect(referenceHand(manyPlays)).toBe('Five of a Kind');
  });

  it('values an average card at the real deck average', () => {
    const standard = estimateHandScore(runWith(), 'High Card');
    // 5 base chips + one card worth ~7.3 on a standard 52-card deck
    expect(standard.chips).toBe(12);
  });
});
