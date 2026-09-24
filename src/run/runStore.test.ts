import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_DECISIONS, makeDecision } from './decisionLog';
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
    expect(newRunState('Magic', 'White')).toMatchObject({
      consumableSlots: 3,
      vouchers: ['crystal-ball'],
      consumables: ['the-fool', 'the-fool'],
    });
    expect(newRunState('Nebula', 'White')).toMatchObject({ consumableSlots: 1, vouchers: ['telescope'] });
    expect(newRunState('Ghost', 'White').consumables).toEqual(['hex']);
    expect(newRunState('Zodiac', 'White').vouchers).toEqual(['overstock', 'tarot-merchant', 'planet-merchant']);
  });
  it('applies cumulative stake starting rules', () => {
    expect(newRunState('Red', 'White').discardsPerRound).toBe(4);
    expect(newRunState('Red', 'Blue').discardsPerRound).toBe(3);
    expect(newRunState('Blue', 'Gold').discardsPerRound).toBe(2);
  });
});

describe('reduce', () => {
  it('buys a joker and deducts the price', () => {
    const s = reduce(started(), { type: 'ADD_JOKER', jokerId: 'joker', edition: 'base', price: 2 });
    expect(s.current?.jokers[0]).toMatchObject({ jokerId: 'joker', edition: 'base' });
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

  it('does not sell an Eternal joker', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_JOKER', jokerId: 'joker', edition: 'base', stickers: { eternal: true } });
    const pastLen = s.past.length;
    s = reduce(s, { type: 'SELL_JOKER', index: 0 });
    expect(s.current?.jokers).toHaveLength(1);
    expect(s.past).toHaveLength(pastLen);
  });

  it('sells a Rental joker for exactly $1', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_JOKER', jokerId: 'blueprint', edition: 'polychrome', stickers: { rental: true } });
    s = reduce(s, { type: 'SELL_JOKER', index: 0 });
    expect(s.current?.money).toBe(5);
  });

  it('redeems vouchers and applies their state effects', () => {
    let s = started();
    s = reduce(s, { type: 'SET_MONEY', money: 30 });
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'blank' });
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

  it('undoes ending a run without leaving a duplicate history entry', () => {
    let s = reduce(started(), { type: 'END_RUN', result: 'won' });
    s = reduce(s, { type: 'UNDO' });
    expect(s.current?.status).toBe('active');
    expect(s.finished).toHaveLength(0);
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
  it('loads saves from the legacy v1 storage key', () => {
    const legacy = started('Checkered', 'Purple');
    localStorage.setItem('bal-track:v1', JSON.stringify(legacy));
    expect(load()?.current).toMatchObject({ deck: 'Checkered', stake: 'Purple' });
  });
  it('persists only the most recent undo steps', () => {
    let s = started('Red', 'White');
    for (let i = 1; i <= 30; i += 1) s = reduce(s, { type: 'SET_MONEY', money: i });
    expect(s.past).toHaveLength(30); // in memory the full stack is kept

    save(s);
    const restored = load()!;
    expect(restored.past).toHaveLength(10);
    // The steps kept are the newest ones, so undo still walks backwards correctly.
    expect(reduce(restored, { type: 'UNDO' }).current?.money).toBe(29);
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

  it('buys a shop card atomically and restores the complete transaction on undo', () => {
    let s = started();
    s = reduce(s, {
      type: 'SET_SHOP_DRAFT',
      draft: { cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }], voucherId: null, packIds: [], rerollCost: 5 },
    });
    s = reduce(s, { type: 'BUY_SHOP_CARD', index: 0 });
    expect(s.current?.money).toBe(2);
    expect(s.current?.jokers[0]?.jokerId).toBe('joker');
    expect(s.shopDraft?.cards).toHaveLength(0);
    s = reduce(s, { type: 'UNDO' });
    expect(s.current?.money).toBe(4);
    expect(s.current?.jokers).toHaveLength(0);
    expect(s.shopDraft?.cards).toHaveLength(1);
  });

  it('keeps unaffordable shop items and money unchanged', () => {
    let s = started();
    s = reduce(s, {
      type: 'SET_SHOP_DRAFT',
      draft: { cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }], voucherId: null, packIds: [], rerollCost: 5 },
    });
    const pastLen = s.past.length;
    s = reduce(s, { type: 'BUY_SHOP_CARD', index: 0 });
    expect(s.current?.money).toBe(4);
    expect(s.shopDraft?.cards).toHaveLength(1);
    expect(s.past).toHaveLength(pastLen);
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
    expect(loaded?.past[0]?.current?.deckProfile.deckSize).toBe(52);
  });
});

