import { describe, expect, it } from 'vitest';
import vouchers from './vouchers.json';
import consumables from './consumables.json';
import packs from './packs.json';
import meta from './meta.json';

describe('vouchers.json', () => {
  it('contains all 32 vouchers with unique ids', () => {
    expect(vouchers).toHaveLength(32);
    expect(new Set(vouchers.map(v => v.id)).size).toBe(32);
  });
  it('has 16 upgrade vouchers whose requirements exist', () => {
    const ids = new Set(vouchers.map(v => v.id));
    const upgrades = vouchers.filter(v => 'requires' in v && v.requires);
    expect(upgrades).toHaveLength(16);
    for (const u of upgrades) expect(ids.has(u.requires as string)).toBe(true);
  });
});

describe('consumables.json', () => {
  it('contains 22 tarot, 12 planet, 18 spectral cards', () => {
    expect(consumables.filter(c => c.kind === 'tarot')).toHaveLength(22);
    expect(consumables.filter(c => c.kind === 'planet')).toHaveLength(12);
    expect(consumables.filter(c => c.kind === 'spectral')).toHaveLength(18);
  });
  it('gives every planet a poker hand', () => {
    for (const p of consumables.filter(c => c.kind === 'planet')) {
      expect(p.hand, p.id).toBeTruthy();
    }
  });
});

describe('packs.json', () => {
  it('contains 15 pack variants (5 kinds x 3 sizes)', () => {
    expect(packs).toHaveLength(15);
    for (const kind of ['standard', 'arcana', 'celestial', 'buffoon', 'spectral']) {
      expect(packs.filter(p => p.kind === kind)).toHaveLength(3);
    }
  });
});

describe('meta.json', () => {
  it('lists 15 decks and 8 stakes', () => {
    expect(meta.decks).toHaveLength(15);
    expect(meta.stakes).toHaveLength(8);
  });
});
