import { describe, expect, it } from 'vitest';
import { getConsumable, getJoker, getPack, getVoucher } from '../catalog/catalog';
import { consumablePrice, discountPercent, editionFromPrice, jokerPrice, packPrice, voucherPrice } from './prices';

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

describe('the edition a price gives away', () => {
  const grosMichel = getJoker('gros-michel')!; // $5 in the catalog

  it('reads each surcharge as its edition', () => {
    expect(editionFromPrice(plain, grosMichel, 5)).toBe('base');
    expect(editionFromPrice(plain, grosMichel, 7)).toBe('foil');
    expect(editionFromPrice(plain, grosMichel, 8)).toBe('holographic');
    // Polychrome and Negative cost the same; a recognised card is never Negative.
    expect(editionFromPrice(plain, grosMichel, 10)).toBe('polychrome');
  });

  it('reads it through a discount too', () => {
    expect(editionFromPrice(liquidation, grosMichel, jokerPrice(liquidation, grosMichel, 'polychrome'))).toBe('polychrome');
  });

  it('says nothing when no edition fits or two do', () => {
    // A Rental joker sells for $1 whatever its edition.
    expect(editionFromPrice(plain, grosMichel, 1)).toBeNull();
    // Half off a $2 Joker rounds Foil and Holographic to the same $2.
    const joker = getJoker('joker')!;
    expect(jokerPrice(liquidation, joker, 'foil')).toBe(jokerPrice(liquidation, joker, 'holographic'));
    expect(editionFromPrice(liquidation, joker, 2)).toBeNull();
  });
});
