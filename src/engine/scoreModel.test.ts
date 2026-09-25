import { describe, expect, it } from 'vitest';
import { getBoss, getJoker } from '../catalog/catalog';
import { initialDeckProfile, newRunState } from '../run/runStore';
import { cardTypes, expectedLowestRankValue, matchShare, PLAIN_RULES } from './cards';
import {
  asCandidate, bossTarget, candidateContribution, estimateHandScore, handSize, ownedContribution,
} from './score';
import type { DeckProfile, RunState } from '../types';

function runWith(jokerIds: string[] = [], overrides: Partial<RunState> = {}): RunState {
  return {
    ...newRunState('Red', 'White'),
    jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })),
    ...overrides,
  };
}

function deck(over: Partial<DeckProfile> = {}): DeckProfile {
  return { ...initialDeckProfile('Red'), ...over };
}

function enhanced(over: Partial<DeckProfile['enhanced']>): DeckProfile {
  const base = initialDeckProfile('Red');
  return { ...base, enhanced: { ...base.enhanced, ...over } };
}

describe('the deck as card types', () => {
  it('sums to one and matches the plain shares of a standard deck', () => {
    const types = cardTypes(initialDeckProfile('Red'));
    expect(types.reduce((s, c) => s + c.p, 0)).toBeCloseTo(1);
    expect(matchShare(types, { kind: 'face' }, PLAIN_RULES)).toBeCloseTo(12 / 52);
    expect(matchShare(types, { kind: 'rank', ranks: ['K', 'Q'] }, PLAIN_RULES)).toBeCloseTo(2 / 13);
    expect(matchShare(types, { kind: 'suit', suit: 'hearts' }, PLAIN_RULES)).toBeCloseTo(0.25);
  });

  it('keeps rank matches consistent with the face count', () => {
    // Abandoned Deck has no face cards, so Triboulet's Kings and Queens never come up.
    const types = cardTypes(initialDeckProfile('Abandoned'));
    expect(matchShare(types, { kind: 'rank', ranks: ['K', 'Q'] }, PLAIN_RULES)).toBe(0);
  });

  it('lets a Wild card match every suit and a Stone card none', () => {
    const types = cardTypes(enhanced({ wild: 52 }));
    expect(matchShare(types, { kind: 'suit', suit: 'clubs' }, PLAIN_RULES)).toBeCloseTo(1);
    const stones = cardTypes(enhanced({ stone: 52 }));
    expect(matchShare(stones, { kind: 'suit', suit: 'clubs' }, PLAIN_RULES)).toBe(0);
  });

  it('finds The Idol\'s card once in a standard deck, and more often in a stacked one', () => {
    // The game draws the round's card from the deck, so a deck of one suit
    // leaves only the rank to match.
    const idol = { kind: 'rotatingCard' } as const;
    expect(matchShare(cardTypes(initialDeckProfile('Red')), idol, PLAIN_RULES)).toBeCloseTo(1 / 52);
    const hearts = deck({ suits: { hearts: 52, diamonds: 0, spades: 0, clubs: 0 } });
    expect(matchShare(cardTypes(hearts), idol, PLAIN_RULES)).toBeCloseTo(1 / 13);
    // A Wild card is every suit, so it needs only the rank; a Stone card has neither.
    expect(matchShare(cardTypes(enhanced({ wild: 52 })), idol, PLAIN_RULES)).toBeCloseTo(1 / 13);
    expect(matchShare(cardTypes(enhanced({ stone: 52 })), idol, PLAIN_RULES)).toBe(0);
  });

  it('prices the lowest held card from the rank spread', () => {
    const types = cardTypes(initialDeckProfile('Red'));
    // One card: the average rank value, (54 + 30 + 11) / 13.
    expect(expectedLowestRankValue(types, 1)).toBeCloseTo(95 / 13);
    expect(expectedLowestRankValue(types, 3)).toBeLessThan(expectedLowestRankValue(types, 1));
    expect(expectedLowestRankValue(types, 0)).toBe(0);
  });
});

describe('enhanced cards score', () => {
  it('adds Bonus chips and multiplies by Glass', () => {
    const plain = estimateHandScore(runWith(), 'Pair');
    expect(estimateHandScore(runWith([], { deckProfile: enhanced({ bonus: 52 }) }), 'Pair').chips)
      .toBe(plain.chips + 60);
    expect(estimateHandScore(runWith([], { deckProfile: enhanced({ glass: 52 }) }), 'Pair').mult)
      .toBe(plain.mult * 4);
  });

  it('counts Steel cards held in hand', () => {
    const steel = estimateHandScore(runWith([], { deckProfile: enhanced({ steel: 52 }) }), 'Pair');
    // Eight cards in hand, two played, six held: X1.5 six times.
    expect(steel.mult).toBeCloseTo(2 * 1.5 ** 6, 1);
  });
});

