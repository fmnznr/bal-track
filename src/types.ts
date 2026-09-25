export type Phase = 'early' | 'mid' | 'late';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Edition = 'base' | 'foil' | 'holographic' | 'polychrome' | 'negative';
export interface JokerStickers {
  eternal?: boolean;
  perishable?: boolean;
  rental?: boolean;
}
export type ConsumableKind = 'tarot' | 'planet' | 'spectral';
export type PackKind = 'standard' | 'arcana' | 'celestial' | 'buffoon' | 'spectral';

export const HAND_TYPES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush',
  'Full House', 'Four of a Kind', 'Straight Flush', 'Five of a Kind',
  'Flush House', 'Flush Five',
] as const;
export type HandType = (typeof HAND_TYPES)[number];

export interface HandValueDef {
  hand: HandType;
  baseChips: number;
  baseMult: number;
  chipsPerLevel: number;
  multPerLevel: number;
  scoringCards: number;
}

export const SYNERGY_TAGS = [
  'xmult', 'plus-mult', 'chips', 'economy', 'retrigger', 'scaling',
  'flush-support', 'straight-support', 'pair-support', 'face-cards',
  'suit-hearts', 'suit-diamonds', 'suit-spades', 'suit-clubs',
  'hand-size', 'consumable', 'utility', 'high-risk',
] as const;
export type SynergyTag = (typeof SYNERGY_TAGS)[number];

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

/**
 * What a per-card effect matches among the cards a hand scores or holds.
 *
 * Suit and face shares come from the tracked deck profile, so they follow a
 * deck that has been converted or thinned. Ranks inside the face and non-face
 * groups are assumed evenly spread, because the app does not track rank
 * composition beyond the face-card count.
 */
export type CardMatch =
  | { kind: 'suit'; suit: Suit }
  | { kind: 'face' }
  /** The ranks named, e.g. ["10", "4"] for "each played 10 or 4". */
  | { kind: 'rank'; ranks: Rank[] }
  /** Every card. */
  | { kind: 'any' }
  /** One suit that changes every round (Ancient Joker): on average a quarter. */
  | { kind: 'rotatingSuit' }
  /**
   * One card of the deck, rank and suit, that changes every round (The Idol):
   * on a standard deck one card in 52, more on a deck stacked with copies.
   */
  | { kind: 'rotatingCard' };

/** A contribution that repeats, once per matching card or per counted thing. */
export interface ScoreContribution {
  chips?: number;
  mult?: number;
  /** Compounds per repetition, so it is raised to the power of the count. */
  xmult?: number;
}

/**
 * Things a joker can scale with that the run already tracks exactly, so the
 * estimate needs no assumption at all. Board counts are read off the board the
 * estimate is scoring, so a joker being considered counts itself.
 */
export type RunCount =
  /** Empty joker slots, with every Joker Stencil after the first counted as empty. */
  | 'stencilSlots'
  | 'jokers'
  | 'discardsPerRound'
  | 'deckSize'
  | 'cardsRemovedFromDeck'
  | 'money'
  /** Completed $5 steps of money (Bootstraps). */
  | 'moneyFives'
  | 'steelCards'
  | 'stoneCards'
  /** Sell value of every other joker on the board (Swashbuckler). */
  | 'otherJokerSellValue'
  /** Uncommon jokers on the board (Baseball Card). */
  | 'uncommonJokers';

/** How often an effect fires, when that is not every hand. */
export interface ScoreTiming {
  /**
   * A listed probability ("1 in 2" is 0.5). Oops! All 6s doubles it, which is
   * why it is kept apart from `every`.
   */
  chance?: number;
  /** Fires once every this many hands (Loyalty Card). Not a listed probability. */
  every?: number;
  /** Fires on the last hand of a round only (Acrobat, Dusk). */
  finalHand?: boolean;
}

/** Retriggers of played cards. */
export interface Retrigger extends ScoreTiming {
  match: CardMatch;
  /** Extra triggers per matching card. */
  times: number;
  /** Only the first scoring card (Hanging Chad). */
  firstOnly?: boolean;
}

/** Score contribution of a joker, as far as it is modelled. */
export interface JokerScore extends ScoreContribution, ScoreTiming {
  /** Only contributes when the estimated hand contains this. */
  requiresHand?: HandType;
  /** Only contributes when the hand plays at most this many cards (Half Joker). */
  maxCards?: number;
  /** Only contributes with at least this many enhanced cards in the deck (Driver's License). */
  minEnhanced?: number;
  /** Only contributes when every card held in hand is one of these suits (Blackboard). */
  heldAllSuits?: Suit[];
  /** Fires once per scoring card that matches; the count is an expectation. */
  perCard?: ScoreContribution & ScoreTiming & {
    match: CardMatch;
    /** Only the first scoring card that matches (Photograph). */
    firstOnly?: boolean;
  };
  /** Fires once per card held in hand that matches (Baron, Shoot the Moon). */
  perHeld?: ScoreContribution & { match: CardMatch };
  /** Adds this many Mult per rank of the lowest card held in hand (Raised Fist). */
  lowestHeldMult?: number;
  /** Scales with something the run tracks, counted exactly. */
  perCount?: ScoreContribution & {
    of: RunCount;
    /** Each counted thing multiplies separately (X1.5 each), instead of building one X(1 + 0.5n). */
    compounds?: boolean;
  };
  /** Retriggers played cards. */
  retrigger?: Retrigger;
  /** Retriggers every held-in-hand ability this many times (Mime). */
  retriggerHeld?: number;
  /** Copies another joker's ability: the one to its right, or the leftmost. */
  copies?: 'right' | 'leftmost';
}