describe('profile automation', () => {
  it('books effects when a consumable is used from inventory', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_CONSUMABLE', consumableId: 'the-chariot' });
    s = reduce(s, { type: 'USE_CONSUMABLE', index: 0 });
    expect(s.current?.deckProfile.enhanced.steel).toBe(1);
  });

  it('books effects for pack-taken consumables via APPLY_CONSUMABLE', () => {
    const s = reduce(started(), { type: 'APPLY_CONSUMABLE', consumableId: 'justice' });
    expect(s.current?.deckProfile.enhanced.glass).toBe(1);
  });

  it('converts suits atomically', () => {
    const s = reduce(started(), { type: 'CONVERT_SUITS', to: 'hearts', from: { diamonds: 2, clubs: 1 } });
    expect(s.current?.deckProfile.suits).toEqual({ hearts: 16, diamonds: 11, spades: 13, clubs: 12 });
  });

  it('ignores negative conversion counts', () => {
    const s = reduce(started(), { type: 'CONVERT_SUITS', to: 'hearts', from: { diamonds: -5 } });
    expect(s.current?.deckProfile.suits).toEqual({ hearts: 13, diamonds: 13, spades: 13, clubs: 13 });
  });
});

describe('profile automation — no-op guard', () => {
  it('leaves no undo step for consumables without a profile effect', () => {
    let s = started();
    s = reduce(s, { type: 'SET_MONEY', money: 12 });
    const pastLen = s.past.length;
    s = reduce(s, { type: 'APPLY_CONSUMABLE', consumableId: 'aura' });
    expect(s.past.length).toBe(pastLen);
    s = reduce(s, { type: 'APPLY_CONSUMABLE', consumableId: 'the-chariot' });
    expect(s.past.length).toBe(pastLen + 1);
  });
});

describe('joker order', () => {
  function withJokers(...ids: string[]) {
    let s = started();
    for (const id of ids) s = reduce(s, { type: 'ADD_JOKER', jokerId: id, edition: 'base' });
    return s;
  }
  const ids = (s: ReturnType<typeof started>) => s.current!.jokers.map(j => j.jokerId);

  it('moves a joker left and right', () => {
    let s = withJokers('joker', 'blueprint', 'baron');
    s = reduce(s, { type: 'MOVE_JOKER', index: 2, direction: 'left' });
    expect(ids(s)).toEqual(['joker', 'baron', 'blueprint']);
    s = reduce(s, { type: 'MOVE_JOKER', index: 0, direction: 'right' });
    expect(ids(s)).toEqual(['baron', 'joker', 'blueprint']);
  });

  it('ignores moves past the edges without an undo step', () => {
    let s = withJokers('joker', 'baron');
    const pastLen = s.past.length;
    s = reduce(s, { type: 'MOVE_JOKER', index: 0, direction: 'left' });
    s = reduce(s, { type: 'MOVE_JOKER', index: 1, direction: 'right' });
    s = reduce(s, { type: 'MOVE_JOKER', index: 7, direction: 'left' });
    expect(ids(s)).toEqual(['joker', 'baron']);
    expect(s.past.length).toBe(pastLen);
  });

  it('applies a full permutation in one undo step', () => {
    let s = withJokers('joker', 'blueprint', 'baron');
    const pastLen = s.past.length;
    s = reduce(s, { type: 'SET_JOKER_ORDER', order: [2, 0, 1] });
    expect(ids(s)).toEqual(['baron', 'joker', 'blueprint']);
    expect(s.past.length).toBe(pastLen + 1);
    s = reduce(s, { type: 'UNDO' });
    expect(ids(s)).toEqual(['joker', 'blueprint', 'baron']);
  });

  it('rejects anything that is not a permutation', () => {
    const s = withJokers('joker', 'blueprint', 'baron');
    for (const order of [[0, 1], [0, 1, 1], [0, 1, 3], [0, 1, -1]]) {
      expect(ids(reduce(s, { type: 'SET_JOKER_ORDER', order }))).toEqual(['joker', 'blueprint', 'baron']);
    }
  });
});

