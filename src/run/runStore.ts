import { getBoss, getConsumable, getJoker, getPack, getVoucher } from '../catalog/catalog';
import { sellValue } from '../engine/economy';
import { hasFreeJokerSlot, stakeDiscardPenalty, usedJokerSlots } from '../engine/gameRules';
import { packPrice, voucherPrice } from '../engine/prices';
import { applyProfileEffects, hasProfileEffect } from './profileEffects';
import { ENHANCEMENT_TYPES, HAND_TYPES } from '../types';
import type {
  DeckProfile, Edition, EnhancementType, HandType, JokerStickers, OwnedJoker, PackKind, RunState, ShopState, Suit,
} from '../types';

export interface FinishedRun {
  deck: string;
  stake: string;
  ante: number;
  result: 'won' | 'lost';
  endedAt: string; // ISO date
}

export interface PackDraft {
  kind: PackKind;
  options: string[];
}

export interface StoreState {
  current: RunState | null;
  past: UndoSnapshot[]; // complete undo snapshots, oldest first, max 50
  finished: FinishedRun[];
  shopDraft: ShopState | null;
  packDraft: PackDraft | null;
}

export interface UndoSnapshot {
  current: RunState | null;
  finished: FinishedRun[];
  shopDraft: ShopState | null;
  packDraft: PackDraft | null;
}

export type RunAction =
  | { type: 'START_RUN'; deck: string; stake: string }
  | { type: 'SET_MONEY'; money: number }
  | { type: 'SET_ANTE'; ante: number }
  | { type: 'SET_BOSS'; boss: string | null }
  | { type: 'SET_JOKER_SLOTS'; slots: number }
  | { type: 'ADD_JOKER'; jokerId: string; edition: Edition; stickers?: JokerStickers; price?: number }
  | { type: 'SET_JOKER_EDITION'; index: number; edition: Edition }
  | { type: 'SET_JOKER_STICKERS'; index: number; stickers: JokerStickers }
  | { type: 'SELL_JOKER'; index: number }
  | { type: 'REDEEM_VOUCHER'; voucherId: string; price?: number }
  | { type: 'ADD_CONSUMABLE'; consumableId: string; price?: number }
  | { type: 'USE_CONSUMABLE'; index: number }
  | { type: 'PLAY_PLANET'; consumableId: string }
  | { type: 'SET_HAND_LEVEL'; hand: HandType; level: number }
  | { type: 'SET_PRIMARY_HAND'; hand: HandType | null }
  | { type: 'SET_HANDS_PER_ROUND'; value: number }
  | { type: 'SET_DISCARDS_PER_ROUND'; value: number }
  | { type: 'SPEND'; amount: number }
  | { type: 'END_RUN'; result: 'won' | 'lost' }
  | { type: 'ABANDON_RUN' }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'UNDO' }
  | { type: 'SET_SHOP_DRAFT'; draft: ShopState | null }
  | { type: 'SET_PACK_DRAFT'; draft: PackDraft | null }
  | { type: 'SET_PROFILE_SUIT'; suit: Suit; value: number }
  | { type: 'SET_PROFILE_FACE'; value: number }
  | { type: 'SET_PROFILE_SIZE'; value: number }
  | { type: 'SET_PROFILE_ENHANCED'; enhancement: EnhancementType; value: number }
  | { type: 'APPLY_CONSUMABLE'; consumableId: string }
  | { type: 'CONVERT_SUITS'; to: Suit; from: Partial<Record<Suit, number>> }
  | { type: 'MOVE_JOKER'; index: number; direction: 'left' | 'right' }
  | { type: 'SET_JOKER_ORDER'; order: number[] }
  | { type: 'BUY_SHOP_CARD'; index: number }
  | { type: 'BUY_SHOP_VOUCHER' }
  | { type: 'BUY_SHOP_PACK'; index: number }
  | { type: 'REROLL_SHOP' };

