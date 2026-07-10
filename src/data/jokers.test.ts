import { describe, expect, it } from 'vitest';
import jokers from './jokers.json';
import { SYNERGY_TAGS } from '../types';

describe('jokers.json', () => {
  it('contains all 150 jokers with unique ids', () => {
    expect(jokers).toHaveLength(150);
    expect(new Set(jokers.map(j => j.id)).size).toBe(150);
  });

  it('matches the rarity distribution of the game', () => {
    expect(jokers.filter(j => j.rarity === 'common')).toHaveLength(61);
    expect(jokers.filter(j => j.rarity === 'uncommon')).toHaveLength(64);
    expect(jokers.filter(j => j.rarity === 'rare')).toHaveLength(20);
    expect(jokers.filter(j => j.rarity === 'legendary')).toHaveLength(5);
  });

  it('has valid fields on every joker', () => {
    const tagSet = new Set<string>(SYNERGY_TAGS);
    for (const j of jokers) {
      expect(j.name, j.id).toBeTruthy();
      expect(j.effect, j.id).toBeTruthy();
      expect(j.cost, j.id).toBeGreaterThanOrEqual(1);
      expect(j.cost, j.id).toBeLessThanOrEqual(20);
      expect(j.tags.length, j.id).toBeGreaterThanOrEqual(1);
      for (const t of j.tags) expect(tagSet.has(t), `${j.id}: ${t}`).toBe(true);
      for (const phase of ['early', 'mid', 'late'] as const) {
        expect(j.rating[phase], j.id).toBeGreaterThanOrEqual(0);
        expect(j.rating[phase], j.id).toBeLessThanOrEqual(10);
      }
    }
  });

  it('contains the pinned entries the engine tests rely on', () => {
    const byId = new Map(jokers.map(j => [j.id, j]));
    expect(byId.get('blueprint')?.rating.mid).toBe(9);
    expect(byId.get('joker')?.rating.early).toBe(3);
    expect(byId.get('golden-joker')?.cost).toBe(6);
    expect(byId.get('droll-joker')?.tags).toContain('flush-support');
  });
});
