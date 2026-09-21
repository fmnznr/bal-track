import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTable } from './table';

const file = JSON.parse(readFileSync('src/vision/card-hashes.json', 'utf8'));

describe('the shipped card table', () => {
  it('covers all four atlases', () => {
    const table = parseTable(file);
    const kinds = new Set(table.map(c => c.kind));
    expect([...kinds].sort()).toEqual(['joker', 'pack', 'tarot', 'voucher']);
    expect(table.filter(c => c.kind === 'joker').length).toBeGreaterThan(140);
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