const DECK_JOKER_SLOTS: Record<string, number> = { Black: 6, Painted: 4 };
const DECK_START_MONEY: Record<string, number> = { Yellow: 14 };
const DECK_HANDS: Record<string, number> = { Blue: 5, Black: 3 };
const DECK_DISCARDS: Record<string, number> = { Red: 4 };

const DECK_START: Record<string, { consumableSlots?: number; vouchers?: string[]; consumables?: string[] }> = {
  Magic: { consumableSlots: 3, vouchers: ['crystal-ball'], consumables: ['the-fool', 'the-fool'] },
  Nebula: { consumableSlots: 1, vouchers: ['telescope'] },
  Ghost: { consumables: ['hex'] },
  Zodiac: { vouchers: ['overstock', 'tarot-merchant', 'planet-merchant'] },
};

/** Hands/discards a voucher permanently adds to every round. */
const RESOURCE_VOUCHERS: Record<string, { hands?: number; discards?: number }> = {
  grabber: { hands: 1 },
  'nacho-tong': { hands: 1 },
  wasteful: { discards: 1 },
  recyclomancy: { discards: 1 },
  hieroglyph: { hands: -1 },
  petroglyph: { discards: -1 },
};

export function initialDeckProfile(deck: string): DeckProfile {
  const enhanced = Object.fromEntries(ENHANCEMENT_TYPES.map(t => [t, 0])) as Record<EnhancementType, number>;
  if (deck === 'Checkered') {
    return { suits: { hearts: 26, diamonds: 0, spades: 26, clubs: 0 }, faceCards: 12, deckSize: 52, enhanced };
  }
  if (deck === 'Abandoned') {
    return { suits: { hearts: 10, diamonds: 10, spades: 10, clubs: 10 }, faceCards: 0, deckSize: 40, enhanced };
  }
  return { suits: { hearts: 13, diamonds: 13, spades: 13, clubs: 13 }, faceCards: 12, deckSize: 52, enhanced };
}

export function newRunState(deck: string, stake: string): RunState {
  const handLevels = Object.fromEntries(HAND_TYPES.map(h => [h, 1])) as Record<HandType, number>;
  const start = DECK_START[deck];
  return {
    deck,
    stake,
    ante: 1,
    money: DECK_START_MONEY[deck] ?? 4,
    jokerSlots: DECK_JOKER_SLOTS[deck] ?? 5,
    consumableSlots: start?.consumableSlots ?? 2,
    jokers: [],
    vouchers: [...(start?.vouchers ?? [])],
    consumables: [...(start?.consumables ?? [])],
    handLevels,
    primaryHand: null,
    handsPerRound: DECK_HANDS[deck] ?? 4,
    discardsPerRound: Math.max(0, (DECK_DISCARDS[deck] ?? 3) - stakeDiscardPenalty(stake)),
    deckProfile: initialDeckProfile(deck),
    boss: null,
    status: 'active',
  };
}

function addJoker(
  run: RunState,
  jokerId: string,
  edition: Edition,
  stickers: JokerStickers | undefined,
  price = 0,
): RunState | null {
  if (!getJoker(jokerId) || price < 0 || price > run.money) return null;
  if (!hasFreeJokerSlot(run, edition)) return null;
  return {
    ...run,
    money: run.money - price,
    jokers: [...run.jokers, { jokerId, edition, stickers }],
  };
}

function addConsumable(run: RunState, consumableId: string, price = 0): RunState | null {
  if (!getConsumable(consumableId) || price < 0 || price > run.money) return null;
  if (run.consumables.length >= run.consumableSlots) return null;
  return { ...run, money: run.money - price, consumables: [...run.consumables, consumableId] };
}