describe('primary hand and round resources', () => {
  it('starts with no declared hand and deck-specific resources', () => {
    const red = newRunState('Red', 'White');
    expect(red.primaryHand).toBeNull();
    expect(red.handsPerRound).toBe(4);
    expect(red.discardsPerRound).toBe(4);
    expect(newRunState('Blue', 'White').handsPerRound).toBe(5);
    expect(newRunState('Black', 'White').handsPerRound).toBe(3);
    expect(newRunState('Magic', 'White').discardsPerRound).toBe(3);
  });

  it('declares and clears the primary hand', () => {
    let s = started();
    s = reduce(s, { type: 'SET_PRIMARY_HAND', hand: 'Flush' });
    expect(s.current?.primaryHand).toBe('Flush');
    s = reduce(s, { type: 'SET_PRIMARY_HAND', hand: null });
    expect(s.current?.primaryHand).toBeNull();
  });

  it('does not spend an undo step on re-picking the same hand', () => {
    let s = reduce(started(), { type: 'SET_PRIMARY_HAND', hand: 'Flush' });
    const steps = s.past.length;
    s = reduce(s, { type: 'SET_PRIMARY_HAND', hand: 'Flush' });
    expect(s.past).toHaveLength(steps);
  });

  it('edits round resources with a floor of zero', () => {
    let s = started();
    s = reduce(s, { type: 'SET_HANDS_PER_ROUND', value: -2 });
    s = reduce(s, { type: 'SET_DISCARDS_PER_ROUND', value: 5 });
    expect(s.current?.handsPerRound).toBe(0);
    expect(s.current?.discardsPerRound).toBe(5);
  });

  it('books resource vouchers automatically', () => {
    let s = started();
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'grabber' });
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'nacho-tong' });
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'wasteful' });
    expect(s.current?.handsPerRound).toBe(6);
    // started() runs the Red deck, which already grants a fourth discard.
    expect(s.current?.discardsPerRound).toBe(5);
  });

  it('backfills missing resource fields on old saves including snapshots', () => {
    const legacy = { ...newRunState('Blue', 'White') } as Record<string, unknown>;
    delete legacy.handsPerRound;
    delete legacy.discardsPerRound;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: legacy, past: [legacy], finished: [] }));
    const loaded = load();
    expect(loaded?.current?.handsPerRound).toBe(5);
    expect(loaded?.past[0]?.current?.discardsPerRound).toBe(3);
  });
});

