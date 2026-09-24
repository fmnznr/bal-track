import { describe, expect, it } from 'vitest';
import { initialDeckProfile } from '../run/runStore';
import { getJoker } from '../catalog/catalog';
import { deckMultiplierForJoker, maxSuitShare } from './deckSignals';
import { TUNING } from './tuning';

const greedy = getJoker('greedy-joker')!;
const photograph = getJoker('photograph')!;
const steelJoker = getJoker('steel-joker')!;
const glassJoker = getJoker('glass-joker')!;
const driversLicense = getJoker('drivers-license')!;
const blueprint = getJoker('blueprint')!;

describe('deckMultiplierForJoker', () => {
  it('is neutral for untagged jokers and standard decks', () => {
    const std = initialDeckProfile('Red');
    expect(deckMultiplierForJoker(blueprint, std)).toEqual({ multiplier: 1, reasons: [] });
    expect(deckMultiplierForJoker(greedy, std).multiplier).toBe(1);
  });

  it('guts suit jokers when their suit is gone', () => {
    const checkered = initialDeckProfile('Checkered');
    const sig = deckMultiplierForJoker(greedy, checkered);
    expect(sig.multiplier).toBe(TUNING.deck.suit.none);
    expect(sig.multiplier).toBeLessThan(0.5);
    expect(sig.reasons.join(' ')).toMatch(/No diamonds cards left/);
  });

  it('rewards suit-heavy decks and penalizes thin suits', () => {
    const p = initialDeckProfile('Red');
    const heavy = { ...p, suits: { ...p.suits, diamonds: 26, clubs: 0 } };
    expect(deckMultiplierForJoker(greedy, heavy).multiplier).toBe(TUNING.deck.suit.abundant);
    const thin = { ...p, suits: { ...p.suits, diamonds: 4 } };
    expect(deckMultiplierForJoker(greedy, thin).multiplier).toBe(TUNING.deck.suit.scarce);
  });

  it('handles face-card density including zero-face decks', () => {
    expect(deckMultiplierForJoker(photograph, initialDeckProfile('Abandoned')).multiplier)
      .toBe(TUNING.deck.face.none);
    const p = initialDeckProfile('Red');
    expect(deckMultiplierForJoker(photograph, { ...p, faceCards: 18 }).multiplier)
      .toBe(TUNING.deck.face.abundant);
  });

  it('scores enhanced specialists from real counts', () => {
    const p = initialDeckProfile('Red');
    expect(deckMultiplierForJoker(glassJoker, p).multiplier).toBe(TUNING.deck.enhanced.noneYet);
    const four = deckMultiplierForJoker(glassJoker, { ...p, enhanced: { ...p.enhanced, glass: 4 } });
    expect(four.multiplier).toBeCloseTo(TUNING.deck.enhanced.perMatchingCard ** 4);
    expect(four.multiplier).toBeGreaterThan(1);
  });

  it("leaves Steel Joker and Driver's License to the score model rather than signalling them twice", () => {
    const p = initialDeckProfile('Red');
    expect(deckMultiplierForJoker(steelJoker, { ...p, enhanced: { ...p.enhanced, steel: 6 } }))
      .toEqual({ multiplier: 1, reasons: [] });
    expect(deckMultiplierForJoker(driversLicense, p)).toEqual({ multiplier: 1, reasons: [] });
  });
});

describe('maxSuitShare', () => {
  it('finds the dominant suit', () => {
    const { suit, share } = maxSuitShare(initialDeckProfile('Checkered'));
    expect(['hearts', 'spades']).toContain(suit);
    expect(share).toBeCloseTo(0.5);
  });
});

describe('deckMultiplierForJoker — review fixes', () => {
  const blackboard = getJoker('blackboard')!;
  const pareidolia = getJoker('pareidolia')!;

  it('sums multi-suit tags instead of reading only the first', () => {
    const p = initialDeckProfile('Red');
    const monoClubs = { ...p, suits: { hearts: 0, diamonds: 0, spades: 0, clubs: 52 } };
    const sig = deckMultiplierForJoker(blackboard, monoClubs);
    expect(sig.multiplier).toBe(TUNING.deck.suit.abundant);
    expect(sig.reasons.join(' ')).toMatch(/spades\/clubs/);
    expect(deckMultiplierForJoker(blackboard, initialDeckProfile('Checkered')).multiplier).toBe(1);
  });

  it('exempts face enablers from the face signal', () => {
    const sig = deckMultiplierForJoker(pareidolia, initialDeckProfile('Abandoned'));
    expect(sig.multiplier).toBe(1);
  });

  it('does not fabricate reasons when deckSize is zero', () => {
    const p = { ...initialDeckProfile('Red'), deckSize: 0 };
    const sig = deckMultiplierForJoker(getJoker('greedy-joker')!, p);
    expect(sig.multiplier).toBe(1);
    expect(sig.reasons).toEqual([]);
  });

  it('uses singular wording for one glass card', () => {
    const p = initialDeckProfile('Red');
    const sig = deckMultiplierForJoker(glassJoker, { ...p, enhanced: { ...p.enhanced, glass: 1 } });
    expect(sig.reasons.join(' ')).toMatch(/1 glass card in your deck/);
  });
});
