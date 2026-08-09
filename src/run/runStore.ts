import { getConsumable, getJoker } from '../catalog/catalog';
import { sellValue } from '../engine/economy';
import { applyProfileEffects } from './profileEffects';
import { ENHANCEMENT_TYPES, HAND_TYPES } from '../types';
import type { DeckProfile, Edition, EnhancementType, HandType, PackKind, RunState, ShopState, Suit } from '../types';

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
  past: RunState[]; // undo snapshots, oldest first, max 50
  finished: FinishedRun[];
  shopDraft: ShopState | null;
  packDraft: PackDraft | null;
}

export type RunAction =
  | { type: 'START_RUN'; deck: string; stake: string }
  | { type: 'SET_MONEY'; money: number }
  | { type: 'SET_ANTE'; ante: number }
  | { type: 'SET_JOKER_SLOTS'; slots: number }
  | { type: 'ADD_JOKER'; jokerId: string; edition: Edition; price?: number }
  | { type: 'SET_JOKER_EDITION'; index: number; edition: Edition }
  | { type: 'SELL_JOKER'; index: number }
  | { type: 'REDEEM_VOUCHER'; voucherId: string; price?: number }
  | { type: 'ADD_CONSUMABLE'; consumableId: string; price?: number }
  | { type: 'USE_CONSUMABLE'; index: number }
  | { type: 'PLAY_PLANET'; consumableId: string }
  | { type: 'SET_HAND_LEVEL'; hand: HandType; level: number }
  | { type: 'SPEND'; amount: number }
  | { type: 'END_RUN'; result: 'won' | 'lost' }
  | { type: 'UNDO' }
  | { type: 'SET_SHOP_DRAFT'; draft: ShopState | null }
  | { type: 'SET_PACK_DRAFT'; draft: PackDraft | null }
  | { type: 'SET_PROFILE_SUIT'; suit: Suit; value: number }
  | { type: 'SET_PROFILE_FACE'; value: number }
  | { type: 'SET_PROFILE_SIZE'; value: number }
  | { type: 'SET_PROFILE_ENHANCED'; enhancement: EnhancementType; value: number }
  | { type: 'APPLY_CONSUMABLE'; consumableId: string }
  | { type: 'CONVERT_SUITS'; to: Suit; from: Partial<Record<Suit, number>> };

const DECK_JOKER_SLOTS: Record<string, number> = { Black: 6, Painted: 4 };
const DECK_START_MONEY: Record<string, number> = { Yellow: 14 };

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
  return {
    deck,
    stake,
    ante: 1,
    money: DECK_START_MONEY[deck] ?? 4,
    jokerSlots: DECK_JOKER_SLOTS[deck] ?? 5,
    consumableSlots: 2,
    jokers: [],
    vouchers: [],
    consumables: [],
    handLevels,
    deckProfile: initialDeckProfile(deck),
    status: 'active',
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
    return { ...state, current: state.past[state.past.length - 1], past: state.past.slice(0, -1) };
  }

  const run = state.current;
  if (!run) return state;

  const push = (next: RunState | null, extra?: Partial<StoreState>): StoreState => ({
    ...state,
    ...extra,
    current: next,
    past: [...state.past.slice(-49), run],
  });

  switch (action.type) {
    case 'SET_SHOP_DRAFT':
      return { ...state, shopDraft: action.draft };
    case 'SET_PACK_DRAFT':
      return { ...state, packDraft: action.draft };
    case 'SET_MONEY':
      return push({ ...run, money: action.money });
    case 'SET_ANTE':
      return push({ ...run, ante: Math.max(1, action.ante) });
    case 'SET_JOKER_SLOTS':
      return push({ ...run, jokerSlots: Math.max(1, action.slots) });
    case 'ADD_JOKER':
      return push({
        ...run,
        money: run.money - (action.price ?? 0),
        jokers: [...run.jokers, { jokerId: action.jokerId, edition: action.edition }],
      });
    case 'SET_JOKER_EDITION':
      return push({
        ...run,
        jokers: run.jokers.map((j, i) => (i === action.index ? { ...j, edition: action.edition } : j)),
      });
    case 'SELL_JOKER': {
      const owned = run.jokers[action.index];
      if (!owned) return state;
      const def = getJoker(owned.jokerId);
      const refund = def ? sellValue(def.cost, owned.edition) : 0;
      return push({
        ...run,
        money: run.money + refund,
        jokers: run.jokers.filter((_, i) => i !== action.index),
      });
    }
    case 'REDEEM_VOUCHER': {
      let { jokerSlots, consumableSlots, ante } = run;
      if (action.voucherId === 'antimatter') jokerSlots += 1;
      if (action.voucherId === 'crystal-ball') consumableSlots += 1;
      if (action.voucherId === 'hieroglyph' || action.voucherId === 'petroglyph') ante = Math.max(1, ante - 1);
      return push({
        ...run,
        money: run.money - (action.price ?? 0),
        jokerSlots,
        consumableSlots,
        ante,
        vouchers: [...run.vouchers, action.voucherId],
      });
    }
    case 'ADD_CONSUMABLE':
      return push({
        ...run,
        money: run.money - (action.price ?? 0),
        consumables: [...run.consumables, action.consumableId],
      });
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
    case 'APPLY_CONSUMABLE':
      return push({ ...run, deckProfile: applyProfileEffects(run.deckProfile, action.consumableId) });
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
    case 'SPEND':
      return push({ ...run, money: run.money - action.amount });
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

export const STORAGE_KEY = 'bal-track:v1';

export function save(state: StoreState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode etc.) — app still works, just not persistent
  }
}

export function load(): StoreState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    const withProfile = (r: RunState): RunState =>
      r.deckProfile ? r : { ...r, deckProfile: initialDeckProfile(r.deck) };
    return {
      current: parsed.current ? withProfile(parsed.current) : null,
      past: (parsed.past ?? []).map(withProfile),
      finished: parsed.finished ?? [],
      shopDraft: parsed.shopDraft ?? null,
      packDraft: parsed.packDraft ?? null,
    };
  } catch {
    return null;
  }
}
