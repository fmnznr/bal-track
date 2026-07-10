import { getConsumable, getJoker } from '../catalog/catalog';
import { sellValue } from '../engine/economy';
import { HAND_TYPES } from '../types';
import type { Edition, HandType, RunState } from '../types';

export interface FinishedRun {
  deck: string;
  stake: string;
  ante: number;
  result: 'won' | 'lost';
  endedAt: string; // ISO date
}

export interface StoreState {
  current: RunState | null;
  past: RunState[]; // undo snapshots, oldest first, max 50
  finished: FinishedRun[];
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
  | { type: 'UNDO' };

const DECK_JOKER_SLOTS: Record<string, number> = { Black: 6, Painted: 4 };
const DECK_START_MONEY: Record<string, number> = { Yellow: 14 };

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
    status: 'active',
  };
}

export function initialStore(): StoreState {
  return { current: null, past: [], finished: [] };
}

export function reduce(state: StoreState, action: RunAction): StoreState {
  if (action.type === 'START_RUN') {
    return { ...state, current: newRunState(action.deck, action.stake), past: [] };
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
    case 'SPEND':
      return push({ ...run, money: run.money - action.amount });
    case 'END_RUN':
      return push(null, {
        finished: [
          { deck: run.deck, stake: run.stake, ante: run.ante, result: action.result, endedAt: new Date().toISOString() },
          ...state.finished,
        ],
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
    return raw ? (JSON.parse(raw) as StoreState) : null;
  } catch {
    return null;
  }
}
