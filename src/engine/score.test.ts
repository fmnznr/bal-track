import { describe, expect, it } from 'vitest';
import { initialDeckProfile, newRunState } from '../run/runStore';
import {
  blindTargets, estimateHandScore, estimateJokerDelta, handContains, marginalMultiplier,
  referenceHand, scoreBaseline, scoreCeiling, scoreTarget,
} from './score';
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
    expect(blindTargets(0).small).toBe(100);
    expect(blindTargets(99).small).toBe(50000);
  });
  it('uses cumulative Green and Purple Stake score curves', () => {
    expect(blindTargets(8, 'Red', 'Green').small).toBe(100000);
    expect(blindTargets(8, 'Red', 'Gold').small).toBe(200000);
  });
});

describe('referenceHand', () => {
  it('prefers the declared hand, then the highest level, then High Card', () => {
    const base = runWith();
    expect(referenceHand(base)).toBe('High Card');
    const leveled = { ...base, handLevels: { ...base.handLevels, Flush: 4 } };
    expect(referenceHand(leveled)).toBe('Flush');
    expect(referenceHand({ ...leveled, primaryHand: 'Pair' })).toBe('Pair');
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

  it('balances chips and mult on Plasma Deck', () => {
    const plasma = { ...runWith(), deck: 'Plasma' };
    const estimate = estimateHandScore(plasma, 'Pair');
    expect(estimate.score).toBe(Math.round(((estimate.chips + estimate.mult) / 2) ** 2));
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

  it('lets a declared hand override the highest levelled one', () => {
    const base = runWith([], { handLevels: { ...newRunState('Magic', 'White').handLevels, Flush: 8 } });
    expect(referenceHand(base)).toBe('Flush');
    expect(referenceHand({ ...base, primaryHand: 'Five of a Kind' })).toBe('Five of a Kind');
  });

  it('values an average card at the real deck average', () => {
    const standard = estimateHandScore(runWith(), 'High Card');
    // 5 base chips + one card worth ~7.3 on a standard 52-card deck
    expect(standard.chips).toBe(12);
  });
});

describe('per-card and per-count score models', () => {
  const deck = (over: Partial<ReturnType<typeof initialDeckProfile>> = {}) => ({
    ...initialDeckProfile('Red'), ...over,
  });
  const withJokers = (ids: string[], over: Partial<RunState> = {}): RunState => ({
    ...newRunState('Red', 'White'),
    jokers: ids.map(jokerId => ({ jokerId, edition: 'base' as const })),
    ...over,
  });

  it('takes a per-suit effect as an expectation over the tracked deck', () => {
    // Flush scores 5 cards; a standard deck is a quarter diamonds, so Greedy
    // Joker is expected to fire 1.25 times for +3 Mult each.
    const run = withJokers(['greedy-joker']);
    const bare = estimateHandScore({ ...run, jokers: [] }, 'Flush');
    const withIt = estimateHandScore(run, 'Flush');
    expect(withIt.mult - bare.mult).toBeCloseTo(5 * 0.25 * 3);
    expect(withIt.modeled).toContain('Greedy Joker');
  });

  it('follows the deck when a suit is converted away or piled up', () => {
    const run = withJokers(['greedy-joker']);
    const none = estimateHandScore(
      { ...run, deckProfile: deck({ suits: { hearts: 52, diamonds: 0, spades: 0, clubs: 0 } }) }, 'Flush');
    const all = estimateHandScore(
      { ...run, deckProfile: deck({ suits: { hearts: 0, diamonds: 52, spades: 0, clubs: 0 } }) }, 'Flush');
    const bare = estimateHandScore({ ...run, jokers: [] }, 'Flush');
    expect(none.mult).toBe(bare.mult);
    expect(all.mult - bare.mult).toBeCloseTo(5 * 3);
  });

  it('spreads a rank effect evenly across the thirteen ranks', () => {
    // "Each played 10 or 4" is two ranks of thirteen, over four scoring cards.
    const run = withJokers(['walkie-talkie']);
    const bare = estimateHandScore({ ...run, jokers: [] }, 'Two Pair');
    const withIt = estimateHandScore(run, 'Two Pair');
    const expected = 4 * (2 / 13);
    expect(withIt.mult - bare.mult).toBeCloseTo(expected * 4);
    // Chips are rounded to whole numbers before they are reported.
    expect(withIt.chips - bare.chips).toBe(Math.round(expected * 10));
  });

  it('compounds a per-card xMult rather than adding it', () => {
    // Triboulet is X2 per scoring King or Queen, and each trigger multiplies.
    const run = withJokers(['triboulet']);
    const bare = estimateHandScore({ ...run, jokers: [] }, 'Flush');
    const withIt = estimateHandScore(run, 'Flush');
    expect(withIt.mult).toBeCloseTo(bare.mult * 2 ** (5 * (2 / 13)), 1);
  });

  it('adds a per-count xMult into one multiplier instead of compounding it', () => {
    // Steel Joker is X0.2 per steel card: six steel cards is X2.2, not X0.2^6.
    const run = withJokers(['steel-joker'], {
      deckProfile: deck({ enhanced: { ...initialDeckProfile('Red').enhanced, steel: 6 } }),
    });
    const bare = estimateHandScore({ ...run, jokers: [] }, 'Pair');
    const withIt = estimateHandScore(run, 'Pair');
    expect(withIt.mult).toBeCloseTo(bare.mult * (1 + 0.2 * 6));
    expect(withIt.mult).toBeGreaterThan(bare.mult);
  });

  it('reads counts straight off the run', () => {
    const bull = (money: number) =>
      estimateHandScore(withJokers(['bull'], { money }), 'Pair').chips;
    expect(bull(20) - bull(0)).toBe(2 * 20);

    const abstract = (n: number) =>
      estimateHandScore(withJokers(['abstract-joker', ...Array(n).fill('joker')]), 'Pair');
    // Abstract Joker counts every joker including itself, Joker adds +4 Mult each.
    expect(abstract(2).mult - abstract(1).mult).toBeCloseTo(3 + 4);
  });

  it('counts Erosion against cards removed from a full deck', () => {
    const erosion = (deckSize: number) =>
      estimateHandScore(withJokers(['erosion'], { deckProfile: deck({ deckSize }) }), 'Pair').mult;
    expect(erosion(52)).toBeLessThan(erosion(45));
    expect(erosion(45) - erosion(52)).toBeCloseTo(4 * 7);
    // A deck larger than standard is not a penalty.
    expect(erosion(60)).toBe(erosion(52));
  });

  it('counts a modelled joker as modeled, not unmodeled', () => {
    const estimate = estimateHandScore(withJokers(['scary-face', 'blueprint']), 'Pair');
    expect(estimate.modeled).toContain('Scary Face');
    expect(estimate.unmodeled).toContain('Blueprint');
  });
});

describe('the baseline a contribution is measured against', () => {
  it('floors a bare board so a small card is not a miracle', () => {
    const bare = newRunState('Red', 'White');
    // 12 score against a 600 blind: dividing by 12 would read as "+400%".
    expect(estimateHandScore(bare, 'High Card').score).toBeLessThan(50);
    expect(scoreBaseline(bare, 'High Card')).toBe(scoreTarget(bare) * 0.25);
    expect(marginalMultiplier(bare, 'High Card', 48)).toBeLessThan(1.2);
  });

  it('uses the real board once it is above the floor', () => {
    const strong: RunState = {
      ...newRunState('Red', 'White'),
      handLevels: { ...newRunState('Red', 'White').handLevels, Flush: 8 },
    };
    const score = estimateHandScore(strong, 'Flush').score;
    expect(score).toBeGreaterThan(scoreTarget(strong) * 0.25);
    expect(scoreBaseline(strong, 'Flush')).toBe(score);
  });

  it('saturates only at the final blind, not the next one', () => {
    const run: RunState = { ...newRunState('Red', 'White'), ante: 2 };
    expect(scoreCeiling(run)).toBeGreaterThan(scoreTarget(run) * 10);
    // A board that clears the next ante is nowhere near done scaling, so a real
    // contribution must still register as a gain.
    const nearNextTarget = scoreTarget(run);
    const at: RunState = { ...run };
    expect(marginalMultiplier(at, 'Pair', nearNextTarget)).toBeGreaterThan(1.5);
  });

  it('reports no gain for a board that already clears the final blind', () => {
    const run: RunState = { ...newRunState('Red', 'White'), ante: 8 };
    const ceiling = scoreCeiling(run);
    const maxed: RunState = {
      ...run,
      handLevels: { ...run.handLevels, 'Flush Five': 200 },
    };
    expect(estimateHandScore(maxed, 'Flush Five').score).toBeGreaterThan(ceiling);
    expect(marginalMultiplier(maxed, 'Flush Five', ceiling)).toBe(1);
  });

  it('never reports a contribution as a loss', () => {
    const run = newRunState('Red', 'White');
    for (const c of [0, -100, 1, 1e9]) {
      expect(marginalMultiplier(run, 'Pair', c), String(c)).toBeGreaterThanOrEqual(1);
    }
  });
});