describe('v2 migration — play counters to a declared hand', () => {
  function v2Run(plays: Record<string, number>) {
    const base = { ...newRunState('Red', 'White') } as Record<string, unknown>;
    delete base.primaryHand;
    return {
      ...base,
      handPlays: plays,
      discardsUsed: 4,
      jokers: [{ jokerId: 'blueprint', edition: 'base', acquiredAtPlays: 3, acquiredAtDiscards: 1 }],
    };
  }

  it('adopts the most played hand as the declared hand', () => {
    const legacy = v2Run({ Flush: 9, Pair: 4 });
    localStorage.setItem('bal-track:v2', JSON.stringify({ current: legacy, past: [legacy], finished: [] }));
    const loaded = load();
    expect(loaded?.current?.primaryHand).toBe('Flush');
    expect(loaded?.past[0]?.current?.primaryHand).toBe('Flush');
  });

  it('declares nothing when the old run had too few plays to be a signal', () => {
    const legacy = v2Run({ Flush: 3 });
    localStorage.setItem('bal-track:v2', JSON.stringify({ current: legacy, past: [], finished: [] }));
    expect(load()?.current?.primaryHand).toBeNull();
  });

  it('drops the retired per-joker acquisition counters', () => {
    const legacy = v2Run({ Flush: 9 });
    localStorage.setItem('bal-track:v2', JSON.stringify({ current: legacy, past: [], finished: [] }));
    const joker = load()?.current?.jokers[0] as Record<string, unknown> | undefined;
    expect(joker?.jokerId).toBe('blueprint');
    expect(joker).not.toHaveProperty('acquiredAtPlays');
    expect(joker).not.toHaveProperty('acquiredAtDiscards');
  });
});

describe('ending a run without a result', () => {
  it('drops the run and records nothing in the history', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_JOKER', jokerId: 'blueprint', edition: 'base' });
    s = reduce(s, { type: 'ABANDON_RUN' });
    expect(s.current).toBeNull();
    expect(s.finished).toHaveLength(0);
  });

  it('clears the shop and pack drafts with it', () => {
    let s = started();
    s = reduce(s, { type: 'SET_SHOP_DRAFT', draft: { cards: [], voucherId: 'telescope', packIds: [], rerollCost: 5 } });
    s = reduce(s, { type: 'SET_PACK_DRAFT', draft: { kind: 'celestial', options: ['jupiter'] } });
    s = reduce(s, { type: 'ABANDON_RUN' });
    expect(s.shopDraft).toBeNull();
    expect(s.packDraft).toBeNull();
  });

  it('can be undone, jokers and all', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_JOKER', jokerId: 'blueprint', edition: 'base' });
    s = reduce(s, { type: 'ABANDON_RUN' });
    s = reduce(s, { type: 'UNDO' });
    expect(s.current?.jokers).toHaveLength(1);
    expect(s.current?.deck).toBe('Red');
  });

  it('leaves an existing history untouched', () => {
    let s = reduce(started(), { type: 'END_RUN', result: 'won' });
    s = reduce(s, { type: 'START_RUN', deck: 'Blue', stake: 'White' });
    s = reduce(s, { type: 'ABANDON_RUN' });
    expect(s.finished).toHaveLength(1);
    expect(s.finished[0].result).toBe('won');
  });
});

describe('clearing the history', () => {
  function withHistory(): StoreState {
    let s = reduce(started(), { type: 'END_RUN', result: 'won' });
    s = reduce(s, { type: 'START_RUN', deck: 'Blue', stake: 'White' });
    return reduce(s, { type: 'END_RUN', result: 'lost' });
  }

  it('empties the finished runs', () => {
    const s = reduce(withHistory(), { type: 'CLEAR_HISTORY' });
    expect(s.finished).toEqual([]);
  });

  it('works between runs, when no run is active', () => {
    // The reducer's "no active run" guard sits below this action on purpose:
    // between runs is exactly when you would reach for it.
    const between = withHistory();
    expect(between.current).toBeNull();
    expect(reduce(between, { type: 'CLEAR_HISTORY' }).finished).toEqual([]);
  });

  it('works during a run without disturbing it', () => {
    let s = reduce(withHistory(), { type: 'START_RUN', deck: 'Black', stake: 'Gold' });
    s = reduce(s, { type: 'CLEAR_HISTORY' });
    expect(s.finished).toEqual([]);
    expect(s.current).toMatchObject({ deck: 'Black', stake: 'Gold' });
  });

  it('can be undone', () => {
    const s = reduce(reduce(withHistory(), { type: 'CLEAR_HISTORY' }), { type: 'UNDO' });
    expect(s.finished).toHaveLength(2);
  });

  it('does nothing, and spends no undo step, on an empty history', () => {
    const s = started();
    const cleared = reduce(s, { type: 'CLEAR_HISTORY' });
    expect(cleared).toBe(s);
  });
});

