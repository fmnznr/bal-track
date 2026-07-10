import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY, initialStore, load, newRunState, reduce, save } from './runStore';
import type { StoreState } from './runStore';

function started(deck = 'Red', stake = 'White'): StoreState {
  return reduce(initialStore(), { type: 'START_RUN', deck, stake });
}

beforeEach(() => localStorage.clear());

describe('newRunState', () => {
  it('starts with $4, ante 1, 5 joker slots, all hands level 1', () => {
    const run = newRunState('Red', 'White');
    expect(run.money).toBe(4);
    expect(run.ante).toBe(1);
    expect(run.jokerSlots).toBe(5);
    expect(run.handLevels['Flush']).toBe(1);
    expect(run.status).toBe('active');
  });
  it('applies deck quirks', () => {
    expect(newRunState('Yellow', 'White').money).toBe(14);
    expect(newRunState('Black', 'White').jokerSlots).toBe(6);
    expect(newRunState('Painted', 'White').jokerSlots).toBe(4);
  });
});

describe('reduce', () => {
  it('buys a joker and deducts the price', () => {
    const s = reduce(started(), { type: 'ADD_JOKER', jokerId: 'joker', edition: 'base', price: 2 });
    expect(s.current?.jokers).toEqual([{ jokerId: 'joker', edition: 'base' }]);
    expect(s.current?.money).toBe(2);
  });

  it('adds a joker without price for manual corrections', () => {
    const s = reduce(started(), { type: 'ADD_JOKER', jokerId: 'baron', edition: 'foil' });
    expect(s.current?.money).toBe(4);
  });

  it('sells a joker and refunds the sell value', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_JOKER', jokerId: 'golden-joker', edition: 'base' }); // cost 6 → sell 3
    s = reduce(s, { type: 'SELL_JOKER', index: 0 });
    expect(s.current?.jokers).toHaveLength(0);
    expect(s.current?.money).toBe(7);
  });

  it('redeems vouchers and applies their state effects', () => {
    let s = started();
    s = reduce(s, { type: 'SET_MONEY', money: 30 });
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'antimatter', price: 10 });
    expect(s.current?.money).toBe(20);
    expect(s.current?.jokerSlots).toBe(6);
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'crystal-ball' });
    expect(s.current?.consumableSlots).toBe(3);
  });

  it('uses a held planet card to raise its hand level', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_CONSUMABLE', consumableId: 'jupiter' });
    s = reduce(s, { type: 'USE_CONSUMABLE', index: 0 });
    expect(s.current?.handLevels['Flush']).toBe(2);
    expect(s.current?.consumables).toHaveLength(0);
  });

  it('plays a planet directly from a pack', () => {
    const s = reduce(started(), { type: 'PLAY_PLANET', consumableId: 'mercury' });
    expect(s.current?.handLevels['Pair']).toBe(2);
  });

  it('undoes the last action', () => {
    let s = started();
    s = reduce(s, { type: 'SET_MONEY', money: 99 });
    s = reduce(s, { type: 'UNDO' });
    expect(s.current?.money).toBe(4);
  });

  it('ends a run into the history', () => {
    const s = reduce(started(), { type: 'END_RUN', result: 'lost' });
    expect(s.current).toBeNull();
    expect(s.finished[0]?.result).toBe('lost');
    expect(s.finished[0]?.deck).toBe('Red');
  });
});

describe('persistence', () => {
  it('round-trips through localStorage', () => {
    const s = started('Blue', 'Gold');
    save(s);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(load()?.current?.deck).toBe('Blue');
  });
  it('returns null when nothing is stored', () => {
    expect(load()).toBeNull();
  });
});
