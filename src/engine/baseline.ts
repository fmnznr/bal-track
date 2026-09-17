/**
 * A deterministic sweep of the engine, used as a golden-file regression.
 *
 * The scenario tests next to each engine module say what *should* happen in a
 * situation someone reasoned about. This says what *does* happen across a wide
 * spread of runs and shops, so a change to shared machinery — a weight, the
 * ranking formula, the score model — shows its full blast radius as a reviewable
 * diff instead of passing quietly because no hand-written scenario covered it.
 *
 * It is not a correctness oracle. A diff here is a question ("did you mean to
 * move these 40 rankings?"), never a verdict. Regenerate with:
 *
 *     npm run baseline:update
 *
 * and read the diff before committing it.
 *
 * Test-only: nothing in the app imports this module.
 */
import { newRunState } from '../run/runStore';
import { recommend, recommendPackPick } from './recommend';
import { adviseStrategy } from './strategy';
import { estimateHandScore, referenceHand } from './score';
import { checkJokerOrder, suggestJokerOrder } from './jokerOrder';
import { HAND_TYPES } from '../types';
import type { Edition, HandType, RunState, ShopState } from '../types';

const DECKS = [
  'Red', 'Blue', 'Black', 'Magic', 'Green', 'Plasma', 'Checkered', 'Abandoned',
  'Zodiac', 'Nebula', 'Ghost', 'Painted', 'Yellow', 'Erratic',
];
const STAKES = ['White', 'Red', 'Green', 'Black', 'Blue', 'Purple', 'Orange', 'Gold'];
const JOKERS = [
  'joker', 'blueprint', 'brainstorm', 'baron', 'golden-joker', 'droll-joker', 'crafty-joker',
  'greedy-joker', 'supernova', 'obelisk', 'green-joker', 'ice-cream', 'banner', 'steel-joker',
  'glass-joker', 'drivers-license', 'pareidolia', 'delayed-gratification',
];
const EDITIONS: Edition[] = ['base', 'foil', 'holographic', 'polychrome', 'negative'];
const CONSUMABLES = ['jupiter', 'mercury', 'venus', 'the-fool', 'the-chariot', 'justice', 'hex', 'the-star'];
const PACKS = ['arcana-normal', 'celestial-normal', 'buffoon-normal', 'standard-normal', 'spectral-normal'];
const VOUCHERS = ['overstock', 'telescope', 'antimatter', 'grabber', 'seed-money', 'money-tree', 'hieroglyph'];

/** Lehmer generator: same sequence on every machine and every Node version. */
function seeded(seed: number): () => number {
  let state = (seed * 2654435761) % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/** FNV-1a. Keeps reason strings verified without storing megabytes of them. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface Scenario {
  run: RunState;
  shop: ShopState;
  packOptions: string[];
}

export function scenario(index: number): Scenario {
  const r = seeded(index + 1);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const count = (max: number) => Math.floor(r() * max);

  const run: RunState = {
    ...newRunState(pick(DECKS), pick(STAKES)),
    money: count(60),
    ante: 1 + count(8),
    jokers: Array.from({ length: count(6) }, () => ({
      jokerId: pick(JOKERS),
      edition: pick(EDITIONS),
      stickers: r() > 0.7
        ? { eternal: r() > 0.5, perishable: r() > 0.5, rental: r() > 0.7 }
        : undefined,
    })),
    vouchers: Array.from({ length: count(3) }, () => pick(VOUCHERS)),
    consumables: Array.from({ length: count(3) }, () => pick(CONSUMABLES)),
    primaryHand: r() > 0.4 ? (pick(HAND_TYPES) as HandType) : null,
    handsPerRound: 1 + count(5),
    discardsPerRound: count(6),
  };
  for (const hand of HAND_TYPES) if (r() > 0.75) run.handLevels[hand] = 1 + count(8);
  run.deckProfile = {
    suits: { hearts: count(30), diamonds: count(30), spades: count(30), clubs: count(30) },
    faceCards: count(20),
    deckSize: count(60),
    enhanced: {
      bonus: count(6), mult: count(6), wild: count(6), glass: count(8),
      steel: count(8), stone: count(4), gold: count(6), lucky: count(4),
    },
  };

  const shop: ShopState = {
    cards: Array.from({ length: count(4) }, () =>
      r() > 0.4
        ? { kind: 'joker' as const, jokerId: pick(JOKERS), edition: pick(EDITIONS), price: count(20) }
        : { kind: 'consumable' as const, consumableId: pick(CONSUMABLES), price: count(10) }),
    voucherId: r() > 0.5 ? pick(VOUCHERS) : null,
    packIds: Array.from({ length: count(3) }, () => pick(PACKS)),
    rerollCost: count(12),
  };

  const packOptions = Array.from({ length: 2 + count(5) }, () =>
    (r() > 0.5 ? pick(JOKERS) : pick(CONSUMABLES)));

  return { run, shop, packOptions };
}

export const SCENARIO_COUNT = 300;

export interface BaselineEntry {
  i: number;
  /** "kind score priority evidence action" per recommendation, best first. */
  recs: string[];
  picks: string[];
  strategy: string;
  hand: HandType;
  estimate: string;
  order: string;
  /** Digest of every reason string, so their wording is covered without bloat. */
  reasons: string;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function buildBaseline(): BaselineEntry[] {
  const entries: BaselineEntry[] = [];
  for (let i = 0; i < SCENARIO_COUNT; i += 1) {
    const { run, shop, packOptions } = scenario(i);
    const recs = recommend(run, shop);
    const picks = recommendPackPick(run, packOptions);
    const advice = adviseStrategy(run);
    const hand = referenceHand(run);
    const estimate = estimateHandScore(run, hand);
    const suggestion = suggestJokerOrder(run);

    entries.push({
      i,
      recs: recs.map(r => `${r.kind} ${round(r.score)} ${r.priority} ${r.evidence} ${r.action}`),
      picks: picks.map(p => `${round(p.score)} ${p.priority} ${p.evidence} ${p.action}`),
      strategy: [
        advice.commitment,
        ...advice.candidates.map(c => `${c.archetypeId}:${round(c.score)}`),
      ].join(' '),
      hand,
      estimate: `${estimate.chips}x${estimate.mult}=${estimate.score} `
        + `modeled:${estimate.modeled.length} inactive:${estimate.inactive.length} `
        + `unmodeled:${estimate.unmodeled.length}`,
      order: `${checkJokerOrder(run).map(x => x.code).join(',')}|${suggestion?.join('') ?? '-'}`,
      reasons: hash(JSON.stringify([
        recs.map(r => r.reasons),
        picks.map(p => p.reasons),
        advice.candidates.map(c => c.reasons),
        estimate.modeled, estimate.inactive, estimate.unmodeled,
        checkJokerOrder(run).map(x => x.message),
      ])),
    });
  }
  return entries;
}
