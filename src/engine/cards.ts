/**
 * The deck as a probability distribution over card types.
 *
 * The score model used to price "an average card" as one number. That cannot
 * say what a retrigger of a face card is worth, whether a King is held for
 * Baron, or what share of a Flush The Club debuffs. Enumerating card types —
 * rank x suit x enhancement, with their probabilities — answers all of those
 * with the same arithmetic, and collapses to the old average on a plain deck.
 *
 * Assumptions, stated once:
 * - Rank, suit and enhancement are independent of each other.
 * - Within the face and non-face groups, ranks are evenly spread. Only the
 *   face-card count is tracked, so a deck stuffed with one rank scores better
 *   than this says.
 * - A card that is Stone has no rank and no suit.
 * - Cards in hand and cards played are drawn from the deck at these rates.
 */
import { ENHANCEMENT_TYPES, RANKS, SUITS } from '../types';
import type { CardMatch, DeckProfile, EnhancementType, Rank, Suit } from '../types';

export type Enhancement = EnhancementType | 'none';

export interface CardType {
  rank: Rank | null;
  suit: Suit | null;
  enhancement: Enhancement;
  /** Probability of drawing this type. All types sum to 1. */
  p: number;
}

const FACE_RANKS: readonly Rank[] = ['J', 'Q', 'K'];
const PLAIN_RANKS = RANKS.filter(r => !FACE_RANKS.includes(r));

/** Chips a rank scores when played: pips, 10 for faces, 11 for an Ace. */
export function rankChips(rank: Rank): number {
  if (rank === 'A') return 11;
  if (FACE_RANKS.includes(rank)) return 10;
  return Number(rank);
}

/** Rank order for "lowest card", Ace high. */
export function rankOrder(rank: Rank): number {
  return RANKS.indexOf(rank);
}

const STANDARD: DeckProfile = {
  suits: { hearts: 13, diamonds: 13, spades: 13, clubs: 13 },
  faceCards: 12,
  deckSize: 52,
  enhanced: { bonus: 0, mult: 0, wild: 0, glass: 0, steel: 0, stone: 0, gold: 0, lucky: 0 },
};

function normalised<K extends string>(counts: Record<K, number>, size: number): Record<K, number> {
  const shares = Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, Math.max(0, v as number) / size]),
  ) as Record<K, number>;
  const total = Object.values<number>(shares).reduce((a, b) => a + b, 0);
  if (total > 1) for (const k of Object.keys(shares) as K[]) shares[k] /= total;
  return shares;
}

/**
 * Every card type the deck can produce, with its probability.
 *
 * A profile whose counts overrun the deck size is scaled down rather than
 * trusted, and an empty profile falls back to a standard deck, so the estimate
 * never divides by zero or produces probabilities above one.
 */
export function cardTypes(profile: DeckProfile): CardType[] {
  // One recommendation pass scores the same deck hundreds of times.
  const cached = cache.get(profile);
  if (cached) return cached;
  const types = buildCardTypes(profile);
  cache.set(profile, types);
  return types;
}

const cache = new WeakMap<DeckProfile, CardType[]>();

function buildCardTypes(profile: DeckProfile): CardType[] {
  const deck = profile.deckSize > 0 ? profile : STANDARD;
  const size = deck.deckSize;

  const face = Math.min(1, Math.max(0, deck.faceCards / size));
  const rankP = (rank: Rank) => (FACE_RANKS.includes(rank) ? face / FACE_RANKS.length : (1 - face) / PLAIN_RANKS.length);

  const suitShares = normalised(deck.suits, size);
  const suitless = Math.max(0, 1 - SUITS.reduce((sum, s) => sum + suitShares[s], 0));

  const enhShares = normalised(deck.enhanced, size);
  const plain = Math.max(0, 1 - ENHANCEMENT_TYPES.reduce((sum, e) => sum + enhShares[e], 0));

  const types: CardType[] = [];
  if (enhShares.stone > 0) types.push({ rank: null, suit: null, enhancement: 'stone', p: enhShares.stone });
  const enhancements: [Enhancement, number][] = [
    ['none', plain],
    ...ENHANCEMENT_TYPES.filter(e => e !== 'stone').map(e => [e, enhShares[e]] as [Enhancement, number]),
  ];
  for (const [enhancement, pe] of enhancements) {
    if (pe <= 0) continue;
    for (const rank of RANKS) {
      const pr = rankP(rank);
      if (pr <= 0) continue;
      for (const suit of SUITS) {
        const p = pe * pr * suitShares[suit];
        if (p > 0) types.push({ rank, suit, enhancement, p });
      }
      if (suitless > 0) types.push({ rank, suit: null, enhancement, p: pe * pr * suitless });
    }
  }
  return types;
}

/** Board-wide rules that change what a card counts as. */
export interface CardRules {
  /** Pareidolia: every card with a rank is a face card. */
  allFace: boolean;
  /** Smeared Joker: Hearts count as Diamonds and Spades as Clubs, and back. */
  smeared: boolean;
}

export const PLAIN_RULES: CardRules = { allFace: false, smeared: false };

const SMEARED_PARTNER: Record<Suit, Suit> = {
  hearts: 'diamonds', diamonds: 'hearts', spades: 'clubs', clubs: 'spades',
};

export function isFace(card: CardType, rules: CardRules): boolean {
  if (!card.rank) return false;
  return rules.allFace || FACE_RANKS.includes(card.rank);
}

export function hasSuit(card: CardType, suit: Suit, rules: CardRules): boolean {
  if (card.enhancement === 'stone') return false;
  if (card.enhancement === 'wild') return true;
  if (!card.suit) return false;
  return card.suit === suit || (rules.smeared && SMEARED_PARTNER[card.suit] === suit);
}

/**
 * How much a card matches, from 0 to 1. Always 0 or 1 except for a rotating
 * suit, which is the chance the round's suit is one this card has.
 */
export function matchWeight(card: CardType, match: CardMatch, rules: CardRules): number {
  switch (match.kind) {
    case 'any':
      return 1;
    case 'suit':
      return hasSuit(card, match.suit, rules) ? 1 : 0;
    case 'face':
      return isFace(card, rules) ? 1 : 0;
    case 'rank':
      return card.rank && match.ranks.includes(card.rank) ? 1 : 0;
    case 'rotatingSuit':
      return SUITS.filter(s => hasSuit(card, s, rules)).length / SUITS.length;
  }
}

/** Probability a random card matches. */
export function matchShare(types: CardType[], match: CardMatch, rules: CardRules): number {
  return types.reduce((sum, c) => sum + c.p * matchWeight(c, match, rules), 0);
}

/**
 * Expected value of the lowest-ranked of `count` cards, Stone cards aside, as
 * the rank's chip value. The game's Ace is high here, as it is for Raised Fist.
 */
export function expectedLowestRankValue(types: CardType[], count: number): number {
  if (count <= 0) return 0;
  const ranked = types.filter(c => c.rank);
  const total = ranked.reduce((sum, c) => sum + c.p, 0);
  if (total <= 0) return 0;
  const byRank = RANKS.map(rank => ranked.filter(c => c.rank === rank).reduce((s, c) => s + c.p, 0) / total);
  // P(lowest >= rank i) = P(one card >= rank i) ^ count.
  let expected = 0;
  let atLeast = 1;
  for (let i = 0; i < RANKS.length; i++) {
    const atLeastNext = atLeast - byRank[i];
    const pLowestHere = atLeast ** count - Math.max(0, atLeastNext) ** count;
    expected += pLowestHere * rankChips(RANKS[i]);
    atLeast = Math.max(0, atLeastNext);
  }
  return expected;
}
