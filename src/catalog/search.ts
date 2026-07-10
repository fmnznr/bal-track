import type { JokerDef } from '../types';
import { consumables, jokers, packs, shopJokers, vouchers } from './catalog';

export type SearchKind = 'joker' | 'shop-joker' | 'voucher' | 'tarot' | 'planet' | 'spectral' | 'pack';

export interface SearchItem {
  id: string;
  name: string;
  kind: SearchKind;
  sub: string; // subtitle shown under the name, e.g. "$6 · uncommon"
}

function jokerItem(j: JokerDef, kind: SearchKind): SearchItem {
  return { id: j.id, name: j.name, kind, sub: `$${j.cost} · ${j.rarity}` };
}

function itemsFor(kind: SearchKind): SearchItem[] {
  switch (kind) {
    case 'joker':
      return jokers.map(j => jokerItem(j, 'joker'));
    case 'shop-joker':
      return shopJokers.map(j => jokerItem(j, 'shop-joker'));
    case 'voucher':
      return vouchers.map(v => ({ id: v.id, name: v.name, kind: 'voucher' as const, sub: `$${v.cost} · voucher` }));
    case 'tarot':
    case 'planet':
    case 'spectral':
      return consumables
        .filter(c => c.kind === kind)
        .map(c => ({ id: c.id, name: c.name, kind, sub: `$${c.cost} · ${c.kind}` }));
    case 'pack':
      return packs.map(p => ({ id: p.id, name: p.name, kind: 'pack' as const, sub: `$${p.cost} · pack` }));
  }
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
  }
  return i >= needle.length;
}

function matchScore(name: string, query: string): number {
  const n = name.toLowerCase();
  if (n.startsWith(query)) return 3;
  if (n.split(/[^a-z0-9]+/).some(w => w.startsWith(query))) return 2.5;
  if (n.includes(query)) return 2;
  if (query.length >= 3 && isSubsequence(query, n)) return 1;
  return 0;
}

export function searchCatalog(query: string, kinds: SearchKind[], limit = 8): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return kinds
    .flatMap(itemsFor)
    .map(item => ({ item, s: matchScore(item.name, q) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map(({ item }) => item);
}