function redeemVoucher(run: RunState, voucherId: string, price = 0): RunState | null {
  const def = getVoucher(voucherId);
  if (!def || run.vouchers.includes(voucherId) || price < 0 || price > run.money) return null;
  if (def.requires && !run.vouchers.includes(def.requires)) return null;

  let { jokerSlots, consumableSlots, ante } = run;
  if (voucherId === 'antimatter') jokerSlots += 1;
  if (voucherId === 'crystal-ball') consumableSlots += 1;
  let { boss } = run;
  if (voucherId === 'hieroglyph' || voucherId === 'petroglyph') {
    ante = Math.max(0, ante - 1);
    boss = null;
  }
  const resource = RESOURCE_VOUCHERS[voucherId];
  return {
    ...run,
    money: run.money - price,
    jokerSlots,
    consumableSlots,
    ante,
    boss,
    handsPerRound: Math.max(0, run.handsPerRound + (resource?.hands ?? 0)),
    discardsPerRound: Math.max(0, run.discardsPerRound + (resource?.discards ?? 0)),
    vouchers: [...run.vouchers, voucherId],
  };
}

export function initialStore(): StoreState {
  return { current: null, past: [], finished: [], shopDraft: null, packDraft: null };
}

export function reduce(state: StoreState, action: RunAction): StoreState {
  if (action.type === 'START_RUN') {
    return { ...state, current: newRunState(action.deck, action.stake), past: [], shopDraft: null, packDraft: null };
  }
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return { ...state, ...previous, past: state.past.slice(0, -1) };
  }

  if (action.type === 'CLEAR_HISTORY') {
    // Above the guard below on purpose: you most often want to clear the history
    // between runs, and that guard would make this a silent no-op there.
    if (state.finished.length === 0) return state;
    return {
      ...state,
      finished: [],
      past: [...state.past.slice(-49), {
        current: state.current,
        finished: state.finished,
        shopDraft: state.shopDraft,
        packDraft: state.packDraft,
      }],
    };
  }

  const run = state.current;
  if (!run) return state;

  const push = (next: RunState | null, extra?: Partial<StoreState>): StoreState => ({
    ...state,
    ...extra,
    current: next,
    past: [...state.past.slice(-49), {
      current: run,
      finished: state.finished,
      shopDraft: state.shopDraft,
      packDraft: state.packDraft,
    }],
  });

  switch (action.type) {
    case 'SET_SHOP_DRAFT':
      return { ...state, shopDraft: action.draft };
    case 'SET_PACK_DRAFT':
      return { ...state, packDraft: action.draft };
    case 'SET_MONEY':
      return push({ ...run, money: Math.max(0, action.money) });
    case 'SET_ANTE': {
      const ante = Math.max(0, action.ante);
      // A new ante has a new boss, which the player has not seen yet.
      return push({ ...run, ante, boss: ante === run.ante ? run.boss : null });
    }
    case 'SET_BOSS':
      if (action.boss === run.boss || (action.boss !== null && !getBoss(action.boss))) return state;
      return push({ ...run, boss: action.boss });
    case 'SET_JOKER_SLOTS':
      return push({ ...run, jokerSlots: Math.max(1, action.slots) });
    case 'ADD_JOKER': {
      const next = addJoker(run, action.jokerId, action.edition, action.stickers, action.price);
      return next ? push(next) : state;
    }
    case 'SET_JOKER_EDITION':
      if (!run.jokers[action.index]) return state;
      if (
        run.jokers[action.index].edition === 'negative'
        && action.edition !== 'negative'
        && usedJokerSlots(run) >= run.jokerSlots
      ) return state;
      return push({
        ...run,
        jokers: run.jokers.map((j, i) => (i === action.index ? { ...j, edition: action.edition } : j)),
      });
    case 'SET_JOKER_STICKERS':
      if (!run.jokers[action.index]) return state;
      return push({
        ...run,
        jokers: run.jokers.map((j, i) => (i === action.index ? { ...j, stickers: action.stickers } : j)),
      });
    case 'SELL_JOKER': {
      const owned = run.jokers[action.index];
      if (!owned || owned.stickers?.eternal) return state;
      const def = getJoker(owned.jokerId);
      const refund = def ? sellValue(def.cost, owned.edition, owned.stickers) : 0;
      return push({
        ...run,
        money: run.money + refund,
        jokers: run.jokers.filter((_, i) => i !== action.index),
      });
    }
    case 'REDEEM_VOUCHER': {
      const next = redeemVoucher(run, action.voucherId, action.price);
      return next ? push(next) : state;
    }
    case 'ADD_CONSUMABLE': {
      const next = addConsumable(run, action.consumableId, action.price);
      return next ? push(next) : state;
    }
    case 'USE_CONSUMABLE': {
      const id = run.consumables[action.index];
      if (id === undefined) return state;
      const def = getConsumable(id);
      const handLevels =
        def?.kind === 'planet' && def.hand
          ? { ...run.handLevels, [def.hand]: run.handLevels[def.hand] + 1 }
          : run.handLevels;
      return push({
        ...run,
        handLevels,
        deckProfile: applyProfileEffects(run.deckProfile, id),
        consumables: run.consumables.filter((_, i) => i !== action.index),
      });
    }
    case 'PLAY_PLANET': {
      const def = getConsumable(action.consumableId);
      if (def?.kind !== 'planet' || !def.hand) return state;
      return push({ ...run, handLevels: { ...run.handLevels, [def.hand]: run.handLevels[def.hand] + 1 } });
    }
    case 'SET_HAND_LEVEL':
      return push({ ...run, handLevels: { ...run.handLevels, [action.hand]: Math.max(1, action.level) } });
    case 'SET_PRIMARY_HAND':
      if (action.hand === run.primaryHand) return state;
      return push({ ...run, primaryHand: action.hand });
    case 'SET_HANDS_PER_ROUND':
      return push({ ...run, handsPerRound: Math.max(0, action.value) });
    case 'SET_DISCARDS_PER_ROUND':
      return push({ ...run, discardsPerRound: Math.max(0, action.value) });
    case 'SET_PROFILE_SUIT':
      return push({
        ...run,
        deckProfile: { ...run.deckProfile, suits: { ...run.deckProfile.suits, [action.suit]: Math.max(0, action.value) } },
      });
    case 'SET_PROFILE_FACE':
      return push({ ...run, deckProfile: { ...run.deckProfile, faceCards: Math.max(0, action.value) } });
    case 'SET_PROFILE_SIZE':
      return push({ ...run, deckProfile: { ...run.deckProfile, deckSize: Math.max(0, action.value) } });
    case 'SET_PROFILE_ENHANCED':
      return push({
        ...run,
        deckProfile: {
          ...run.deckProfile,
          enhanced: { ...run.deckProfile.enhanced, [action.enhancement]: Math.max(0, action.value) },
        },
      });
    case 'APPLY_CONSUMABLE': {
      // Consumables without a known effect must not leave an undo step that undoes nothing.
      if (!hasProfileEffect(action.consumableId)) return state;
      return push({ ...run, deckProfile: applyProfileEffects(run.deckProfile, action.consumableId) });
    }
    case 'CONVERT_SUITS': {
      const suits = { ...run.deckProfile.suits };
      let moved = 0;
      for (const [suit, count] of Object.entries(action.from)) {
        const take = Math.min(suits[suit as Suit], Math.max(0, count ?? 0));
        suits[suit as Suit] -= take;
        moved += take;
      }
      suits[action.to] += moved;
      return push({ ...run, deckProfile: { ...run.deckProfile, suits } });
    }
    case 'MOVE_JOKER': {
      const target = action.direction === 'left' ? action.index - 1 : action.index + 1;
      if (action.index < 0 || action.index >= run.jokers.length) return state;
      if (target < 0 || target >= run.jokers.length) return state;
      const jokers = [...run.jokers];
      [jokers[action.index], jokers[target]] = [jokers[target], jokers[action.index]];
      return push({ ...run, jokers });
    }
    case 'SET_JOKER_ORDER': {
      const { order } = action;
      const valid =
        order.length === run.jokers.length &&
        new Set(order).size === order.length &&
        order.every(i => Number.isInteger(i) && i >= 0 && i < run.jokers.length);
      if (!valid) return state;
      return push({ ...run, jokers: order.map(i => run.jokers[i]) });
    }
    case 'BUY_SHOP_CARD': {
      const shop = state.shopDraft;
      const slot = shop?.cards[action.index];
      if (!shop || !slot) return state;
      const next = slot.kind === 'joker'
        ? addJoker(run, slot.jokerId, slot.edition, slot.stickers, slot.price)
        : addConsumable(run, slot.consumableId, slot.price);
      if (!next) return state;
      return push(next, { shopDraft: { ...shop, cards: shop.cards.filter((_, i) => i !== action.index) } });
    }
    case 'BUY_SHOP_VOUCHER': {
      const shop = state.shopDraft;
      const voucherId = shop?.voucherId;
      const def = voucherId ? getVoucher(voucherId) : undefined;
      if (!shop || !voucherId || !def) return state;
      const next = redeemVoucher(run, voucherId, voucherPrice(run, def));
      if (!next) return state;
      return push(next, { shopDraft: { ...shop, voucherId: null } });
    }
    case 'BUY_SHOP_PACK': {
      const shop = state.shopDraft;
      const packId = shop?.packIds[action.index];
      const def = packId ? getPack(packId) : undefined;
      const price = def ? packPrice(run, def) : 0;
      if (!shop || !packId || !def || price > run.money) return state;
      return push(
        { ...run, money: run.money - price },
        {
          shopDraft: { ...shop, packIds: shop.packIds.filter((_, i) => i !== action.index) },
          // The pack you just paid for is the one you are about to open, so the
          // pack screen starts on its kind instead of asking you to pick it
          // again. Any older draft is stale by now: that pack is long opened.
          packDraft: { kind: def.kind, options: [] },
        },
      );
    }
    case 'REROLL_SHOP': {
      const shop = state.shopDraft ?? { cards: [], voucherId: null, packIds: [], rerollCost: 5 };
      if (shop.rerollCost < 0 || shop.rerollCost > run.money) return state;
      return push(
        { ...run, money: run.money - shop.rerollCost },
        { shopDraft: { ...shop, cards: [], rerollCost: shop.rerollCost + 1 } },
      );
    }
    case 'SPEND':
      if (action.amount < 0 || action.amount > run.money) return state;
      return push({ ...run, money: run.money - action.amount });
    case 'ABANDON_RUN':
      // Drops the run without recording a result. Nothing is appended to the
      // history, because an abandoned run says nothing about winning or losing.
      return push(null, { shopDraft: null, packDraft: null });
    case 'END_RUN':
      return push(null, {
        finished: [
          { deck: run.deck, stake: run.stake, ante: run.ante, result: action.result, endedAt: new Date().toISOString() },
          ...state.finished,
        ],
        shopDraft: null,
        packDraft: null,
      });
  }
}