describe('retriggers', () => {
  it('repeats what a matching card scores, including the jokers that read it', () => {
    const faces = deck({ faceCards: 52 });
    const scary = estimateHandScore(runWith(['scary-face'], { deckProfile: faces }), 'Pair');
    const both = estimateHandScore(runWith(['scary-face', 'sock-and-buskin'], { deckProfile: faces }), 'Pair');
    // Two face cards, each 10 chips + 30 from Scary Face, all scored twice.
    expect(both.chips - scary.chips).toBe(2 * (10 + 30));
  });

  it('retriggers only the ranks Hack names', () => {
    const low = estimateHandScore(runWith(['hack'], { deckProfile: deck({ faceCards: 52 }) }), 'Pair');
    expect(low.chips).toBe(estimateHandScore(runWith([], { deckProfile: deck({ faceCards: 52 }) }), 'Pair').chips);
  });

  it('gives the first card two extra triggers under Hanging Chad', () => {
    const plain = estimateHandScore(runWith(), 'High Card');
    const chad = estimateHandScore(runWith(['hanging-chad']), 'High Card');
    expect(chad.chips - plain.chips).toBeCloseTo(2 * (95 / 13), 0);
  });

  it('weights Dusk by how often a hand is the last one', () => {
    const four = estimateHandScore(runWith(['dusk'], { handsPerRound: 4 }), 'Flush');
    const one = estimateHandScore(runWith(['dusk'], { handsPerRound: 1 }), 'Flush');
    expect(one.chips).toBeGreaterThan(four.chips);
  });
});

describe('cards held in hand', () => {
  it('multiplies by Baron for each King expected in hand', () => {
    const kings = deck({ faceCards: 52 });
    const baron = estimateHandScore(runWith(['baron'], { deckProfile: kings }), 'Pair');
    // Six held cards, a third of them Kings.
    expect(baron.mult).toBeCloseTo(2 * 1.5 ** 2, 1);
  });

  it('holds more cards with Juggler and retriggers them with Mime', () => {
    const kings = deck({ faceCards: 52 });
    const baron = estimateHandScore(runWith(['baron'], { deckProfile: kings }), 'Pair').mult;
    const juggled = estimateHandScore(runWith(['baron', 'juggler'], { deckProfile: kings }), 'Pair').mult;
    const mimed = estimateHandScore(runWith(['baron', 'mime'], { deckProfile: kings }), 'Pair').mult;
    expect(juggled).toBeGreaterThan(baron);
    expect(mimed).toBeCloseTo(2 * 1.5 ** 4, 1);
  });

  it('fires Blackboard on an all-dark deck and rarely otherwise', () => {
    const dark = deck({ suits: { hearts: 0, diamonds: 0, spades: 26, clubs: 26 } });
    expect(estimateHandScore(runWith(['blackboard'], { deckProfile: dark }), 'Pair').mult).toBeCloseTo(6);
    expect(estimateHandScore(runWith(['blackboard']), 'Pair').mult).toBeLessThan(2.1);
  });

  it('adds Raised Fist from the lowest held rank', () => {
    expect(estimateHandScore(runWith(['raised-fist']), 'Pair').mult).toBeGreaterThan(2);
  });

  it('derives hand size from deck, vouchers and jokers', () => {
    expect(handSize(runWith())).toBe(8);
    expect(handSize(runWith(['juggler', 'stuntman'], { deck: 'Painted', vouchers: ['paint-brush'] }))).toBe(10);
  });
});

describe('copy jokers', () => {
  it('lets Blueprint copy the joker to its right', () => {
    expect(estimateHandScore(runWith(['blueprint', 'cavendish']), 'Pair').mult).toBe(18);
    const rightmost = estimateHandScore(runWith(['cavendish', 'blueprint']), 'Pair');
    expect(rightmost.mult).toBe(6);
    expect(rightmost.inactive).toEqual(['Blueprint']);
  });

  it('lets Brainstorm copy the leftmost joker, and chains through copies', () => {
    expect(estimateHandScore(runWith(['cavendish', 'brainstorm']), 'Pair').mult).toBe(18);
    expect(estimateHandScore(runWith(['blueprint', 'blueprint', 'cavendish']), 'Pair').mult).toBe(54);
  });

  it('names a copy of an unmodelled joker as unmodelled', () => {
    expect(estimateHandScore(runWith(['blueprint', 'green-joker']), 'Pair').unmodeled).toContain('Blueprint');
  });
});

