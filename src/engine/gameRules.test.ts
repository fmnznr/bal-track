import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { applyVoucher, earnsInterest, rentalUpkeep, stakeDiscardPenalty, stakeHas, stakeLevel } from './gameRules';

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

describe('applyVoucher', () => {
  const run = { ...newRunState('Red', 'White'), ante: 3, boss: 'the-club' };

  it('books hands, discards and slots the way the game does', () => {
    expect(applyVoucher(run, 'grabber').handsPerRound).toBe(run.handsPerRound + 1);
    expect(applyVoucher(run, 'wasteful').discardsPerRound).toBe(run.discardsPerRound + 1);
    expect(applyVoucher(run, 'antimatter').jokerSlots).toBe(run.jokerSlots + 1);
    expect(applyVoucher(run, 'crystal-ball').consumableSlots).toBe(run.consumableSlots + 1);
  });

  it('sends Hieroglyph back an ante, where a new boss waits', () => {
    const next = applyVoucher(run, 'hieroglyph');
    expect(next.ante).toBe(2);
    expect(next.handsPerRound).toBe(run.handsPerRound - 1);
    expect(next.boss).toBeNull();
  });

  it('records the voucher and leaves the money alone', () => {
    const next = applyVoucher(run, 'grabber');
    expect(next.vouchers).toContain('grabber');
    expect(next.money).toBe(run.money);
  });
});
