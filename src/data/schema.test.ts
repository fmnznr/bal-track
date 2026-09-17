import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import archetypes from './archetypes.json';
import blinds from './blinds.json';
import consumables from './consumables.json';
import deckStrategy from './deckStrategy.json';
import handValues from './handValues.json';
import jokers from './jokers.json';
import meta from './meta.json';
import packs from './packs.json';
import vouchers from './vouchers.json';
import {
  archetypeSchema, blindsSchema, consumableSchema, deckStrategySchema, handValueSchema,
  jokerSchema, metaSchema, packSchema, voucherSchema,
} from './schema';

/** Reports the offending entry by id, not by array index. */
function parseAll(label: string, rows: unknown[], schema: ZodType): void {
  rows.forEach((row, i) => {
    const result = schema.safeParse(row);
    const name = (row as { id?: string; hand?: string; deck?: string });
    const who = name.id ?? name.hand ?? name.deck ?? `#${i}`;
    if (!result.success) {
      throw new Error(`${label} ${who}: ${JSON.stringify(result.error.issues, null, 1)}`);
    }
  });
  expect(rows.length).toBeGreaterThan(0);
}

describe('catalog data matches its schema', () => {
  it('jokers', () => parseAll('joker', jokers, jokerSchema));
  it('vouchers', () => parseAll('voucher', vouchers, voucherSchema));
  it('consumables', () => parseAll('consumable', consumables, consumableSchema));
  it('packs', () => parseAll('pack', packs, packSchema));
  it('hand values', () => parseAll('hand', handValues, handValueSchema));
  it('archetypes', () => parseAll('archetype', archetypes, archetypeSchema));
  it('deck strategies', () => parseAll('deck', deckStrategy, deckStrategySchema));
  it('blinds', () => expect(blindsSchema.safeParse(blinds).success).toBe(true));
  it('meta', () => expect(metaSchema.safeParse(meta).success).toBe(true));
});

describe('the schema is strict enough to be worth running', () => {
  const valid = {
    id: 'test-joker',
    name: 'Test Joker',
    cost: 4,
    rarity: 'common',
    effect: '+4 Mult',
    rating: { early: 5, mid: 5, late: 5 },
    tags: ['plus-mult'],
  };

  it('accepts a well-formed entry', () => {
    expect(jokerSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['an unknown field', { ...valid, notAField: 1 }],
    ['a misspelled tag', { ...valid, tags: ['plus-mlut'] }],
    ['a rating above 10', { ...valid, rating: { early: 5, mid: 11, late: 5 } }],
    ['a missing phase', { ...valid, rating: { early: 5, mid: 5 } }],
    ['an id with spaces', { ...valid, id: 'test joker' }],
    ['no tags at all', { ...valid, tags: [] }],
    ['a negative contribution', { ...valid, score: { mult: -4 } }],
    ['a score model that contributes nothing', { ...valid, score: {} }],
    ['an unknown requiresHand', { ...valid, score: { mult: 4, requiresHand: 'Two Kind' } }],
    ['an unknown perCount source', { ...valid, score: { perCount: { of: 'vibes', chips: 2 } } }],
    ['a rank match outside a deck', { ...valid, score: { perCard: { match: { kind: 'rank', ranks: 14 }, mult: 2 } } }],
    ['a suit match with no suit', { ...valid, score: { perCard: { match: { kind: 'suit' }, mult: 2 } } }],
  ])('rejects %s', (_label, bad) => {
    expect(jokerSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a pack that lets you pick more than it shows', () => {
    const pack = {
      id: 'test-pack', name: 'Test', kind: 'arcana', size: 'normal',
      cost: 4, options: 3, picks: 5, rating: { early: 5, mid: 5, late: 5 },
    };
    expect(packSchema.safeParse(pack).success).toBe(false);
  });

  it('rejects a planet with no hand and a tarot that names one', () => {
    const base = { id: 'x', name: 'X', cost: 3, effect: 'e', rating: 5 };
    expect(consumableSchema.safeParse({ ...base, kind: 'planet' }).success).toBe(false);
    expect(consumableSchema.safeParse({ ...base, kind: 'tarot', hand: 'Pair' }).success).toBe(false);
  });
});
