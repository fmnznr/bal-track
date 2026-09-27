/**
 * What the shop actually charges, from the catalog price and the run.
 *
 * Game rules, not tuning: Clearance Sale and Liquidation take 25% and 50% off
 * everything in the shop, editions add to a joker's price, and Astronomer makes
 * planets and Celestial Packs free. The rounding is the game's own:
 * floor((base + extra + 0.5) x (100 - discount) / 100), never below $1.
 */
import type { ConsumableDef, Edition, JokerDef, PackDef, RunState, ShopState, VoucherDef } from '../types';
import { EDITION_COST_BONUS } from './economy';

type PriceRun = Pick<RunState, 'vouchers' | 'jokers'>;

export function discountPercent(vouchers: readonly string[]): number {
  if (vouchers.includes('liquidation')) return 50;
  if (vouchers.includes('clearance-sale')) return 25;
  return 0;
}

/** A catalog price with a given percentage off, rounded as the game does. */
function priceAt(base: number, percent: number): number {
  return Math.max(1, Math.floor(((base + 0.5) * (100 - percent)) / 100));
}

function discounted(run: PriceRun, base: number, extra = 0): number {
  return priceAt(base + extra, discountPercent(run.vouchers));
}

function hasAstronomer(run: PriceRun): boolean {
  return run.jokers.some(j => j.jokerId === 'astronomer');
}

export function jokerPrice(run: PriceRun, def: Pick<JokerDef, 'cost'>, edition: Edition = 'base'): number {
  return discounted(run, def.cost, EDITION_COST_BONUS[edition]);
}

/** Editions a shop price can give away. Negative is left out on purpose: it
    costs the same as Polychrome, and the screenshot reader never recognises a
    Negative joker at all, because the game redraws it dark. */
const PRICED_EDITIONS: readonly Edition[] = ['base', 'foil', 'holographic', 'polychrome'];

/**
 * The edition a joker's shop price gives away, when exactly one fits.
 *
 * Each edition adds its own surcharge, so a tag above the catalog price names
 * an edition the picture alone does not: a $5 joker on a $10 tag is
 * Polychrome. Nothing is returned when no edition fits — a Rental joker sells
 * for $1 whatever it is — or when a discount rounds two of them to the same
 * dollar.
 */
export function editionFromPrice(run: PriceRun, def: Pick<JokerDef, 'cost'>, price: number): Edition | null {
  const fits = PRICED_EDITIONS.filter(edition => jokerPrice(run, def, edition) === price);
  return fits.length === 1 ? fits[0] : null;
}

export function consumablePrice(run: PriceRun, def: Pick<ConsumableDef, 'cost' | 'kind'>): number {
  if (def.kind === 'planet' && hasAstronomer(run)) return 0;
  return discounted(run, def.cost);
}

export function voucherPrice(run: PriceRun, def: Pick<VoucherDef, 'cost'>): number {
  return discounted(run, def.cost);
}

export function packPrice(run: PriceRun, def: Pick<PackDef, 'cost' | 'kind'>): number {
  if (def.kind === 'celestial' && hasAstronomer(run)) return 0;
  return discounted(run, def.cost);
}

/** What the shop asks for its voucher: the tag if it was read, else the catalog. */
export function shopVoucherPrice(run: PriceRun, shop: Pick<ShopState, 'tagPrices'>, def: VoucherDef): number {
  return shop.tagPrices?.[def.id] ?? voucherPrice(run, def);
}

/** What the shop asks for a pack: the tag if it was read, else the catalog. */
export function shopPackPrice(run: PriceRun, shop: Pick<ShopState, 'tagPrices'>, def: PackDef): number {
  return shop.tagPrices?.[def.id] ?? packPrice(run, def);
}

/** The shop discounts a voucher can give: none, Clearance Sale, Liquidation. */
const DISCOUNTS = [0, 25, 50] as const;

/**
 * The discount the tags were printed with, when it is not the one the run
 * records.
 *
 * Every price in a shop comes off the catalog by the same percentage, so a
 * few tags are enough to tell it: a $6 Jumbo pack on a $4 tag and a $10
 * voucher on a $7 one are both a quarter off, which is Clearance Sale. Only
 * vouchers and packs are asked, since a joker's edition and Astronomer's free
 * planets change a card's tag for other reasons. Nothing is said when the tags
 * disagree, when two discounts round to the same prices, or when the run
 * already has the discount.
 */
export function discountFromTags(
  run: PriceRun, tags: readonly { cost: number; price: number }[],
): number | null {
  const read = tags.filter(t => t.price > 0);
  if (read.length === 0) return null;
  const fits = DISCOUNTS.filter(percent => read.every(t => priceAt(t.cost, percent) === t.price));
  if (fits.length !== 1) return null;
  return fits[0] === discountPercent(run.vouchers) ? null : fits[0];
}