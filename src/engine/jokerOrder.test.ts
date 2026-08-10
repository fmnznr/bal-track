import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { checkJokerOrder, suggestJokerOrder } from './jokerOrder';
import type { Edition, RunState } from '../types';

function runWith(...jokerIds: string[]): RunState {
  return {
    ...newRunState('Red', 'White'),
    ante: 4,
    jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })),
  };
}

function withEdition(run: RunState, index: number, edition: Edition): RunState {
  return { ...run, jokers: run.jokers.map((j, i) => (i === index ? { ...j, edition } : j)) };
}

const codes = (run: RunState) => checkJokerOrder(run).map(i => i.code);
const applied = (run: RunState, order: number[]): RunState => ({
  ...run,
  jokers: order.map(i => run.jokers[i]),
});

describe('checkJokerOrder', () => {
  it('is quiet for well-ordered sets', () => {
    expect(codes(runWith())).toEqual([]);
    expect(codes(runWith('golden-joker'))).toEqual([]);
    expect(codes(runWith('joker', 'cavendish'))).toEqual([]);
    expect(codes(runWith('blueprint', 'baron'))).toEqual([]);
    expect(codes(runWith('baron', 'brainstorm'))).toEqual([]);
  });

  it('flags xmult jokers sitting left of plus-mult jokers', () => {
    const issues = checkJokerOrder(runWith('cavendish', 'joker'));
    expect(issues[0].code).toBe('xmult-before-plus-mult');
    expect(issues[0].message).toMatch(/Cavendish/);
    expect(issues[0].message).toMatch(/Joker/);
  });

  it('collapses several misplaced xmult jokers into one message', () => {
    const issues = checkJokerOrder(runWith('cavendish', 'baron', 'joker'));
    expect(issues.filter(i => i.code === 'xmult-before-plus-mult')).toHaveLength(1);
    expect(issues[0].message).toMatch(/Cavendish, Baron/);
  });

  it('reads editions as scoring behaviour', () => {
    const polychromeEconomy = withEdition(runWith('golden-joker', 'joker'), 0, 'polychrome');
    expect(codes(polychromeEconomy)).toContain('xmult-before-plus-mult');
  });

  it('flags every Blueprint that ends up rightmost', () => {
    expect(codes(runWith('baron', 'blueprint'))).toContain('blueprint-rightmost');
    expect(codes(runWith('baron', 'blueprint', 'blueprint'))).toContain('blueprint-rightmost');
  });

  it('flags a Blueprint copying a joker that does not score', () => {
    expect(codes(runWith('blueprint', 'golden-joker', 'baron'))).toContain('blueprint-weak-target');
  });

  it('accepts copy chains as valid targets', () => {
    expect(codes(runWith('blueprint', 'blueprint', 'baron'))).toEqual([]);
    expect(codes(runWith('baron', 'blueprint', 'brainstorm'))).toEqual([]);
  });

  it('flags Brainstorm in the leftmost slot', () => {
    expect(codes(runWith('brainstorm', 'baron'))).toContain('brainstorm-leftmost');
  });

  it('flags Brainstorm copying a leftmost joker that does not score', () => {
    expect(codes(runWith('golden-joker', 'joker', 'brainstorm'))).toContain('brainstorm-weak-target');
  });

  it('stays quiet when no better copy target exists at all', () => {
    expect(codes(runWith('golden-joker', 'brainstorm'))).toEqual([]);
    expect(codes(runWith('blueprint', 'golden-joker'))).toEqual([]);
  });
});

describe('suggestJokerOrder', () => {
  it('returns null when nothing is wrong', () => {
    expect(suggestJokerOrder(runWith('joker', 'cavendish'))).toBeNull();
    expect(suggestJokerOrder(runWith('golden-joker'))).toBeNull();
    expect(suggestJokerOrder(runWith('joker', 'golden-joker'))).toBeNull();
  });

  it('moves xmult jokers behind plus-mult jokers', () => {
    expect(suggestJokerOrder(runWith('cavendish', 'joker'))).toEqual([1, 0]);
  });

  it('keeps position-neutral jokers in their relative order', () => {
    // Only the misplaced Cavendish has to move; golden-joker stays ahead of rocket.
    expect(suggestJokerOrder(runWith('cavendish', 'golden-joker', 'rocket', 'joker'))).toEqual([1, 2, 3, 0]);
  });

  it('parks Blueprint left of a scoring joker', () => {
    const run = runWith('baron', 'blueprint');
    const order = suggestJokerOrder(run)!;
    const names = order.map(i => run.jokers[i].jokerId);
    expect(names).toEqual(['blueprint', 'baron']);
  });

  it('handles duplicated copy jokers as a valid permutation', () => {
    const run = runWith('baron', 'blueprint', 'blueprint');
    const order = suggestJokerOrder(run)!;
    expect([...order].sort()).toEqual([0, 1, 2]);
    expect(checkJokerOrder(applied(run, order))).toEqual([]);
  });

  it('puts a scoring joker leftmost and Brainstorm last', () => {
    const run = runWith('golden-joker', 'joker', 'brainstorm');
    const order = suggestJokerOrder(run)!;
    const names = order.map(i => run.jokers[i].jokerId);
    expect(names[0]).toBe('joker');
    expect(names[names.length - 1]).toBe('brainstorm');
  });

  it('never suggests an order that is not strictly better', () => {
    const lineups = [
      ['cavendish', 'joker'],
      ['baron', 'blueprint'],
      ['brainstorm', 'baron'],
      ['golden-joker', 'joker', 'brainstorm'],
      ['blueprint', 'golden-joker', 'baron'],
      ['brainstorm', 'cavendish', 'joker', 'blueprint', 'baron'],
      ['blueprint', 'blueprint', 'joker', 'cavendish'],
      ['brainstorm', 'brainstorm', 'baron'],
      ['rocket', 'golden-joker', 'brainstorm', 'cavendish'],
      ['baron', 'blueprint', 'blueprint'],
    ];
    for (const ids of lineups) {
      const run = runWith(...ids);
      const order = suggestJokerOrder(run);
      if (order === null) continue;
      expect([...order].sort((a, b) => a - b), ids.join(',')).toEqual(run.jokers.map((_, i) => i));
      const after = checkJokerOrder(applied(run, order)).length;
      expect(after, ids.join(',')).toBeLessThan(checkJokerOrder(run).length);
      expect(suggestJokerOrder(applied(run, order)), `${ids.join(',')} oscillates`).toBeNull();
    }
  });
});

describe('jokerOrder — review follow-ups', () => {
  it('names every blocked plus-mult joker in the collapsed message', () => {
    const issues = checkJokerOrder(runWith('cavendish', 'joker', 'baron', 'mystic-summit'));
    const message = issues.find(i => i.code === 'xmult-before-plus-mult')!.message;
    expect(message).toMatch(/Joker, Mystic Summit/);
  });

  it('stays silent when only copy jokers are owned', () => {
    expect(codes(runWith('blueprint', 'blueprint'))).toEqual([]);
    expect(codes(runWith('brainstorm', 'brainstorm'))).toEqual([]);
  });

  it('leads with a scoring joker when no Mult joker is owned', () => {
    const run = runWith('golden-joker', 'rocket', 'brainstorm');
    const order = suggestJokerOrder(run)!;
    expect(order.map(i => run.jokers[i].jokerId)[0]).toBe('rocket');
    expect(checkJokerOrder(applied(run, order))).toEqual([]);
  });
});
