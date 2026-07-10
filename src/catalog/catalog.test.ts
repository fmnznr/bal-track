import { describe, expect, it } from 'vitest';
import { getConsumable, getJoker, getPack, getVoucher, jokers, shopJokers } from './catalog';

describe('catalog lookups', () => {
  it('finds jokers by id', () => {
    expect(getJoker('blueprint')?.name).toBe('Blueprint');
    expect(getJoker('does-not-exist')).toBeUndefined();
  });
  it('finds vouchers, consumables and packs by id', () => {
    expect(getVoucher('antimatter')?.requires).toBe('blank');
    expect(getConsumable('jupiter')?.hand).toBe('Flush');
    expect(getPack('celestial-normal')?.cost).toBe(4);
  });
  it('excludes legendary jokers from the shop pool', () => {
    expect(shopJokers).toHaveLength(145);
    expect(shopJokers.some(j => j.rarity === 'legendary')).toBe(false);
    expect(jokers).toHaveLength(150);
  });
});
