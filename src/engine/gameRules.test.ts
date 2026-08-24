import { describe, expect, it } from 'vitest';
import { earnsInterest, rentalUpkeep, stakeDiscardPenalty, stakeHas, stakeLevel } from './gameRules';

describe('stake rules', () => {
  it('orders stakes and applies cumulative effects', () => {
    expect(stakeLevel('White')).toBe(1);
    expect(stakeLevel('Gold')).toBe(8);
    expect(stakeHas('Orange', 'Black')).toBe(true);
    expect(stakeHas('Green', 'Blue')).toBe(false);
  });

  it('removes one discard from Blue Stake onward', () => {
    expect(stakeDiscardPenalty('Black')).toBe(0);
    expect(stakeDiscardPenalty('Blue')).toBe(1);
    expect(stakeDiscardPenalty('Gold')).toBe(1);
  });
});

describe('deck and sticker economy', () => {
  it('disables interest only for Green Deck', () => {
    expect(earnsInterest({ deck: 'Green' })).toBe(false);
    expect(earnsInterest({ deck: 'Red' })).toBe(true);
  });

  it('tracks Rental upkeep', () => {
    expect(rentalUpkeep({ rental: true })).toBe(3);
    expect(rentalUpkeep()).toBe(0);
  });
});
