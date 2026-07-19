import { describe, expect, it } from 'vitest';
import archetypes from './archetypes.json';
import deckStrategy from './deckStrategy.json';
import meta from './meta.json';
import { HAND_TYPES, SYNERGY_TAGS } from '../types';
import { getJoker } from '../catalog/catalog';

describe('archetypes.json', () => {
  it('contains 6 archetypes with unique ids', () => {
    expect(archetypes).toHaveLength(6);
    expect(new Set(archetypes.map(a => a.id)).size).toBe(6);
  });

  it('references only valid tags, jokers and hands', () => {
    const tagSet = new Set<string>(SYNERGY_TAGS);
    const handSet = new Set<string>(HAND_TYPES);
    for (const a of archetypes) {
      expect(a.name, a.id).toBeTruthy();
      expect(a.description, a.id).toBeTruthy();
      expect(a.coreTags.length, a.id).toBeGreaterThanOrEqual(1);
      for (const t of a.coreTags) expect(tagSet.has(t), `${a.id}: ${t}`).toBe(true);
      expect(a.keyJokers.length, a.id).toBeGreaterThanOrEqual(4);
      expect(a.keyJokers.length, a.id).toBeLessThanOrEqual(6);
      for (const j of a.keyJokers) expect(getJoker(j), `${a.id}: ${j}`).toBeDefined();
      for (const h of a.hands) expect(handSet.has(h), `${a.id}: ${h}`).toBe(true);
    }
  });
});

describe('deckStrategy.json', () => {
  it('covers exactly the 15 decks from meta.json', () => {
    expect(new Set(deckStrategy.map(d => d.deck))).toEqual(new Set(meta.decks));
    expect(deckStrategy).toHaveLength(15);
  });

  it('references only valid archetype ids', () => {
    const ids = new Set(archetypes.map(a => a.id));
    for (const d of deckStrategy) {
      for (const key of Object.keys(d.boosts)) expect(ids.has(key), `${d.deck}: ${key}`).toBe(true);
      for (const ex of d.excluded) expect(ids.has(ex), `${d.deck}: ${ex}`).toBe(true);
    }
  });

  it('excludes face-cards on Abandoned and boosts flush on Checkered', () => {
    expect(deckStrategy.find(d => d.deck === 'Abandoned')?.excluded).toContain('face-cards');
    expect(deckStrategy.find(d => d.deck === 'Checkered')?.boosts['flush']).toBe(3);
  });
});
