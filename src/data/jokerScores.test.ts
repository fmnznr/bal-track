import { describe, expect, it } from 'vitest';
import jokers from './jokers.json';
import { HAND_TYPES, RANKS, SUITS } from '../types';
import type { JokerScore } from '../types';

const all = jokers as unknown as { id: string; effect: string; score?: JokerScore }[];
const byId = new Map(all.map(j => [j.id, j]));
const modeled = all.filter(j => j.score);

describe('joker score models', () => {
  it('models the unambiguous flat jokers', () => {
    expect(byId.get('joker')?.score).toEqual({ mult: 4 });
    expect(byId.get('cavendish')?.score).toEqual({ xmult: 3 });
    expect(byId.get('jolly-joker')?.score).toBeDefined();
  });

  it('models per-card effects against a suit, a face or a share of the ranks', () => {
    expect(byId.get('greedy-joker')?.score)
      .toEqual({ perCard: { match: { kind: 'suit', suit: 'diamonds' }, mult: 3 } });
    expect(byId.get('scary-face')?.score)
      .toEqual({ perCard: { match: { kind: 'face' }, chips: 30 } });
    // "Each played 10 or 4" names its ranks, so face and rank matches agree.
    expect(byId.get('walkie-talkie')?.score)
      .toEqual({ perCard: { match: { kind: 'rank', ranks: ['10', '4'] }, chips: 10, mult: 4 } });
  });

  it('models counts the run already tracks exactly', () => {
    expect(byId.get('bull')?.score).toEqual({ perCount: { of: 'money', chips: 2 } });
    expect(byId.get('steel-joker')?.score).toEqual({ perCount: { of: 'steelCards', xmult: 0.2 } });
  });

  it('models retriggers, held cards, copies and listed chances', () => {
    expect(byId.get('hack')?.score?.retrigger?.match).toEqual({ kind: 'rank', ranks: ['2', '3', '4', '5'] });
    expect(byId.get('baron')?.score?.perHeld).toEqual({ match: { kind: 'rank', ranks: ['K'] }, xmult: 1.5 });
    expect(byId.get('blueprint')?.score).toEqual({ copies: 'right' });
    expect(byId.get('bloodstone')?.score?.perCard?.chance).toBe(0.5);
  });

  it('leaves play-history, scaling and hand-shape jokers unmodeled', () => {
    for (const id of [
      'green-joker', 'ride-the-bus', 'business-card', 'obelisk', 'supernova',
      'glass-joker', 'card-sharp', 'flower-pot', 'seeing-double', 'the-idol',
    ]) {
      expect(byId.get(id)?.score, id).toBeUndefined();
    }
  });

  it('models a reasonable share without inventing numbers', () => {
    // Flat effects, per-card and held-card effects, retriggers, copies, listed
    // chances and counts the run tracks. Anything that scales over time or
    // depends on what was played before is still out. The floor guards against losing them
    // wholesale, the ceiling against modelling by guesswork.
    expect(modeled.length).toBeGreaterThanOrEqual(35);
    expect(modeled.length).toBeLessThanOrEqual(70);
  });

  it('only ever uses the known keys, with positive values on the numeric ones', () => {
    const numeric = ['chips', 'mult', 'xmult'];
    const check = (part: Record<string, unknown>, id: string, allowed: string[]) => {
      for (const [key, value] of Object.entries(part)) {
        expect(allowed, `${id}: ${key}`).toContain(key);
        if (numeric.includes(key)) expect(value, `${id}: ${key}`).toBeGreaterThan(0);
      }
    };
    for (const j of all) {
      if (!j.score) continue;
      const score = j.score as unknown as Record<string, unknown>;
      const timing = ['chance', 'every', 'finalHand'];
      check(score, j.id, [
        ...numeric, ...timing, 'requiresHand', 'maxCards', 'minEnhanced', 'heldAllSuits', 'perCard',
        'perHeld', 'lowestHeldMult', 'perCount', 'retrigger', 'retriggerHeld', 'copies',
      ]);
      if (j.score.perCard) {
        check(j.score.perCard as unknown as Record<string, unknown>, j.id, [...numeric, ...timing, 'match', 'firstOnly']);
      }
      if (j.score.perHeld) {
        check(j.score.perHeld as unknown as Record<string, unknown>, j.id, [...numeric, 'match']);
      }
      if (j.score.perCount) {
        check(j.score.perCount as unknown as Record<string, unknown>, j.id, [...numeric, 'of', 'compounds']);
      }
    }
  });

  it('names only real poker hands in requiresHand', () => {
    const handSet = new Set<string>(HAND_TYPES);
    for (const j of all) {
      const required = j.score?.requiresHand;
      if (required === undefined) continue;
      expect(handSet.has(required), `${j.id}: ${required}`).toBe(true);
    }
  });

  it('names only real suits and ranks in card matches', () => {
    const suitSet = new Set<string>(SUITS);
    const rankSet = new Set<string>(RANKS);
    for (const j of all) {
      for (const match of [j.score?.perCard?.match, j.score?.perHeld?.match, j.score?.retrigger?.match]) {
        if (!match) continue;
        if (match.kind === 'suit') expect(suitSet.has(match.suit), j.id).toBe(true);
        if (match.kind === 'rank') {
          expect(match.ranks.length, j.id).toBeGreaterThan(0);
          for (const rank of match.ranks) expect(rankSet.has(rank), `${j.id}: ${rank}`).toBe(true);
        }
      }
    }
  });

  it('names only counts the engine knows how to read', () => {
    const known = [
      'stencilSlots', 'jokers', 'discardsPerRound', 'deckSize', 'cardsRemovedFromDeck',
      'money', 'moneyFives', 'steelCards', 'stoneCards', 'otherJokerSellValue', 'uncommonJokers',
    ];
    for (const j of all) {
      if (j.score?.perCount) expect(known, j.id).toContain(j.score.perCount.of);
    }
  });

  it('keeps every model traceable to a number in its own effect text', () => {
    // Numbers the text implies rather than states, each for a stated reason.
    const derived: Record<string, number[]> = {
      misprint: [11.5], // the average of +0-23 Mult
      swashbuckler: [1], // one Mult per dollar of sell value
      'raised-fist': [2], // "double the rank"
    };
    for (const j of modeled) {
      const numbers = [...(j.effect.match(/\d+(\.\d+)?/g) ?? []).map(Number), ...(derived[j.id] ?? [])];
      const claimed = [
        j.score!.chips, j.score!.mult, j.score!.xmult, j.score!.lowestHeldMult,
        j.score!.perCard?.chips, j.score!.perCard?.mult, j.score!.perCard?.xmult,
        j.score!.perHeld?.chips, j.score!.perHeld?.mult, j.score!.perHeld?.xmult,
        j.score!.perCount?.chips, j.score!.perCount?.mult, j.score!.perCount?.xmult,
      ].filter((n): n is number => n !== undefined);
      for (const value of claimed) {
        expect(numbers, `${j.id}: ${value} is not in "${j.effect}"`).toContain(value);
      }
    }
  });
});