/**
 * Runs written before the primary hand replaced the per-hand play counters.
 * Only the fields the migration reads are described.
 */
type LegacyRunState = RunState & {
  handPlays?: Partial<Record<HandType, number>>;
  discardsUsed?: number;
  jokers: (OwnedJoker & { acquiredAtPlays?: number; acquiredAtDiscards?: number })[];
};

/**
 * Recovers the declared hand from v2 play counters: the most played hand, once
 * enough hands were recorded to be more than noise. This was the same floor the
 * old signals used before they would read the counters at all.
 */
const LEGACY_MIN_PLAYS = 8;

function derivePrimaryHand(plays: Partial<Record<HandType, number>> | undefined): HandType | null {
  if (!plays) return null;
  const total = HAND_TYPES.reduce((sum, hand) => sum + (plays[hand] ?? 0), 0);
  if (total < LEGACY_MIN_PLAYS) return null;
  let best: HandType | null = null;
  for (const hand of HAND_TYPES) {
    if ((plays[hand] ?? 0) > (best ? (plays[best] ?? 0) : 0)) best = hand;
  }
  return best;
}

export const STORAGE_KEY = 'bal-track:v3';
const LEGACY_STORAGE_KEYS = ['bal-track:v2', 'bal-track:v1'];

/**
 * Undo steps kept across a reload. The in-memory stack holds 50; persisting all
 * of them writes ~50 full run snapshots on every change, which is the bulk of
 * the payload and the slowest part of a save on a phone. Recent steps are what
 * anyone actually reaches for after reopening the app.
 */
