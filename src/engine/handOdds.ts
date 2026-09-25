/**
 * How likely a hand is to come together, from the hand size and the discards
 * a round allows.
 *
 * The score model assumes the reference hand is played every hand. That is
 * the right thing to score, but it leaves out whatever makes the hand easier
 * to find: another discard, a bigger hand, Four Fingers, Shortcut. This puts a
 * number on it by playing the draw out: a concrete deck built from the card
 * types, shuffled, and a simple greedy strategy per kind of hand — keep what
 * builds toward it, throw up to five of the rest, draw back up, stop as soon
 * as the hand is there.
 *
 * The strategy is deliberately plain. A strong player does better, so the
 * absolute odds here are a floor; what the engine uses is how they change
 * when a voucher or a joker changes the inputs, and that is far less
 * sensitive to how clever the strategy is.
 *
 * Seeded, so the same inputs always give the same number, and cached, because
 * a recommendation pass asks the same question many times.
 */
import { RANKS, SUITS } from '../types';
import type { HandType, RunState } from '../types';
import { cardTypes } from './cards';
import type { CardType } from './cards';
import { handsPlayedPerRound } from './projection';
import { boardOf, estimateHandScore, handSize, referenceHand } from './score';
import type { ScoringJoker } from './score';

export interface OddsRules {
  /** Smeared Joker: Hearts and Diamonds count as one suit, Spades and Clubs as another. */
  smeared: boolean;
  /** Four Fingers: Flushes and Straights need only four cards. */
  fourFingers: boolean;
  /** Shortcut: a Straight may skip one rank between cards. */
  shortcut: boolean;
}

export const PLAIN_ODDS: OddsRules = { smeared: false, fourFingers: false, shortcut: false };

/** Draws simulated per question. Enough for about a percentage point of noise. */
const TRIALS = 2000;
/** Cards thrown per discard: the game's limit. */
const DISCARD_SIZE = 5;

interface Card {
  /** 0 for a 2 up to 12 for an Ace; -1 for a Stone card. */
  rank: number;
  /** Bitmask of the suits the card counts as: all four for Wild, none for Stone. */
  suits: number;
}

const SUIT_BIT = Object.fromEntries(SUITS.map((s, i) => [s, 1 << i])) as Record<(typeof SUITS)[number], number>;
const ALL_SUITS = (1 << SUITS.length) - 1;
const PARTNER = [1, 0, 3, 2]; // hearts<->diamonds, spades<->clubs, by SUITS order

