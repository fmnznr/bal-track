import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { checkJokerOrder, suggestJokerOrder } from './jokerOrder';
import type { RunState } from '../types';

function runWith(...jokerIds: string[]): RunState {
  return {
    ...newRunState('Red', 'White'),
    ante: 4,
    jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })),
  };
}
const codes = (run: RunState) => checkJokerOrder(run).map(i => i.code);

describe('checkJokerOrder', () => {
  it('is quiet for a well-ordered set', () => {
    expect(codes(runWith('joker', 'cavendish'))).toEqual([]);
    expect(codes(runWith('golden-joker'))).toEqual([]);
    expect(codes(runWith())).toEqual([]);
  });

  it('flags an xmult joker sitting left of a plus-mult joker', () => {
    const issues = checkJokerOrder(runWith('cavendish', 'joker'));
    expect(issues[0].code).toBe('xmult-before-plus-mult');
    expect(issues[0].message).toMatch(/Cavendish/);
    expect(issues[0].message).toMatch(/Joker/);
  });

  it('flags Blueprint in the rightmost slot', () => {
    expect(codes(runWith('baron', 'blueprint'))).toContain('blueprint-rightmost');
  });

  it('flags Blueprint copying a weaker joker than it could', () => {
    // joker (weak) is Blueprint's right neighbour, baron (strong) sits further right
    expect(codes(runWith('blueprint', 'joker', 'baron'))).toContain('blueprint-weak-target');
  });

  it('flags Brainstorm in the leftmost slot', () => {
    expect(codes(runWith('brainstorm', 'baron'))).toContain('brainstorm-leftmost');
  });

  it('flags Brainstorm copying a weaker joker than it could', () => {
    expect(codes(runWith('joker', 'baron', 'brainstorm'))).toContain('brainstorm-weak-target');
  });
});

describe('suggestJokerOrder', () => {
  it('returns null when the order is already fine', () => {
    expect(suggestJokerOrder(runWith('joker', 'cavendish'))).toBeNull();
    expect(suggestJokerOrder(runWith('golden-joker'))).toBeNull();
  });

  it('moves xmult jokers behind plus-mult jokers', () => {
    expect(suggestJokerOrder(runWith('cavendish', 'joker'))).toEqual([1, 0]);
  });

  it('keeps neutral jokers in their relative order', () => {
    // golden-joker and rocket are both neutral for ordering purposes
    const order = suggestJokerOrder(runWith('cavendish', 'golden-joker', 'rocket'));
    expect(order).toEqual([1, 2, 0]);
  });

  it('parks Blueprint left of the strongest joker', () => {
    const run = runWith('blueprint', 'joker', 'baron');
    const order = suggestJokerOrder(run)!;
    const names = order.map(i => run.jokers[i].jokerId);
    expect(names.indexOf('blueprint')).toBe(names.indexOf('baron') - 1);
  });

  it('puts the strongest joker leftmost and Brainstorm last', () => {
    const run = runWith('brainstorm', 'joker', 'baron');
    const order = suggestJokerOrder(run)!;
    const names = order.map(i => run.jokers[i].jokerId);
    expect(names[0]).toBe('baron');
    expect(names[names.length - 1]).toBe('brainstorm');
  });

  it('always returns a valid permutation', () => {
    const run = runWith('brainstorm', 'cavendish', 'joker', 'blueprint', 'baron');
    const order = suggestJokerOrder(run)!;
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