describe('conditions, chances and counts', () => {
  it('fires Half Joker only on short hands', () => {
    expect(estimateHandScore(runWith(['half-joker']), 'Pair').mult).toBe(22);
    expect(estimateHandScore(runWith(['half-joker']), 'Flush').inactive).toEqual(['Half Joker']);
  });

  it('doubles listed chances under Oops! All 6s', () => {
    const hearts = deck({ suits: { hearts: 52, diamonds: 0, spades: 0, clubs: 0 } });
    const blood = estimateHandScore(runWith(['bloodstone'], { deckProfile: hearts }), 'Pair').mult;
    const oops = estimateHandScore(runWith(['bloodstone', 'oops-all-6s'], { deckProfile: hearts }), 'Pair').mult;
    expect(blood).toBeCloseTo(2 * 1.25 ** 2);
    expect(oops).toBeCloseTo(2 * 1.5 ** 2);
  });

  it('counts empty slots for Joker Stencil, itself included', () => {
    expect(estimateHandScore(runWith(['joker-stencil']), 'Pair').mult).toBe(10);
    const full = runWith(['joker-stencil', 'jolly-joker', 'jolly-joker', 'jolly-joker', 'jolly-joker']);
    expect(estimateHandScore(full, 'High Card').mult).toBe(1);
  });

  it("waits for sixteen enhanced cards before Driver's License fires", () => {
    expect(estimateHandScore(runWith(['drivers-license']), 'Pair').inactive).toEqual(["Driver's License"]);
    expect(estimateHandScore(runWith(['drivers-license'], { deckProfile: enhanced({ bonus: 16 }) }), 'Pair').modeled)
      .toEqual(["Driver's License"]);
  });

  it('counts faces everywhere under Pareidolia', () => {
    const abandoned = runWith(['scary-face'], { deckProfile: initialDeckProfile('Abandoned') });
    const withIt = { ...abandoned, jokers: [...abandoned.jokers, { jokerId: 'pareidolia', edition: 'base' as const }] };
    expect(estimateHandScore(withIt, 'Pair').chips).toBe(estimateHandScore(abandoned, 'Pair').chips + 60);
  });
});

describe('boss blinds', () => {
  const club = getBoss('the-club')!;

  it('debuffs the cards a boss names', () => {
    const clubs = deck({ suits: { hearts: 0, diamonds: 0, spades: 0, clubs: 52 } });
    const run = runWith([], { deckProfile: clubs });
    expect(estimateHandScore(run, 'Flush', { boss: club }).chips).toBe(35);
    expect(estimateHandScore(run, 'Flush').chips).toBeGreaterThan(35);
  });

  it('lets Chicot cancel the boss', () => {
    const run = runWith(['chicot'], { deckProfile: deck({ suits: { hearts: 0, diamonds: 0, spades: 0, clubs: 52 } }) });
    expect(estimateHandScore(run, 'Flush', { boss: club }).chips).toBe(estimateHandScore(run, 'Flush').chips);
  });

  it('halves the base under The Flint and sizes The Wall', () => {
    expect(estimateHandScore(runWith(), 'Pair', { boss: getBoss('the-flint') }).mult).toBe(1);
    expect(bossTarget(runWith(), getBoss('the-wall')!)).toBe(1200);
    expect(bossTarget(runWith(), getBoss('the-needle')!)).toBe(300);
  });

  it('makes every hand the last one under The Needle', () => {
    const run = runWith(['acrobat']);
    expect(estimateHandScore(run, 'Pair', { boss: getBoss('the-needle') }).mult).toBe(6);
    expect(estimateHandScore(run, 'Pair').mult).toBeCloseTo(2 * (1 + 2 / 4));
  });
});

describe('what a joker contributes', () => {
  it('places a candidate where it does the most', () => {
    const run = runWith(['cavendish']);
    // Left of Cavendish, +4 Mult is multiplied: (2 + 4) * 3 - 2 * 3 = 12 Mult more.
    const joker = candidateContribution(run, 'Pair', asCandidate(getJoker('joker')!, 'base'));
    const bare = estimateHandScore(run, 'Pair');
    expect(joker.score).toBe(bare.chips * 12);
    expect(joker.modelled).toBe(true);
  });

  it('judges an owned joker by what removing it loses', () => {
    const run = runWith(['joker', 'cavendish']);
    const chips = estimateHandScore(run, 'Pair').chips;
    expect(ownedContribution(run, 'Pair', 0).score).toBe(chips * 12);
    expect(ownedContribution(run, 'Pair', 1).score).toBe(chips * 12);
  });

  it('values The Idol as the rare X2 it is, not as a rating', () => {
    // One card in 52 per scoring slot: a Flush's five cards give X2 to the
    // power of 5/52 — about +7%, where the rating alone had it near tripling.
    const idol = candidateContribution(runWith(), 'Flush', asCandidate(getJoker('the-idol')!, 'base'));
    const bare = estimateHandScore(runWith(), 'Flush');
    expect(idol.modelled).toBe(true);
    expect(1 + idol.score / bare.score).toBeCloseTo(2 ** (5 / 52), 2);
  });

  it('leaves a copy joker with nothing to copy to its rating', () => {
    const bp = candidateContribution(runWith(), 'Pair', asCandidate(getJoker('blueprint')!, 'base'));
    expect(bp.modelled).toBe(false);
    const withTarget = candidateContribution(runWith(['cavendish']), 'Pair', asCandidate(getJoker('blueprint')!, 'base'));
    expect(withTarget.modelled).toBe(true);
    expect(withTarget.score).toBeGreaterThan(0);
  });
});