export interface JokerDef {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity;
  effect: string;
  rating: Record<Phase, number>; // 0..10 per phase
  tags: SynergyTag[];
  score?: JokerScore;
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
  stickers?: JokerStickers;
}

export interface RunState {
  /** Ties logged decisions to the run's result. Absent on runs from before the log. */
  id?: string;
  deck: string;
  stake: string;
  ante: number;
  /**
   * The round counter the game shows beside the ante. Nothing reads it yet —
   * it is here so a screenshot import can carry it over and the run screen can
   * show where you are, the way the game does.
   */
  round: number;
  money: number;
  jokerSlots: number;
  consumableSlots: number;
  jokers: OwnedJoker[];
  vouchers: string[]; // voucher ids redeemed this run
  consumables: string[]; // consumable ids currently held
  handLevels: Record<HandType, number>; // all start at 1
  /**
   * The hand the player actually builds around, declared once instead of
   * counted per play. Null until they decide — every signal reading it falls
   * back to something sensible rather than demanding the input.
   */
  primaryHand: HandType | null;
  handsPerRound: number;
  discardsPerRound: number;
  deckProfile: DeckProfile;
  /**
   * The boss blind of the current ante, once the player has looked it up. The
   * game shows it from the start of the ante, so it is known in every shop.
   */
  boss: string | null;
  status: 'active' | 'won' | 'lost';
}

export type ShopCardSlot =
  | { kind: 'joker'; jokerId: string; edition: Edition; stickers?: JokerStickers; price: number }
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
  /**
   * Ranking value: the estimated score multiplier after paying for the action.
   * Buying nothing is exactly 1, so above 1 beats sitting on your money and
   * below 1 does not. 0 means the action cannot be taken at all.
   */
  score: number;
  /** The score multiplier on its own, before the cost is charged. */
  impact: number;
  /** Dollars the action gives up: its price, lost interest and any upkeep. */
  costDollars: number;
  /** Action priority. This is desirability, not model certainty. */
  priority: 'high' | 'medium' | 'low';
  /** How much of the recommendation comes from explicit mechanics vs heuristics. */
  evidence: 'modeled' | 'partial' | 'heuristic';
  reasons: string[];
  refId?: string; // catalog id this refers to, if any
}

export function phaseForAnte(ante: number): Phase {
  return ante <= 2 ? 'early' : ante <= 5 ? 'mid' : 'late';
}

export interface ArchetypeDef {
  id: string;
  name: string;
  description: string;
  coreTags: SynergyTag[];
  keyJokers: string[]; // joker ids worth watching for
  hands: HandType[]; // hands to level for this build
}

export interface DeckStrategyDef {
  deck: string;
  boosts: Record<string, number>; // archetype id -> score modifier
  excluded: string[]; // archetype ids unplayable on this deck
  note?: string;
}

export type Commitment = 'open' | 'lean' | 'commit';

export interface StrategyCandidate {
  archetypeId: string;
  name: string;
  score: number;
  reasons: string[];
  watchlist: string[]; // names of key jokers not yet owned
  hands: HandType[];
}

export interface StrategyAdvice {
  commitment: Commitment;
  candidates: StrategyCandidate[]; // top 3, best first
}

export const SUITS = ['hearts', 'diamonds', 'spades', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

export const ENHANCEMENT_TYPES = ['bonus', 'mult', 'wild', 'glass', 'steel', 'stone', 'gold', 'lucky'] as const;
export type EnhancementType = (typeof ENHANCEMENT_TYPES)[number];

export interface DeckProfile {
  suits: Record<Suit, number>;
  faceCards: number;
  deckSize: number;
  enhanced: Record<EnhancementType, number>;
}

/**
 * A boss blind and the parts of its effect the score estimate can express.
 * Anything not described by a field is named in `effect` but not modelled.
 */
export interface BossDef {
  id: string;
  name: string;
  /** Earliest ante the boss can appear in. */
  minAnte: number;
  /** Showdown bosses appear only on ante 8 (and every eighth ante after). */
  finisher?: boolean;
  effect: string;
  /** Blind size as a multiple of the ante's base amount. Most bosses are 2. */
  size: number;
  /** Cards that score nothing and trigger nothing. */
  debuff?: { suit: Suit } | { face: true } | { all: true };
  /** The Flint: base Chips and Mult of the hand are halved. */
  halveBase?: boolean;
  /** The Arm: every played hand loses a level. */
  levelDown?: boolean;
  /** Change to hand size (The Manacle). */
  handSize?: number;
  /** Hands this round, overriding the run's (The Needle). */
  hands?: number;
  /** Discards this round, overriding the run's (The Water). */
  discards?: number;
  /** Cards every hand must play (The Psychic). */
  playCards?: number;
  /** Each hand type can be played only once this round (The Eye). */
  noRepeatHand?: boolean;
}
