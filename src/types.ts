export type Phase = 'early' | 'mid' | 'late';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Edition = 'base' | 'foil' | 'holographic' | 'polychrome' | 'negative';
export type ConsumableKind = 'tarot' | 'planet' | 'spectral';
export type PackKind = 'standard' | 'arcana' | 'celestial' | 'buffoon' | 'spectral';

export const HAND_TYPES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush',
  'Full House', 'Four of a Kind', 'Straight Flush', 'Five of a Kind',
  'Flush House', 'Flush Five',
] as const;
export type HandType = (typeof HAND_TYPES)[number];

export const SYNERGY_TAGS = [
  'xmult', 'plus-mult', 'chips', 'economy', 'retrigger', 'scaling',
  'flush-support', 'straight-support', 'pair-support', 'face-cards',
  'suit-hearts', 'suit-diamonds', 'suit-spades', 'suit-clubs',
  'hand-size', 'consumable', 'utility', 'high-risk',
] as const;
export type SynergyTag = (typeof SYNERGY_TAGS)[number];

export interface JokerDef {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity;
  effect: string;
  rating: Record<Phase, number>; // 0..10 per phase
  tags: SynergyTag[];
}

export interface VoucherDef {
  id: string;
  name: string;
  cost: number;
  effect: string;
  rating: number; // 0..10
  requires?: string; // id of the base voucher for upgrade vouchers
}

export interface ConsumableDef {
  id: string;
  name: string;
  kind: ConsumableKind;
  cost: number; // usual shop price
  effect: string;
  rating: number; // 0..10
  hand?: HandType; // planets only
}

export interface PackDef {
  id: string;
  name: string;
  kind: PackKind;
  size: 'normal' | 'jumbo' | 'mega';
  cost: number;
  options: number; // cards shown
  picks: number; // cards you may take
  rating: Record<Phase, number>;
}

export interface OwnedJoker {
  jokerId: string;
  edition: Edition;
}

export interface RunState {
  deck: string;
  stake: string;
  ante: number;
  money: number;
  jokerSlots: number;
  consumableSlots: number;
  jokers: OwnedJoker[];
  vouchers: string[]; // voucher ids redeemed this run
  consumables: string[]; // consumable ids currently held
  handLevels: Record<HandType, number>; // all start at 1
  status: 'active' | 'won' | 'lost';
}

export type ShopCardSlot =
  | { kind: 'joker'; jokerId: string; edition: Edition; price: number }
  | { kind: 'consumable'; consumableId: string; price: number };

export interface ShopState {
  cards: ShopCardSlot[];
  voucherId: string | null;
  packIds: string[];
  rerollCost: number;
}

export type RecKind =
  | 'buy-joker' | 'buy-consumable' | 'buy-voucher' | 'buy-pack'
  | 'sell-and-buy' | 'reroll' | 'skip' | 'pick';

export interface Recommendation {
  kind: RecKind;
  action: string; // human-readable, e.g. "Buy Blueprint ($10)"
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  refId?: string; // catalog id this refers to, if any
}

export function phaseForAnte(ante: number): Phase {
  return ante <= 2 ? 'early' : ante <= 5 ? 'mid' : 'late';
}
