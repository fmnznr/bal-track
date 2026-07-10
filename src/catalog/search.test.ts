import { describe, expect, it } from 'vitest';
import { searchCatalog } from './search';

describe('searchCatalog', () => {
  it('matches by prefix and substring', () => {
    const names = searchCatalog('blue', ['joker']).map(r => r.name);
    expect(names).toContain('Blueprint');
    expect(names).toContain('Blue Joker');
  });

  it('tolerates a missing letter via subsequence matching', () => {
    const names = searchCatalog('bluprint', ['joker']).map(r => r.name);
    expect(names).toContain('Blueprint');
  });

  it('restricts results to the requested kinds', () => {
    const results = searchCatalog('ju', ['planet']);
    expect(results.map(r => r.name)).toContain('Jupiter');
    expect(results.every(r => r.kind === 'planet')).toBe(true);
  });

  it('excludes legendaries from shop-joker searches', () => {
    expect(searchCatalog('triboulet', ['shop-joker'])).toHaveLength(0);
    expect(searchCatalog('triboulet', ['joker'])).toHaveLength(1);
  });

  it('returns nothing for an empty query and caps results', () => {
    expect(searchCatalog('', ['joker'])).toHaveLength(0);
    expect(searchCatalog('a', ['joker']).length).toBeLessThanOrEqual(8);
  });
});
