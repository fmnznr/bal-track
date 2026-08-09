import { describe, expect, it } from 'vitest';
import { initialDeckProfile } from '../run/runStore';
import { getJoker } from '../catalog/catalog';
import { deckSignalForJoker, maxSuitShare } from './deckSignals';

const greedy = getJoker('greedy-joker')!;
const photograph = getJoker('photograph')!;
const steelJoker = getJoker('steel-joker')!;
const driversLicense = getJoker('drivers-license')!;
const blueprint = getJoker('blueprint')!;

describe('deckSignalForJoker', () => {
  it('is neutral for untagged jokers and standard decks', () => {
    const std = initialDeckProfile('Red');
    expect(deckSignalForJoker(blueprint, std)).toEqual({ delta: 0, capAt: undefined, notes: [] });
    expect(deckSignalForJoker(greedy, std).delta).toBe(0);
  });

  it('caps suit jokers when their suit is gone', () => {
    const checkered = initialDeckProfile('Checkered');
    const sig = deckSignalForJoker(greedy, checkered);
    expect(sig.capAt).toBe(1);
    expect(sig.notes.join(' ')).toMatch(/No diamonds cards left/);
  });

  it('rewards suit-heavy decks and penalizes thin suits', () => {
    const p = initialDeckProfile('Red');
    const heavy = { ...p, suits: { ...p.suits, diamonds: 26, clubs: 0 } };
    expect(deckSignalForJoker(greedy, heavy).delta).toBe(1.5);
    const thin = { ...p, suits: { ...p.suits, diamonds: 4 } };
    expect(deckSignalForJoker(greedy, thin).delta).toBe(-2);
  });

  it('handles face-card density including zero-face decks', () => {
    expect(deckSignalForJoker(photograph, initialDeckProfile('Abandoned')).capAt).toBe(1);
    const p = initialDeckProfile('Red');
    expect(deckSignalForJoker(photograph, { ...p, faceCards: 18 }).delta).toBe(1);
  });

  it('scores enhanced specialists from real counts', () => {
    const p = initialDeckProfile('Red');
    expect(deckSignalForJoker(steelJoker, p).delta).toBe(-1);
    expect(deckSignalForJoker(steelJoker, { ...p, enhanced: { ...p.enhanced, steel: 4 } }).delta).toBe(2);
    const sig = deckSignalForJoker(driversLicense, p);
    expect(sig.delta).toBe(-2);
    expect(sig.notes.join(' ')).toMatch(/0\/16 enhanced/);
  });
});

describe('maxSuitShare', () => {
  it('finds the dominant suit', () => {
    const { suit, share } = maxSuitShare(initialDeckProfile('Checkered'));
    expect(['hearts', 'spades']).toContain(suit);
    expect(share).toBeCloseTo(0.5);
  });
});
