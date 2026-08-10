import { describe, expect, it } from 'vitest';
import { initialDeckProfile } from './runStore';
import { CONVERSION_TARGETS, applyProfileEffects, hasProfileEffect } from './profileEffects';

describe('applyProfileEffects', () => {
  it('books enhancement tarots', () => {
    const p = applyProfileEffects(initialDeckProfile('Red'), 'the-chariot');
    expect(p.enhanced.steel).toBe(1);
    expect(applyProfileEffects(p, 'the-magician').enhanced.lucky).toBe(2);
  });

  it('books size and face effects with a floor of zero', () => {
    let p = applyProfileEffects(initialDeckProfile('Red'), 'familiar');
    expect(p.deckSize).toBe(54);
    expect(p.faceCards).toBe(15);
    p = applyProfileEffects({ ...p, deckSize: 3 }, 'immolate');
    expect(p.deckSize).toBe(0);
  });

  it('leaves the profile alone for unknown or conversion ids', () => {
    const base = initialDeckProfile('Red');
    expect(applyProfileEffects(base, 'the-hermit')).toEqual(base);
    expect(applyProfileEffects(base, 'the-sun')).toEqual(base);
  });

  it('maps the four conversion tarots to their target suits', () => {
    expect(CONVERSION_TARGETS['the-sun']).toBe('hearts');
    expect(CONVERSION_TARGETS['the-star']).toBe('diamonds');
    expect(CONVERSION_TARGETS['the-moon']).toBe('clubs');
    expect(CONVERSION_TARGETS['the-world']).toBe('spades');
  });
});

describe('hasProfileEffect', () => {
  it('knows which consumables book a profile change', () => {
    expect(hasProfileEffect('the-chariot')).toBe(true);
    expect(hasProfileEffect('familiar')).toBe(true);
    expect(hasProfileEffect('aura')).toBe(false);
    expect(hasProfileEffect('the-sun')).toBe(false);
  });
});