describe('boss blind', () => {
  it('records the boss and forgets it when the ante moves on', () => {
    let s = reduce(started(), { type: 'SET_BOSS', boss: 'the-club' });
    expect(s.current?.boss).toBe('the-club');
    s = reduce(s, { type: 'SET_ANTE', ante: 1 });
    expect(s.current?.boss).toBe('the-club');
    s = reduce(s, { type: 'SET_ANTE', ante: 2 });
    expect(s.current?.boss).toBeNull();
  });

  it('ignores an unknown boss', () => {
    const s = started();
    expect(reduce(s, { type: 'SET_BOSS', boss: 'the-nothing' })).toBe(s);
  });

  it('backfills the boss on runs saved before it existed', () => {
    const { boss: _boss, ...old } = newRunState('Red', 'White');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: old, past: [], finished: [] }));
    expect(load()?.current?.boss).toBeNull();
  });
});

describe('discounted shop purchases', () => {
  it('charges the discounted price for packs and vouchers', () => {
    let s = started();
    s = reduce(s, { type: 'SET_MONEY', money: 30 });
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'clearance-sale' });
    s = reduce(s, {
      type: 'SET_SHOP_DRAFT',
      draft: { cards: [], voucherId: 'overstock', packIds: ['arcana-normal'], rerollCost: 5 },
    });
    s = reduce(s, { type: 'BUY_SHOP_PACK', index: 0 });
    expect(s.current?.money).toBe(27); // $4 pack at 25% off
    s = reduce(s, { type: 'BUY_SHOP_VOUCHER' });
    expect(s.current?.money).toBe(20); // $10 voucher at 25% off
  });
});

