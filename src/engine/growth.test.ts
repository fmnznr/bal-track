import { describe, expect, it } from 'vitest';
import { getJoker } from '../catalog/catalog';
import { initialDeckProfile, newRunState } from '../run/runStore';
import { recommend } from './recommend';
import { boardOf, estimateHandScore, growthOf } from './score';
import type { HandType, OwnedJoker, RunState } from '../types';

function run(overrides: Partial<RunState> = {}): RunState {
  return { ...newRunState('Red', 'White'), ante: 4, round: 8, handsPerRound: 4, discardsPerRound: 4, ...overrides };
}

const grown = (r: RunState, id: string, owned?: OwnedJoker) => growthOf(r, getJoker(id)!, owned)!;

describe('jokers that grow from nothing', () => {
  it('grows Castle by the discarded cards of its suit', () => {
    // Four discards of three cards, a quarter of them the round's suit, +3 each.
    const castle = grown(run(), 'castle');
    expect(castle.unit).toBe('Chips');
    expect(castle.perRound).toBeCloseTo(9);
    // Bought now, it is judged where it will stand by the next ante.
    expect(castle.now).toBe(0);
    expect(castle.atTarget).toBeCloseTo(27);
  });

  it('draws Castle\'s suit from the deck, so a one-suit deck feeds it every discard', () => {
    const oneSuit = { ...initialDeckProfile('Red'), suits: { hearts: 52, diamonds: 0, spades: 0, clubs: 0 } };
    expect(grown(run({ deckProfile: oneSuit }), 'castle').perRound).toBeCloseTo(36);
  });

  it('grows Runner only on a hand with a Straight in it', () => {
    expect(grown(run({ primaryHand: 'Flush' }), 'runner').perRound).toBe(0);
    const straight = grown(run({ primaryHand: 'Straight' }), 'runner');
    // Only the Straights that come together count; the misses are played as a Pair.
    expect(straight.perRound).toBeGreaterThan(0);
    expect(straight.perRound).toBeLessThan(15 * 4);
  });

  it('grows Square Joker on any hand that can be played as four cards', () => {
    expect(grown(run({ primaryHand: 'Two Pair' }), 'square-joker').perRound).toBeGreaterThan(0);
    // A Flush always takes five; only its misses, played as a Pair, can be four.
    const flush = grown(run({ primaryHand: 'Flush' }), 'square-joker').perRound;
    const pair = grown(run({ primaryHand: 'Pair' }), 'square-joker').perRound;
    expect(flush).toBeLessThan(pair);
  });

  it('takes back a Mult from Green Joker for the discards spent with it', () => {
    const noDiscards = grown(run({ discardsPerRound: 0 }), 'green-joker').perRound;
    expect(grown(run(), 'green-joker').perRound).toBeCloseTo(noDiscards - 1);
    // It never goes below nothing.
    expect(grown(run({ handsPerRound: 1, discardsPerRound: 8 }), 'green-joker').perRound).toBe(0);
  });

  it('grows Wee Joker by the 2s among the scoring cards', () => {
    const pair = (hand: HandType) => grown(run({ primaryHand: hand }), 'wee-joker').perRound;
    expect(pair('Pair')).toBeGreaterThan(0);
    expect(pair('Flush')).toBeGreaterThan(pair('Pair'));
  });
});

describe('a growing joker you own', () => {
  it('grows on from its purchase, and from a value you enter', () => {
    const bought = grown(run({ round: 11 }), 'castle', { jokerId: 'castle', edition: 'base', growth: { value: 0, round: 8 } });
    expect(bought.source).toBe('recorded');
    expect(bought.now).toBeCloseTo(27);
    const entered = grown(run({ round: 9 }), 'castle', { jokerId: 'castle', edition: 'base', growth: { value: 60, round: 8 } });
    expect(entered.now).toBeCloseTo(69);
    expect(entered.atTarget).toBeCloseTo(96);
  });

  it('is assumed to have grown for an ante when nothing is recorded', () => {
    const assumed = grown(run(), 'castle', { jokerId: 'castle', edition: 'base' });
    expect(assumed.source).toBe('assumed');
    expect(assumed.now).toBeCloseTo(27);
  });

  it('shows today\'s score with what it has grown to, and values it at the next ante', () => {
    const r = run({
      primaryHand: 'Pair',
      jokers: [{ jokerId: 'castle', edition: 'base', growth: { value: 60, round: 8 } }],
    });
    expect(boardOf(r, 'now')[0].score).toEqual({ chips: 60 });
    expect(boardOf(r)[0].score?.chips).toBeCloseTo(87);
    expect(boardOf(r, 'none')[0].score).toEqual({});
    // Pair at level 1: 10 Chips, 2 Mult, and the cards' own chips.
    const bare = estimateHandScore({ ...r, jokers: [] }, 'Pair');
    expect(estimateHandScore(r, 'Pair').chips).toBe(bare.chips + 60);
  });
});

describe('the shop that put Castle on top', () => {
  it('no longer sells Hanging Chad for a Castle that starts at nothing', () => {
    // Ante 4 in a real run: Castle, unmodelled, rode its 5/10 rating to +139%
    // and "Sell Hanging Chad, buy Castle" topped the list, above a Jumbo
    // Celestial Pack. It gains about +9 Chips a round with four discards.
    const r = run({
      money: 17,
      vouchers: ['clearance-sale'],
      primaryHand: 'Two Pair',
      jokers: ['ice-cream', 'clever-joker', 'hanging-chad', 'ceremonial-dagger', 'perkeo']
        .map(jokerId => ({ jokerId, edition: 'base' as const })),
    });
    const recs = recommend(r, {
      rerollCost: 5, voucherId: 'magic-trick', packIds: ['celestial-jumbo'],
      cards: [{ kind: 'joker', jokerId: 'castle', edition: 'base', price: 4 }],
    });
    const castle = recs.filter(x => x.action.includes('Castle'));
    expect(castle.length).toBeGreaterThan(0);
    for (const x of castle) expect(x.score).toBeLessThan(1);
    expect(recs[0].action).not.toMatch(/Castle/);
  });
});
