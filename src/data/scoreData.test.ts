import { describe, expect, it } from 'vitest';
import handValues from './handValues.json';
import blinds from './blinds.json';
import { HAND_TYPES } from '../types';

describe('handValues.json', () => {
  it('covers every poker hand exactly once', () => {
    expect(handValues).toHaveLength(12);
    expect(new Set(handValues.map(h => h.hand))).toEqual(new Set(HAND_TYPES));
  });

  it('has plausible, positive values everywhere', () => {
    for (const h of handValues) {
      expect(h.baseChips, h.hand).toBeGreaterThan(0);
      expect(h.baseMult, h.hand).toBeGreaterThan(0);
      expect(h.chipsPerLevel, h.hand).toBeGreaterThan(0);
      expect(h.multPerLevel, h.hand).toBeGreaterThan(0);
      expect(h.scoringCards, h.hand).toBeGreaterThanOrEqual(1);
      expect(h.scoringCards, h.hand).toBeLessThanOrEqual(5);
    }
  });

  it('pins the values the engine tests rely on', () => {
    const byHand = new Map(handValues.map(h => [h.hand, h]));
    expect(byHand.get('High Card')).toMatchObject({ baseChips: 5, baseMult: 1, scoringCards: 1 });
    expect(byHand.get('Pair')).toMatchObject({ baseChips: 10, baseMult: 2, scoringCards: 2 });
    expect(byHand.get('Flush')).toMatchObject({ baseChips: 35, baseMult: 4, scoringCards: 5 });
  });

  it('orders stronger hands above weaker ones at level 1', () => {
    const score = (h: (typeof handValues)[number]) => h.baseChips * h.baseMult;
    const byHand = new Map(handValues.map(h => [h.hand, h]));
    expect(score(byHand.get('Pair')!)).toBeLessThan(score(byHand.get('Two Pair')!));
    expect(score(byHand.get('Two Pair')!)).toBeLessThan(score(byHand.get('Straight')!));
    expect(score(byHand.get('Four of a Kind')!)).toBeLessThan(score(byHand.get('Straight Flush')!));
  });
});

describe('blinds.json', () => {
  it('covers antes 1 to 8 and rises monotonically', () => {
    expect(blinds.anteBase).toHaveLength(9); // index 0 unused
    for (let ante = 2; ante <= 8; ante++) {
      expect(blinds.anteBase[ante], `ante ${ante}`).toBeGreaterThan(blinds.anteBase[ante - 1]);
    }
    expect(blinds.anteBase[1]).toBe(300);
    expect(blinds.anteBase[8]).toBe(50000);
  });

  it('scales small, big and boss blinds', () => {
    expect(blinds.multipliers.small).toBe(1);
    expect(blinds.multipliers.big).toBe(1.5);
    expect(blinds.multipliers.boss).toBe(2);
  });
});
