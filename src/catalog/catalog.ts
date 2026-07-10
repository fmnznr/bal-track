import jokersJson from '../data/jokers.json';
import vouchersJson from '../data/vouchers.json';
import consumablesJson from '../data/consumables.json';
import packsJson from '../data/packs.json';
import type { ConsumableDef, JokerDef, PackDef, VoucherDef } from '../types';

export const jokers = jokersJson as unknown as JokerDef[];
export const vouchers = vouchersJson as unknown as VoucherDef[];
export const consumables = consumablesJson as unknown as ConsumableDef[];
export const packs = packsJson as unknown as PackDef[];

export const shopJokers = jokers.filter(j => j.rarity !== 'legendary');

const jokerById = new Map(jokers.map(j => [j.id, j]));
const voucherById = new Map(vouchers.map(v => [v.id, v]));
const consumableById = new Map(consumables.map(c => [c.id, c]));
const packById = new Map(packs.map(p => [p.id, p]));

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
