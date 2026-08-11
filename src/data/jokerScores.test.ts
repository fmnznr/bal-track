import { describe, expect, it } from 'vitest';
import jokers from './jokers.json';

const byId = new Map(jokers.map(j => [j.id, j as { id: string; effect: string; score?: Record<string, number | string> }]));

describe('joker score models', () => {
  it('models the unambiguous flat jokers', () => {
    expect(byId.get('joker')?.score).toEqual({ mult: 4 });
    expect(byId.get('cavendish')?.score).toEqual({ xmult: 3 });
    expect(byId.get('jolly-joker')?.score).toBeDefined();
  });

  it('leaves conditional, scaling and random jokers unmodeled', () => {
    for (const id of ['green-joker', 'ride-the-bus', 'blueprint', 'greedy-joker', 'business-card', 'obelisk']) {
      expect(byId.get(id)?.score, id).toBeUndefined();
    }
  });

  it('models a reasonable share without inventing numbers', () => {
    const modeled = jokers.filter(j => 'score' in j);
    // A careful pass over all 150 finds 19 genuinely unambiguous jokers: the
    // five +Mult, five +Chips and five xMult hand families plus Joker,
    // Gros Michel, Cavendish and Stuntman. The floor guards against losing
    // them wholesale, the ceiling against modelling by guesswork.
    expect(modeled.length).toBeGreaterThanOrEqual(15);
    expect(modeled.length).toBeLessThanOrEqual(70);
  });

  it('only ever uses the known keys, with positive values on the numeric ones', () => {
    for (const j of jokers) {
      const score = (j as { score?: Record<string, number | string> }).score;
      if (!score) continue;
      for (const [key, value] of Object.entries(score)) {
        expect(['chips', 'mult', 'xmult', 'requiresHand'], `${j.id}: ${key}`).toContain(key);
        if (key === 'requiresHand') continue; // a HandType string, not a positive number
        expect(value, `${j.id}: ${key}`).toBeGreaterThan(0);
      }
    }
  });
});
