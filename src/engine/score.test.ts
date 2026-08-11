import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { blindTargets, estimateHandScore, estimateJokerDelta, referenceHand } from './score';
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

  it('applies plus-mult before xmult regardless of list order', () => {
    const additiveFirst = estimateHandScore(runWith(['joker', 'cavendish']), 'Pair');
    const multiplicativeFirst = estimateHandScore(runWith(['cavendish', 'joker']), 'Pair');
    expect(additiveFirst.mult).toBe(18); // (2 + 4) * 3
    expect(multiplicativeFirst.mult).toBe(18);
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
