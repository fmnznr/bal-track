import jokersJson from '../data/jokers.json';
import vouchersJson from '../data/vouchers.json';
import consumablesJson from '../data/consumables.json';
import packsJson from '../data/packs.json';
import bossesJson from '../data/bosses.json';
import type { BossDef, ConsumableDef, JokerDef, PackDef, VoucherDef } from '../types';

// Shape-checked by src/data/schema.ts: `npm run validate:catalog` parses this
// file at build time, and tsc fails if the schema drifts from the type here.
export const jokers = jokersJson as unknown as JokerDef[];
export const vouchers = vouchersJson as unknown as VoucherDef[];
export const consumables = consumablesJson as unknown as ConsumableDef[];
export const packs = packsJson as unknown as PackDef[];
export const bosses = bossesJson as unknown as BossDef[];

export const shopJokers = jokers.filter(j => j.rarity !== 'legendary');

const jokerById = new Map(jokers.map(j => [j.id, j]));
const voucherById = new Map(vouchers.map(v => [v.id, v]));
const consumableById = new Map(consumables.map(c => [c.id, c]));
const packById = new Map(packs.map(p => [p.id, p]));
const bossById = new Map(bosses.map(b => [b.id, b]));

export function getJoker(id: string): JokerDef | undefined {
  return jokerById.get(id);
}
export function getVoucher(id: string): VoucherDef | undefined {
  return voucherById.get(id);
}
export function getConsumable(id: string): ConsumableDef | undefined {
  return consumableById.get(id);
}
export function getPack(id: string): PackDef | undefined {
  return packById.get(id);
}

export function getBoss(id: string): BossDef | undefined {
  return bossById.get(id);
}

/** Bosses that can appear in this ante: showdown bosses on every eighth ante, the rest from their first ante. */
export function bossesForAnte(ante: number): BossDef[] {
  const showdown = ante >= 8 && ante % 8 === 0;
  return bosses.filter(b => (b.finisher ? showdown : !showdown && ante >= b.minAnte));
}
