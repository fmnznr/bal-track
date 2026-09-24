import { describe, expect, it } from 'vitest';
import { getConsumable, getJoker, getPack, getVoucher } from '../catalog/catalog';
import { consumablePrice, discountPercent, jokerPrice, packPrice, voucherPrice } from './prices';

const plain = { vouchers: [], jokers: [] };
const clearance = { vouchers: ['clearance-sale'], jokers: [] };
const liquidation = { vouchers: ['clearance-sale', 'liquidation'], jokers: [] };
const astronomer = { vouchers: [], jokers: [{ jokerId: 'astronomer', edition: 'base' as const }] };

describe('shop prices', () => {
  it('charges the catalog price with no discount', () => {
    expect(jokerPrice(plain, getJoker('blueprint')!)).toBe(10);
    expect(voucherPrice(plain, getVoucher('overstock')!)).toBe(10);
    expect(packPrice(plain, getPack('arcana-normal')!)).toBe(4);
  });

  it('adds the edition to a joker', () => {
    expect(jokerPrice(plain, getJoker('joker')!, 'polychrome')).toBe(7);
  });

  it('applies Clearance Sale and Liquidation with the game rounding', () => {
    expect(discountPercent(liquidation.vouchers)).toBe(50);
    expect(jokerPrice(clearance, getJoker('blueprint')!)).toBe(7); // floor(10.5 x 0.75)
    expect(packPrice(liquidation, getPack('arcana-normal')!)).toBe(2);
    expect(jokerPrice(liquidation, getJoker('joker')!)).toBe(1);
    // Never below a dollar.
    expect(jokerPrice(liquidation, { cost: 1 })).toBe(1);
  });

  it('makes planets and Celestial Packs free with Astronomer', () => {
    expect(consumablePrice(astronomer, getConsumable('jupiter')!)).toBe(0);
    expect(packPrice(astronomer, getPack('celestial-normal')!)).toBe(0);
    expect(packPrice(astronomer, getPack('arcana-normal')!)).toBe(4);
  });
});
