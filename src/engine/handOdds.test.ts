import { describe, expect, it } from 'vitest';
import { initialDeckProfile, newRunState } from '../run/runStore';
import { cardTypes } from './cards';
import { handOdds, PLAIN_ODDS } from './handOdds';
import { effectiveScore } from './score';

const standard = cardTypes(initialDeckProfile('Red'));
const odds = (handSize: number, discards: number, hand: Parameters<typeof handOdds>[4], rules = PLAIN_ODDS) =>
  handOdds(standard, 52, handSize, discards, hand, rules);

describe('handOdds', () => {
  it('matches the exact odds of a dealt hand, where no strategy is involved', () => {
    // A pair somewhere in 8 cards: 1 - C(13,8)·4^8 / C(52,8) = 88.8%.
    expect(odds(8, 0, 'Pair')).toBeCloseTo(0.888, 1);
    // Five or more of one suit in 8 cards: about 6.9%.
    expect(odds(8, 0, 'Flush')).toBeCloseTo(0.069, 1);
    expect(odds(8, 0, 'High Card')).toBe(1);
  });

  it('gets easier with every discard and every card in hand', () => {
    for (const hand of ['Flush', 'Straight', 'Three of a Kind', 'Full House'] as const) {
      expect(odds(8, 1, hand), hand).toBeGreaterThan(odds(8, 0, hand));
      expect(odds(8, 3, hand), hand).toBeGreaterThan(odds(8, 1, hand));
      expect(odds(9, 1, hand), hand).toBeGreaterThanOrEqual(odds(8, 1, hand));
    }
  });

  it('is what Four Fingers, Shortcut and Smeared Joker are for', () => {
    expect(odds(8, 1, 'Flush', { ...PLAIN_ODDS, fourFingers: true })).toBeGreaterThan(odds(8, 1, 'Flush'));
    expect(odds(8, 1, 'Straight', { ...PLAIN_ODDS, fourFingers: true })).toBeGreaterThan(odds(8, 1, 'Straight'));
    expect(odds(8, 1, 'Straight', { ...PLAIN_ODDS, shortcut: true })).toBeGreaterThan(odds(8, 1, 'Straight'));
    expect(odds(8, 1, 'Flush', { ...PLAIN_ODDS, smeared: true })).toBeGreaterThan(odds(8, 1, 'Flush'));
  });

  it('follows the deck: a deck of one suit always holds a flush', () => {
    const hearts = cardTypes({ ...initialDeckProfile('Red'), suits: { hearts: 52, diamonds: 0, spades: 0, clubs: 0 } });
    expect(handOdds(hearts, 52, 8, 0, 'Flush')).toBe(1);
  });

  it('interpolates a fraction of a discard, a round\'s discards spread over its hands', () => {
    const half = odds(8, 0.5, 'Flush');
    expect(half).toBeCloseTo((odds(8, 0, 'Flush') + odds(8, 1, 'Flush')) / 2, 5);
  });

  it('gives the same answer every time', () => {
    expect(odds(8, 2, 'Straight')).toBe(odds(8, 2, 'Straight'));
  });
});

describe('effectiveScore', () => {
  it('scores a Flush below its made value, since it does not always come together', () => {
    const run = { ...newRunState('Red', 'White'), primaryHand: 'Flush' as const };
    const e = effectiveScore(run);
    expect(e.odds).toBeGreaterThan(0);
    expect(e.odds).toBeLessThan(1);
    expect(e.score).toBeLessThan(e.made);
  });

  it('leaves High Card alone, which always comes together', () => {
    const run = { ...newRunState('Red', 'White'), primaryHand: 'High Card' as const };
    expect(effectiveScore(run).odds).toBe(1);
  });
});