const PERSISTED_UNDO_STEPS = 10;

export function save(state: StoreState): void {
  try {
    const trimmed: StoreState = { ...state, past: state.past.slice(-PERSISTED_UNDO_STEPS) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage unavailable (private mode etc.) — app still works, just not persistent
  }
}

export function load(): StoreState | null {
  try {
    const raw = LEGACY_STORAGE_KEYS.reduce<string | null>(
      (found, key) => found ?? localStorage.getItem(key),
      localStorage.getItem(STORAGE_KEY),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoreState> & { past?: unknown[] };
    const isRun = (value: unknown): value is RunState => {
      if (!value || typeof value !== 'object') return false;
      const candidate = value as Partial<RunState>;
      return typeof candidate.deck === 'string' && typeof candidate.stake === 'string'
        && Array.isArray(candidate.jokers) && Array.isArray(candidate.vouchers)
        && Array.isArray(candidate.consumables) && typeof candidate.handLevels === 'object';
    };
    const withDefaults = (r: LegacyRunState): RunState => {
      const {
        handPlays, discardsUsed: _discardsUsed, primaryHand, ...rest
      } = r as LegacyRunState & RunState;
      return {
        ...rest,
        deckProfile: r.deckProfile ?? initialDeckProfile(r.deck),
        primaryHand: primaryHand ?? derivePrimaryHand(handPlays),
        // v2 tracked when each joker was acquired to scale Green Joker and Ice
        // Cream; those signals are gone, so the counters go with them.
        jokers: r.jokers.map(({ jokerId, edition, stickers }) => ({ jokerId, edition, stickers })),
        boss: r.boss ?? null,
        handsPerRound: r.handsPerRound ?? DECK_HANDS[r.deck] ?? 4,
        discardsPerRound: r.discardsPerRound
          ?? Math.max(0, (DECK_DISCARDS[r.deck] ?? 3) - stakeDiscardPenalty(r.stake)),
      };
    };
    const current = isRun(parsed.current) ? withDefaults(parsed.current) : null;
    if (parsed.current && !current) return null;
    const finished = Array.isArray(parsed.finished) ? parsed.finished : [];
    const shopDraft = parsed.shopDraft ?? null;
    const packDraft = parsed.packDraft ?? null;
    const past = (parsed.past ?? []).flatMap(value => {
      // v1 stored bare RunState snapshots; v2 stores the entire transaction context.
      if (isRun(value)) {
        return [{ current: withDefaults(value), finished, shopDraft, packDraft }];
      }
      if (!value || typeof value !== 'object') return [];
      const snapshot = value as Partial<UndoSnapshot>;
      if (snapshot.current !== null && !isRun(snapshot.current)) return [];
      return [{
        current: snapshot.current ? withDefaults(snapshot.current) : null,
        finished: Array.isArray(snapshot.finished) ? snapshot.finished : finished,
        shopDraft: snapshot.shopDraft ?? null,
        packDraft: snapshot.packDraft ?? null,
      }];
    });
    return {
      current,
      past,
      finished,
      shopDraft,
      packDraft,
    };
  } catch {
    return null;
  }
}
