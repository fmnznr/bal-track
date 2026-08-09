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

describe('drafts', () => {
  const shopDraft = { cards: [], voucherId: 'telescope', packIds: [], rerollCost: 6 };

  it('stores drafts without touching the undo history', () => {
    let s = started();
    const pastLen = s.past.length;
    s = reduce(s, { type: 'SET_SHOP_DRAFT', draft: shopDraft });
    s = reduce(s, { type: 'SET_PACK_DRAFT', draft: { kind: 'celestial', options: ['jupiter'] } });
    expect(s.shopDraft?.voucherId).toBe('telescope');
    expect(s.packDraft?.options).toEqual(['jupiter']);
    expect(s.past.length).toBe(pastLen);
  });

  it('clears drafts when a run ends or a new one starts', () => {
    let s = started();
    s = reduce(s, { type: 'SET_SHOP_DRAFT', draft: shopDraft });
    s = reduce(s, { type: 'SET_PACK_DRAFT', draft: { kind: 'celestial', options: ['jupiter'] } });
    s = reduce(s, { type: 'END_RUN', result: 'lost' });
    expect(s.shopDraft).toBeNull();
    expect(s.packDraft).toBeNull();
    s = reduce(s, { type: 'START_RUN', deck: 'Red', stake: 'White' });
    s = reduce(s, { type: 'SET_PACK_DRAFT', draft: { kind: 'arcana', options: [] } });
    s = reduce(s, { type: 'START_RUN', deck: 'Blue', stake: 'White' });
    expect(s.packDraft).toBeNull();
  });

  it('persists drafts through save and load', () => {
    let s = started();
    s = reduce(s, {
      type: 'SET_SHOP_DRAFT',
      draft: { cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }], voucherId: null, packIds: [], rerollCost: 5 },
    });
    save(s);
    expect(load()?.shopDraft?.cards).toHaveLength(1);
  });

  it('backfills missing draft fields from old saves', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: newRunState('Red', 'White'), past: [], finished: [] }));
    const loaded = load();
    expect(loaded?.shopDraft).toBeNull();
    expect(loaded?.packDraft).toBeNull();
  });
});

describe('deck profile', () => {
  it('initializes the profile per deck', () => {
    expect(newRunState('Red', 'White').deckProfile).toEqual({
      suits: { hearts: 13, diamonds: 13, spades: 13, clubs: 13 },
      faceCards: 12,
      deckSize: 52,
      enhanced: { bonus: 0, mult: 0, wild: 0, glass: 0, steel: 0, stone: 0, gold: 0, lucky: 0 },
    });
    expect(newRunState('Checkered', 'White').deckProfile.suits).toEqual({ hearts: 26, diamonds: 0, spades: 26, clubs: 0 });
    const abandoned = newRunState('Abandoned', 'White').deckProfile;
    expect(abandoned.faceCards).toBe(0);
    expect(abandoned.deckSize).toBe(40);
  });

  it('edits profile counters with a floor of zero', () => {
    let s = started();
    s = reduce(s, { type: 'SET_PROFILE_SUIT', suit: 'diamonds', value: 4 });
    s = reduce(s, { type: 'SET_PROFILE_FACE', value: -3 });
    s = reduce(s, { type: 'SET_PROFILE_SIZE', value: 48 });
    s = reduce(s, { type: 'SET_PROFILE_ENHANCED', enhancement: 'steel', value: 2 });
    expect(s.current?.deckProfile.suits.diamonds).toBe(4);
    expect(s.current?.deckProfile.faceCards).toBe(0);
    expect(s.current?.deckProfile.deckSize).toBe(48);
    expect(s.current?.deckProfile.enhanced.steel).toBe(2);
  });

  it('backfills the profile on old saves including undo snapshots', () => {
    const legacyRun = { ...newRunState('Checkered', 'White') } as Record<string, unknown>;
    delete legacyRun.deckProfile;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: legacyRun, past: [legacyRun], finished: [] }));
    const loaded = load();
    expect(loaded?.current?.deckProfile.suits.spades).toBe(26);
    expect(loaded?.past[0]?.deckProfile.deckSize).toBe(52);
  });
});