describe('decision log', () => {
  const offer = {
    cards: [
      { kind: 'joker' as const, jokerId: 'joker', edition: 'base' as const, price: 2 },
      { kind: 'joker' as const, jokerId: 'blueprint', edition: 'base' as const, price: 10 },
    ],
    voucherId: null,
    packIds: ['arcana-normal'],
    rerollCost: 5,
  };
  const shopping = () => {
    let s = reduce(started(), { type: 'SET_MONEY', money: 30 });
    s = reduce(s, { type: 'SET_SHOP_DRAFT', draft: offer });
    return s;
  };

  it('gives every run an id and hands it to the result', () => {
    const s = started();
    expect(s.current?.id).toMatch(/\w+-\w+/);
    const ended = reduce(s, { type: 'END_RUN', result: 'won' });
    expect(ended.finished[0].runId).toBe(s.current?.id);
  });

  it('logs a shop buy against the ranking it was made from', () => {
    const s = reduce(shopping(), { type: 'BUY_SHOP_CARD', index: 0 });
    expect(s.decisions).toHaveLength(1);
    const d = s.decisions[0];
    expect(d).toMatchObject({ context: 'shop', money: 30, runId: s.current?.id });
    expect(d.options[d.chosen]).toMatchObject({ kind: 'buy-joker', refId: 'joker' });
  });

  it('takes the entry back with the undo', () => {
    let s = reduce(shopping(), { type: 'BUY_SHOP_PACK', index: 0 });
    expect(s.decisions).toHaveLength(1);
    s = reduce(s, { type: 'UNDO' });
    expect(s.decisions).toHaveLength(0);
    expect(s.shopDraft?.packIds).toEqual(['arcana-normal']);
  });

  it('logs rerolling and leaving as choices too', () => {
    let s = reduce(shopping(), { type: 'REROLL_SHOP' });
    expect(s.decisions[0].options[s.decisions[0].chosen].kind).toBe('reroll');
    s = reduce(s, { type: 'LEAVE_SHOP' });
    expect(s.decisions[1].options[s.decisions[1].chosen].kind).toBe('skip');
    expect(s.shopDraft).toBeNull();
  });

  it('takes a pack option in one step and logs it', () => {
    let s = reduce(started(), { type: 'SET_PACK_DRAFT', draft: { kind: 'buffoon', options: ['joker', 'blueprint'] } });
    s = reduce(s, { type: 'TAKE_PACK_OPTION', id: 'blueprint' });
    expect(s.current?.jokers.map(j => j.jokerId)).toEqual(['blueprint']);
    expect(s.packDraft?.options).toEqual(['joker']);
    expect(s.decisions[0]).toMatchObject({ context: 'pack' });
    expect(s.decisions[0].options[s.decisions[0].chosen].refId).toBe('blueprint');
    s = reduce(s, { type: 'SKIP_PACK' });
    expect(s.decisions[1].chosen).toBe(-1);
    expect(s.packDraft?.options).toEqual([]);
  });

  it('levels the hand a planet from a pack names', () => {
    let s = reduce(started(), { type: 'SET_PACK_DRAFT', draft: { kind: 'celestial', options: ['jupiter'] } });
    s = reduce(s, { type: 'TAKE_PACK_OPTION', id: 'jupiter' });
    expect(s.current?.handLevels.Flush).toBe(2);
  });

  it('survives a reload and clears on request', () => {
    const s = reduce(shopping(), { type: 'BUY_SHOP_CARD', index: 0 });
    save(s);
    expect(load()?.decisions).toHaveLength(1);
    expect(reduce(s, { type: 'CLEAR_DECISIONS' }).decisions).toEqual([]);
  });
});

describe('the decision log and undo', () => {
  it('drops the logged decision when the action is undone after a reload', () => {
    // The snapshot has to carry how many decisions the action logged, or the
    // log keeps a purchase the run no longer has.
    let state = reduce(initialStore(), { type: 'START_RUN', deck: 'Red', stake: 'White' });
    state = reduce(state, { type: 'SET_MONEY', money: 20 });
    state = reduce(state, {
      type: 'SET_SHOP_DRAFT',
      draft: { cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 4 }], voucherId: null, packIds: [], rerollCost: 5 },
    });
    state = reduce(state, { type: 'BUY_SHOP_CARD', index: 0 });
    expect(state.decisions).toHaveLength(1);

    // Round-trip through storage, the way a reload does.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const reloaded = load();
    expect(reloaded.decisions).toHaveLength(1);

    const undone = reduce(reloaded, { type: 'UNDO' });
    expect(undone.current?.jokers).toHaveLength(0);
    expect(undone.decisions).toHaveLength(0);
  });

  it('still drops it when the log is at its cap', () => {
    // At the cap an append trims the oldest, so the log's length does not
    // change — an undo that compared lengths would remove nothing.
    let state = reduce(initialStore(), { type: 'START_RUN', deck: 'Red', stake: 'White' });
    state = reduce(state, { type: 'SET_MONEY', money: 20 });
    const filler = { ...makeDecision(state.current!, 'shop', [], -1) };
    state = { ...state, decisions: Array.from({ length: MAX_DECISIONS }, () => filler) };
    state = reduce(state, {
      type: 'SET_SHOP_DRAFT',
      draft: { cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 4 }], voucherId: null, packIds: [], rerollCost: 5 },
    });
    state = reduce(state, { type: 'BUY_SHOP_CARD', index: 0 });
    expect(state.decisions).toHaveLength(MAX_DECISIONS);

    const undone = reduce(state, { type: 'UNDO' });
    expect(undone.current?.jokers).toHaveLength(0);
    expect(undone.decisions.at(-1)).toEqual(filler);
  });
});
