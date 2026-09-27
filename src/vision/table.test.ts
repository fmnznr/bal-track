import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { distance } from './fingerprint';
import { parseTable } from './table';

const file = JSON.parse(readFileSync('src/vision/card-hashes.json', 'utf8'));

describe('the shipped card table', () => {
  it('covers all four atlases', () => {
    const table = parseTable(file);
    const kinds = new Set(table.map(c => c.kind));
    expect([...kinds].sort()).toEqual(['joker', 'pack', 'tarot', 'voucher']);
    expect(table.filter(c => c.kind === 'joker').length).toBeGreaterThan(140);
  });

  it('names the card in all but the decorative cells', () => {
    const table = parseTable(file);
    const named = table.filter(c => c.ids.length > 0);
    // The nine joker cells without a card are the legendaries' soul faces, a
    // lock, a card back and one duplicated sprite.
    expect(table.length - named.length).toBe(16);
    expect(named.every(c => c.ids.every(id => /^[a-z0-9-]+$/.test(id)))).toBe(true);
  });

  it('draws each legendary with its face, which is what tells them apart', () => {
    // Bare, the five frames differ only in the name plate: Perkeo in a real
    // shop scored 243 against its frame, too far off to read. The closest two
    // frames were 62 apart; with the faces laid on, 132.
    const table = parseTable(file);
    const legends = ['canio', 'triboulet', 'yorick', 'chicot', 'perkeo']
      .map(id => table.find(c => c.ids.includes(id))!);
    for (const a of legends) {
      for (const b of legends) {
        if (a !== b) expect(distance(a.print, b.print)).toBeGreaterThan(100);
      }
    }
  });

  it('gives every card a full fingerprint', () => {
    for (const card of parseTable(file)) {
      expect(card.print.hash).toHaveLength(16);
      expect(card.print.colour).toHaveLength(108);
    }
  });

  it('refuses a table it cannot read rather than matching against noise', () => {
    expect(() => parseTable({ ...file, version: 2 })).toThrow(/version/);
    expect(() => parseTable({ ...file, prints: file.prints.slice(0, 40) })).toThrow(/bytes/);
  });

  it('stays small enough to precache', () => {
    expect(readFileSync('src/vision/card-hashes.json').length).toBeLessThan(100 * 1024);
  });
});