/** A deck of `size` cards whose make-up follows the card-type shares. */
function buildDeck(types: readonly CardType[], size: number, rules: OddsRules): Card[] {
  const wanted = types.map(t => t.p * size);
  const counts = wanted.map(Math.floor);
  // Largest remainders first, so the deck has exactly `size` cards.
  const order = wanted.map((w, i) => [w - Math.floor(w), i] as const).sort((a, b) => b[0] - a[0]);
  let short = size - counts.reduce((a, b) => a + b, 0);
  for (const [, i] of order) {
    if (short <= 0) break;
    counts[i] += 1;
    short -= 1;
  }
  const deck: Card[] = [];
  types.forEach((t, i) => {
    let suits = 0;
    if (t.enhancement === 'wild') suits = ALL_SUITS;
    else if (t.suit && t.enhancement !== 'stone') {
      const s = SUITS.indexOf(t.suit);
      suits = SUIT_BIT[t.suit] | (rules.smeared ? 1 << PARTNER[s] : 0);
    }
    const rank = t.rank && t.enhancement !== 'stone' ? RANKS.indexOf(t.rank) : -1;
    for (let n = 0; n < counts[i]; n += 1) deck.push({ rank, suits });
  });
  return deck;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], random: () => number): void {
  for (let i = xs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
}

function rankCounts(cards: readonly Card[]): number[] {
  const counts = new Array<number>(RANKS.length).fill(0);
  for (const c of cards) if (c.rank >= 0) counts[c.rank] += 1;
  return counts;
}

/** The suit with the most cards counting as it, and how many. */
function bestSuit(cards: readonly Card[]): { suit: number; count: number } {
  let best = { suit: 0, count: -1 };
  for (let s = 0; s < SUITS.length; s += 1) {
    const count = cards.filter(c => c.suits & (1 << s)).length;
    if (count > best.count) best = { suit: s, count };
  }
  return best;
}

/**
 * Ranks as a straight can use them, low to high: the Ace counts at both ends.
 * Returns the set of rank positions 0..13 present, where 0 is a low Ace.
 */
function straightPositions(cards: readonly Card[]): boolean[] {
  const present = new Array<boolean>(RANKS.length + 1).fill(false);
  for (const c of cards) {
    if (c.rank < 0) continue;
    present[c.rank + 1] = true;
    if (c.rank === RANKS.length - 1) present[0] = true;
  }
  return present;
}

/** Longest straight the positions allow, with gaps of one rank under Shortcut. */
function longestStraight(present: readonly boolean[], shortcut: boolean): number {
  let best = 0;
  for (let start = 0; start < present.length; start += 1) {
    if (!present[start]) continue;
    let length = 1;
    let at = start;
    for (;;) {
      if (at + 1 < present.length && present[at + 1]) at += 1;
      else if (shortcut && at + 2 < present.length && present[at + 2]) at += 2;
      else break;
      length += 1;
    }
    best = Math.max(best, length);
  }
  return best;
}

function made(cards: readonly Card[], hand: HandType, rules: OddsRules): boolean {
  const need = rules.fourFingers ? 4 : 5;
  const counts = () => rankCounts(cards).sort((a, b) => b - a);
  const inSuit = (s: number) => cards.filter(c => c.suits & (1 << s));
  switch (hand) {
    case 'High Card':
      return cards.length > 0;
    case 'Pair':
      return counts()[0] >= 2;
    case 'Two Pair': {
      const c = counts();
      return c[0] >= 2 && c[1] >= 2;
    }
    case 'Three of a Kind':
      return counts()[0] >= 3;
    case 'Four of a Kind':
      return counts()[0] >= 4;
    case 'Five of a Kind':
      return counts()[0] >= 5;
    case 'Full House': {
      const c = counts();
      return c[0] >= 3 && c[1] >= 2;
    }
    case 'Flush':
      return bestSuit(cards).count >= need;
    case 'Straight':
      return longestStraight(straightPositions(cards), rules.shortcut) >= need;
    case 'Straight Flush':
      return SUITS.some((_, s) => longestStraight(straightPositions(inSuit(s)), rules.shortcut) >= need);
    case 'Flush House':
      return SUITS.some((_, s) => {
        const c = rankCounts(inSuit(s)).sort((a, b) => b - a);
        return c[0] >= 3 && c[1] >= 2;
      });
    case 'Flush Five':
      return SUITS.some((_, s) => rankCounts(inSuit(s)).some(n => n >= 5));
  }
}

/** The five-rank window (nine under Shortcut) holding the most distinct ranks. */
function bestWindow(cards: readonly Card[], rules: OddsRules): { from: number; to: number } {
  const present = straightPositions(cards);
  const span = rules.shortcut ? 8 : 4;
  let best = { from: 0, to: span, count: -1 };
  for (let from = 0; from + span < present.length; from += 1) {
    let count = 0;
    for (let at = from; at <= from + span; at += 1) if (present[at]) count += 1;
    if (count > best.count) best = { from, to: from + span, count };
  }
  return best;
}

/** Positions a card can take in a straight: its rank, and 0 as well for an Ace. */
function positions(card: Card): number[] {
  if (card.rank < 0) return [];
  return card.rank === RANKS.length - 1 ? [card.rank + 1, 0] : [card.rank + 1];
}

/** Cards that build nothing toward a straight: outside the best window, or a second card of a rank in it. */
function straightJunk(cards: readonly Card[], rules: OddsRules): Card[] {
  const { from, to } = bestWindow(cards, rules);
  const taken = new Set<number>();
  const junk: Card[] = [];
  for (const card of cards) {
    const spot = positions(card).find(p => p >= from && p <= to && !taken.has(p));
    if (spot === undefined) junk.push(card);
    else taken.add(spot);
  }
  return junk;
}

/** Cards not of the rank the hand is being built from. */
function offRank(cards: readonly Card[], keep: (count: number) => boolean): Card[] {
  const counts = rankCounts(cards);
  return cards.filter(c => c.rank < 0 || !keep(counts[c.rank]));
}

/**
 * The cards worth throwing away toward `hand`, worst first. Only these are
 * discarded — a card that already builds toward the hand is never thrown just
 * to fill a discard.
 */
function junk(held: readonly Card[], hand: HandType, rules: OddsRules): Card[] {
  const suit = bestSuit(held).suit;
  const suited = (c: Card) => (c.suits & (1 << suit)) !== 0;
  switch (hand) {
    case 'Flush':
      return held.filter(c => !suited(c));
    case 'Straight':
      return straightJunk(held, rules);
    case 'Straight Flush': {
      const inSuit = held.filter(suited);
      return [...held.filter(c => !suited(c)), ...straightJunk(inSuit, rules)];
    }
    case 'Flush House':
    case 'Flush Five': {
      const inSuit = held.filter(suited);
      return [...held.filter(c => !suited(c)), ...offRank(inSuit, n => n >= 2)];
    }
    case 'Three of a Kind':
    case 'Four of a Kind':
    case 'Five of a Kind': {
      // Build on the most common rank alone; other pairs do not help.
      const top = Math.max(0, ...rankCounts(held));
      const counts = rankCounts(held);
      const rank = top >= 2 ? counts.indexOf(top) : -1;
      return held.filter(c => c.rank !== rank || c.rank < 0);
    }
    default:
      // Pair, Two Pair, Full House: keep whatever already repeats.
      return offRank(held, n => n >= 2);
  }
}

function attempt(deck: Card[], handSize: number, discards: number, hand: HandType, rules: OddsRules): boolean {
  const held = deck.slice(0, handSize);
  let next = handSize;
  if (made(held, hand, rules)) return true;
  for (let d = 0; d < discards && next < deck.length; d += 1) {
    const toss = junk(held, hand, rules).slice(0, Math.min(DISCARD_SIZE, deck.length - next));
    if (toss.length === 0) break;
    for (const card of toss) held.splice(held.indexOf(card), 1);
    while (held.length < handSize && next < deck.length) held.push(deck[next++]);
    if (made(held, hand, rules)) return true;
  }
  return false;
}

const cache = new Map<string, number>();

/**
 * Chance of holding `hand` at some point while spending up to `discards`
 * discards, starting from a fresh `handSize` cards. Fractional discards — a
 * round's discards spread over several hands — interpolate between the whole
 * numbers either side.
 */
export function handOdds(
  types: readonly CardType[], deckSize: number, handSize: number, discards: number,
  hand: HandType, rules: OddsRules = PLAIN_ODDS,
): number {
  const low = Math.floor(Math.max(0, discards));
  const frac = Math.max(0, discards) - low;
  const at = (d: number) => wholeOdds(types, deckSize, handSize, d, hand, rules);
  return frac === 0 ? at(low) : at(low) * (1 - frac) + at(low + 1) * frac;
}

function wholeOdds(
  types: readonly CardType[], deckSize: number, handSize: number, discards: number,
  hand: HandType, rules: OddsRules,
): number {
  const size = Math.max(1, Math.round(deckSize));
  const key = [
    types.map(t => `${t.rank}${t.suit}${t.enhancement}${t.p.toFixed(4)}`).join(','),
    size, handSize, discards, hand, rules.smeared, rules.fourFingers, rules.shortcut,
  ].join('|');
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const deck = buildDeck(types, size, rules);
  if (deck.length === 0 || handSize <= 0) return 0;
  const random = mulberry32(0x5eed);
  let hits = 0;
  for (let i = 0; i < TRIALS; i += 1) {
    shuffle(deck, random);
    if (attempt(deck, Math.min(handSize, deck.length), discards, hand, rules)) hits += 1;
  }
  const odds = hits / TRIALS;
  cache.set(key, odds);
  return odds;
}

/** The board's jokers that change what counts as a hand. */
export function oddsRules(board: readonly ScoringJoker[]): OddsRules {
  const has = (id: string) => board.some(j => j.id === id);
  return { smeared: has('smeared-joker'), fourFingers: has('four-fingers'), shortcut: has('shortcut') };
}

/** What a hand that misses is played as instead: a Pair almost always turns up. */
function fallbackFor(hand: HandType): HandType {
  return hand === 'Pair' ? 'High Card' : 'Pair';
}

export interface EffectiveScore {
  /** The reference hand's score when it comes together. */
  made: number;
  /** Chance it does, with the discards a hand gets. */
  odds: number;
  /** The score averaged over hands that make it and hands that fall back. */
  score: number;
}

/**
 * What a hand of the reference type scores on average, counting the ones that
 * do not come together.
 *
 * The round's discards are spread over the hands the board needs to clear a
 * blind: a board that wins in one hand can pour every discard into it, one
 * that needs all four gets a fraction each. A hand that misses is played as
 * a Pair, which with any discard at all nearly always turns up.
 */
export function effectiveScore(run: RunState): EffectiveScore {
  const hand = referenceHand(run);
  const made = estimateHandScore(run, hand).score;
  if (hand === 'High Card') return { made, odds: 1, score: made };
  const board = boardOf(run);
  const discards = run.discardsPerRound / Math.max(1, handsPlayedPerRound(run));
  const odds = handOdds(
    cardTypes(run.deckProfile), run.deckProfile.deckSize, handSize(run, board), discards, hand, oddsRules(board),
  );
  const miss = estimateHandScore(run, fallbackFor(hand)).score;
  return { made, odds, score: odds * made + (1 - odds) * miss };
}
