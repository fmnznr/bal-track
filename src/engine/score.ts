import handValuesJson from '../data/handValues.json';
import blindsJson from '../data/blinds.json';
import { getJoker } from '../catalog/catalog';
import { HAND_TYPES } from '../types';
import type {
  BossDef, Edition, HandType, HandValueDef, JokerDef, JokerScore, Rarity, RunCount, RunState,
  ScoreContribution, ScoreTiming, Suit,
} from '../types';
import {
  cardTypes, expectedLowestRankValue, hasSuit, isFace, matchWeight, rankChips,
} from './cards';
import type { CardRules, CardType } from './cards';
import { sellValue } from './economy';
import { stakeHas } from './gameRules';
import { TUNING } from './tuning';

// Shape-checked by src/data/schema.ts: `npm run validate:catalog` parses this
// file at build time, and tsc fails if the schema drifts from the type here.
const handValues = handValuesJson as unknown as HandValueDef[];
const blinds = blindsJson as {
  anteBase: number[];
  greenStakeAnteBase: number[];
  purpleStakeAnteBase: number[];
  multipliers: { small: number; big: number; boss: number };
};
const byHand = new Map(handValues.map(h => [h.hand, h]));

/**
 * Which hand types a played hand also counts as. Balatro's joker conditions read
 * "if played hand contains a Pair", so a Full House triggers every Pair joker.
 * The gaps are deliberate: Four of a Kind is not Two Pair, and Five of a Kind is
 * neither Two Pair nor a Full House.
 */
const HAND_CONTAINS: Record<HandType, readonly HandType[]> = {
  'High Card': ['High Card'],
  Pair: ['Pair'],
  'Two Pair': ['Pair', 'Two Pair'],
  'Three of a Kind': ['Pair', 'Three of a Kind'],
  Straight: ['Straight'],
  Flush: ['Flush'],
  'Full House': ['Pair', 'Two Pair', 'Three of a Kind', 'Full House'],
  'Four of a Kind': ['Pair', 'Three of a Kind', 'Four of a Kind'],
  'Straight Flush': ['Straight', 'Flush', 'Straight Flush'],
  'Five of a Kind': ['Pair', 'Three of a Kind', 'Four of a Kind', 'Five of a Kind'],
  'Flush House': ['Pair', 'Two Pair', 'Three of a Kind', 'Full House', 'Flush', 'Flush House'],
  'Flush Five': ['Pair', 'Three of a Kind', 'Four of a Kind', 'Five of a Kind', 'Flush', 'Flush Five'],
};

/** Whether a joker requiring `required` fires on a played `hand`. */
export function handContains(hand: HandType, required: HandType): boolean {
  return HAND_CONTAINS[hand].includes(required);
}

function anteBase(ante: number, stake: string): number {
  const safeAnte = Number.isFinite(ante) ? Math.floor(ante) : 1;
  const table = stakeHas(stake, 'Purple')
    ? blinds.purpleStakeAnteBase
    : stakeHas(stake, 'Green')
      ? blinds.greenStakeAnteBase
      : blinds.anteBase;
  return table[Math.min(8, Math.max(0, safeAnte))];
}

/** Plasma doubles every blind requirement. */
function deckBlindFactor(deck?: string): number {
  return deck === 'Plasma' ? 2 : 1;
}

export function blindTargets(ante: number, deck?: string, stake = 'White'): { small: number; big: number; boss: number } {
  const base = anteBase(ante, stake);
  const deckFactor = deckBlindFactor(deck);
  return {
    small: Math.round(base * blinds.multipliers.small * deckFactor),
    big: Math.round(base * blinds.multipliers.big * deckFactor),
    boss: Math.round(base * blinds.multipliers.boss * deckFactor),
  };
}

/** What a specific boss asks for: The Wall is twice a normal boss, The Needle half. */
export function bossTarget(run: Pick<RunState, 'ante' | 'deck' | 'stake'>, boss: BossDef): number {
  return Math.round(anteBase(run.ante, run.stake) * boss.size * deckBlindFactor(run.deck));
}

/** Cards a hand scores, which is also what the estimate assumes you play. */
export function scoringCards(hand: HandType): number {
  return byHand.get(hand)?.scoringCards ?? 5;
}

/** The hand the estimate should describe: what you build around, else what you levelled. */
export function referenceHand(run: RunState): HandType {
  if (run.primaryHand) return run.primaryHand;
  let best: HandType = 'High Card';
  for (const hand of HAND_TYPES) {
    if (run.handLevels[hand] > run.handLevels[best]) best = hand;
  }
  return best;
}

const EDITION_CHIPS: Record<Edition, number> = { base: 0, foil: 50, holographic: 0, polychrome: 0, negative: 0 };
const EDITION_MULT: Record<Edition, number> = { base: 0, foil: 0, holographic: 10, polychrome: 0, negative: 0 };
const EDITION_XMULT: Record<Edition, number> = { base: 1, foil: 1, holographic: 1, polychrome: 1.5, negative: 1 };

/** What a card enhancement adds each time the card scores. Game rules, not tuning. */
const ENHANCEMENT = {
  bonusChips: 30,
  stoneChips: 50,
  multMult: 4,
  glassXmult: 2,
  luckyMult: 20,
  luckyChance: 1 / 5,
  steelHeldXmult: 1.5,
} as const;

/** A full hand before anything changes it. */
const BASE_HAND_SIZE = 8;

/**
 * Jokers that change hand size, which decides how many cards sit in hand for
 * Baron, Shoot the Moon, Raised Fist and Steel cards. Turtle Bean starts at +5
 * and loses one a round, so it is counted at its average over a run.
 */
const HAND_SIZE_JOKERS: Record<string, number> = {
  juggler: 1,
  troubadour: 2,
  'turtle-bean': 3,
  'merry-andy': -1,
  stuntman: -2,
};
const HAND_SIZE_VOUCHERS: Record<string, number> = { 'paint-brush': 1, palette: 1 };
const HAND_SIZE_DECKS: Record<string, number> = { Painted: 2 };

/** Jokers whose whole effect is a rule the estimate applies to every card. */
const RULE_JOKERS = new Set(['pareidolia', 'smeared-joker', 'oops-all-6s', 'chicot']);

export interface ScoreEstimate {
  chips: number;
  mult: number;
  score: number;
  modeled: string[];
  /** Modelled, but this hand does not trigger them. */
  inactive: string[];
  unmodeled: string[];
}

export interface EstimateOptions {
  /** Score against this boss blind's effects. Chicot on the board cancels them. */
  boss?: BossDef | null;
}

/** A joker reduced to what the score model can actually read from it. */
export interface ScoringJoker {
  id: string;
  name: string;
  score?: JokerScore;
  edition: Edition;
  rarity: Rarity;
  sellValue: number;
}

function toScoring(def: JokerDef, edition: Edition, stickers?: { rental?: boolean }): ScoringJoker {
  return {
    id: def.id,
    name: def.name,
    score: def.score,
    edition,
    rarity: def.rarity,
    sellValue: sellValue(def.cost, edition, stickers),
  };
}

export function boardOf(run: RunState): ScoringJoker[] {
  const board: ScoringJoker[] = [];
  for (const owned of run.jokers) {
    const joker = getJoker(owned.jokerId);
    if (joker) board.push(toScoring(joker, owned.edition, owned.stickers));
  }
  return board;
}

/** Hand size with the deck, vouchers and jokers that change it. */
export function handSize(run: RunState, board: ScoringJoker[] = boardOf(run), boss?: BossDef | null): number {
  let size = BASE_HAND_SIZE + (HAND_SIZE_DECKS[run.deck] ?? 0) + (boss?.handSize ?? 0);
  for (const v of run.vouchers) size += HAND_SIZE_VOUCHERS[v] ?? 0;
  for (const j of board) size += HAND_SIZE_JOKERS[j.id] ?? 0;
  return Math.max(1, size);
}

/** What a joker slot actually does once Blueprint and Brainstorm are resolved. */
type Ability =
  | { kind: 'score'; score: JokerScore }
  | { kind: 'unmodeled' }
  /** A copy joker with nothing to copy. */
  | { kind: 'nothing' };

function resolveAbility(board: ScoringJoker[], index: number, seen: Set<number> = new Set()): Ability {
  const score = board[index]?.score;
  if (!score) return { kind: 'unmodeled' };
  if (!score.copies) return { kind: 'score', score };
  const target = score.copies === 'right' ? index + 1 : 0;
  if (target === index || target >= board.length || seen.has(target)) return { kind: 'nothing' };
  return resolveAbility(board, target, new Set([...seen, index]));
}

/** Everything the phases of one estimate share. */
interface Context {
  run: RunState;
  hand: HandType;
  board: ScoringJoker[];
  abilities: Ability[];
  types: CardType[];
  rules: CardRules;
  boss: BossDef | null;
  hands: number;
  discards: number;
  playedCards: number;
  heldCards: number;
  chanceFactor: number;
  /** Per card type, in `types` order: triggers when played, first-card extras, triggers when held. */
  played: number[];
  firstExtra: number[];
  held: number[];
}

function contextFor(run: RunState, hand: HandType, board: ScoringJoker[], options: EstimateOptions): Context {
  const ids = new Set(board.map(j => j.id));
  const boss = options.boss && !ids.has('chicot') ? options.boss : null;
  const def = byHand.get(hand);
  const playedCards = Math.max(def?.scoringCards ?? 1, boss?.playCards ?? 0);
  const oops = board.filter(j => j.id === 'oops-all-6s').length;
  const ctx: Context = {
    run,
    hand,
    board,
    abilities: board.map((_, i) => resolveAbility(board, i)),
    types: cardTypes(run.deckProfile),
    rules: { allFace: ids.has('pareidolia'), smeared: ids.has('smeared-joker') },
    boss,
    hands: Math.max(1, boss?.hands ?? run.handsPerRound),
    discards: boss?.discards ?? run.discardsPerRound,
    playedCards,
    heldCards: Math.max(0, handSize(run, board, boss) - playedCards),
    chanceFactor: 2 ** oops,
    played: [],
    firstExtra: [],
    held: [],
  };
  ctx.played = ctx.types.map(c => playedTriggers(c, ctx));
  ctx.firstExtra = ctx.types.map(c => firstCardExtra(c, ctx));
  ctx.held = ctx.types.map(c => heldTriggers(c, ctx));
  return ctx;
}

/** Share of hands an effect fires on. */
function timingWeight(timing: ScoreTiming, ctx: Context): number {
  let w = 1;
  if (timing.chance !== undefined) w *= Math.min(1, timing.chance * ctx.chanceFactor);
  if (timing.every !== undefined) w /= timing.every;
  if (timing.finalHand) w /= ctx.hands;
  return w;
}

function debuffed(card: CardType, ctx: Context): boolean {
  const debuff = ctx.boss?.debuff;
  if (!debuff) return false;
  if ('all' in debuff) return true;
  if ('face' in debuff) return isFace(card, ctx.rules);
  return hasSuit(card, debuff.suit, ctx.rules);
}

/** Expected number of times a random scoring card is triggered, per card type. */
function playedTriggers(card: CardType, ctx: Context): number {
  if (debuffed(card, ctx)) return 0;
  let triggers = 1;
  for (const a of ctx.abilities) {
    const r = a.kind === 'score' ? a.score.retrigger : undefined;
    if (!r || r.firstOnly) continue;
    triggers += r.times * timingWeight(r, ctx) * matchWeight(card, r.match, ctx.rules);
  }
  return triggers;
}

/** Extra triggers the first scoring card gets (Hanging Chad), per card type. */
function firstCardExtra(card: CardType, ctx: Context): number {
  if (debuffed(card, ctx)) return 0;
  let extra = 0;
  for (const a of ctx.abilities) {
    const r = a.kind === 'score' ? a.score.retrigger : undefined;
    if (!r?.firstOnly) continue;
    extra += r.times * timingWeight(r, ctx) * matchWeight(card, r.match, ctx.rules);
  }
  return extra;
}

function heldTriggers(card: CardType, ctx: Context): number {
  if (debuffed(card, ctx)) return 0;
  let triggers = 1;
  for (const a of ctx.abilities) {
    if (a.kind === 'score' && a.score.retriggerHeld) triggers += a.score.retriggerHeld;
  }
  return triggers;
}

interface Tally {
  chips: number;
  mult: number;
}

/**
 * Applies one scoring card's worth of effects, averaged over the deck, where
 * `triggers` says how often each card type fires in this slot.
 *
 * Order follows the game: the card's own chips and enhancement, then every
 * joker's per-card effect left to right. Retriggers repeat the whole sequence,
 * which is why they scale every count here rather than being a joker effect.
 */
function scoreCardSlot(tally: Tally, ctx: Context, triggers: number[]): void {
  const luckyChance = Math.min(1, ENHANCEMENT.luckyChance * ctx.chanceFactor);
  let glass = 0;
  ctx.types.forEach((card, t) => {
    const n = card.p * triggers[t];
    if (n <= 0) return;
    if (card.rank && card.enhancement !== 'stone') tally.chips += n * rankChips(card.rank);
    if (card.enhancement === 'bonus') tally.chips += n * ENHANCEMENT.bonusChips;
    if (card.enhancement === 'stone') tally.chips += n * ENHANCEMENT.stoneChips;
    if (card.enhancement === 'mult') tally.mult += n * ENHANCEMENT.multMult;
    if (card.enhancement === 'lucky') tally.mult += n * luckyChance * ENHANCEMENT.luckyMult;
    if (card.enhancement === 'glass') glass += n;
  });
  tally.mult *= ENHANCEMENT.glassXmult ** glass;

  for (const a of ctx.abilities) {
    const per = a.kind === 'score' ? a.score.perCard : undefined;
    if (!per || per.firstOnly) continue;
    const count = ctx.types.reduce((sum, c, t) => sum + c.p * triggers[t] * matchWeight(c, per.match, ctx.rules), 0);
    applyRepeated(tally, per, count, timingWeight(per, ctx));
  }
}

/** A per-card effect firing `count` times, each with probability `w`. */
function applyRepeated(tally: Tally, part: ScoreContribution, count: number, w: number): void {
  if (count <= 0) return;
  tally.chips += (part.chips ?? 0) * w * count;
  tally.mult += (part.mult ?? 0) * w * count;
  // Each trigger is its own multiplication, so a fractional expected count
  // becomes a fractional power rather than a fractional factor.
  if (part.xmult !== undefined) tally.mult *= (1 + w * (part.xmult - 1)) ** count;
}

/** "Only the first matching card" effects (Photograph), including that card's retriggers. */
function scoreFirstMatches(tally: Tally, ctx: Context, scoring: number): void {
  for (const a of ctx.abilities) {
    const per = a.kind === 'score' ? a.score.perCard : undefined;
    if (!per?.firstOnly) continue;
    const share = ctx.types.reduce(
      (sum, c) => sum + c.p * (debuffed(c, ctx) ? 0 : matchWeight(c, per.match, ctx.rules)), 0,
    );
    if (share <= 0) continue;
    const triggersIfMatching = ctx.types.reduce(
      (sum, c, t) => sum + c.p * matchWeight(c, per.match, ctx.rules) * ctx.played[t], 0,
    ) / share;
    // Hanging Chad's extra triggers land on it only when it is also the first card.
    const chad = ctx.types.reduce(
      (sum, c, t) => sum + c.p * matchWeight(c, per.match, ctx.rules) * ctx.firstExtra[t], 0,
    );
    const anyMatch = 1 - (1 - share) ** scoring;
    applyRepeated(tally, per, anyMatch * triggersIfMatching + chad, timingWeight(per, ctx));
  }
}

/** One card held in hand, averaged over the deck: Steel cards, then jokers left to right. */
function scoreHeldSlot(tally: Tally, ctx: Context): void {
  const steel = ctx.types.reduce(
    (sum, c, t) => sum + (c.enhancement === 'steel' ? c.p * ctx.held[t] : 0), 0,
  );
  tally.mult *= ENHANCEMENT.steelHeldXmult ** steel;
  for (const a of ctx.abilities) {
    const per = a.kind === 'score' ? a.score.perHeld : undefined;
    if (!per) continue;
    const count = ctx.types.reduce((sum, c, t) => sum + c.p * ctx.held[t] * matchWeight(c, per.match, ctx.rules), 0);
    applyRepeated(tally, per, count, 1);
  }
}

/** Chance every held card is one of these suits. Vacuously true with an empty hand. */
function allHeldIn(suits: readonly Suit[], ctx: Context): number {
  const perCard = ctx.types.reduce(
    (sum, c) => sum + (suits.some(s => hasSuit(c, s, ctx.rules)) ? c.p : 0), 0,
  );
  return perCard ** ctx.heldCards;
}

/** A full Balatro deck, the baseline Erosion counts removals against. */
const STANDARD_DECK_SIZE = 52;

/** Counts a joker can scale with, read off the run and the board being scored. */
function runCount(of: RunCount, ctx: Context, index: number): number {
  const { run, board } = ctx;
  switch (of) {
    case 'stencilSlots': {
      const used = board.filter(j => j.edition !== 'negative').length;
      const stencils = board.filter(j => j.id === 'joker-stencil').length;
      return Math.max(0, run.jokerSlots - used) + stencils - 1;
    }
    case 'jokers':
      return board.length;
    case 'discardsPerRound':
      return ctx.discards;
    case 'deckSize':
      return run.deckProfile.deckSize;
    case 'cardsRemovedFromDeck':
      return Math.max(0, STANDARD_DECK_SIZE - run.deckProfile.deckSize);
    case 'money':
      return Math.max(0, run.money);
    case 'moneyFives':
      return Math.max(0, Math.floor(run.money / 5));
    case 'steelCards':
      return run.deckProfile.enhanced.steel;
    case 'stoneCards':
      return run.deckProfile.enhanced.stone;
    case 'otherJokerSellValue':
      return board.reduce((sum, j, i) => (i === index ? sum : sum + j.sellValue), 0);
    case 'uncommonJokers':
      return board.filter((j, i) => i !== index && j.rarity === 'uncommon').length;
  }
}

function enhancedCount(run: RunState): number {
  return Object.values(run.deckProfile.enhanced).reduce((a, b) => a + b, 0);
}

/** Whether a joker's own ability can fire on this hand at all. */
function applies(score: JokerScore, ctx: Context): boolean {
  if (score.requiresHand && !handContains(ctx.hand, score.requiresHand)) return false;
  if (score.maxCards !== undefined && ctx.playedCards > score.maxCards) return false;
  if (score.minEnhanced !== undefined && enhancedCount(ctx.run) < score.minEnhanced) return false;
  return true;
}

function baseValues(run: RunState, hand: HandType, def: HandValueDef, boss: BossDef | null): Tally {
  const level = Math.max(1, (run.handLevels[hand] ?? 1) - (boss?.levelDown ? 1 : 0));
  const chips = def.baseChips + def.chipsPerLevel * (level - 1);
  const mult = def.baseMult + def.multPerLevel * (level - 1);
  if (boss?.halveBase) return { chips: Math.ceil(chips / 2), mult: Math.ceil(mult / 2) };
  return { chips, mult };
}

export function estimateWithBoard(
  run: RunState,
  hand: HandType,
  board: ScoringJoker[],
  options: EstimateOptions = {},
): ScoreEstimate {
  const def = byHand.get(hand);
  if (!def) return { chips: 0, mult: 0, score: 0, modeled: [], inactive: [], unmodeled: [] };
  const ctx = contextFor(run, hand, board, options);
  const tally = baseValues(run, hand, def, ctx.boss);

  // 1. Played cards. The first card's extra triggers and first-match effects
  //    come first, then every scoring card as an average over the deck.
  scoreCardSlot(tally, ctx, ctx.firstExtra);
  scoreFirstMatches(tally, ctx, def.scoringCards);
  for (let i = 0; i < def.scoringCards; i++) scoreCardSlot(tally, ctx, ctx.played);

  // 2. Cards held in hand.
  for (let i = 0; i < ctx.heldCards; i++) scoreHeldSlot(tally, ctx);
  for (const a of ctx.abilities) {
    if (a.kind !== 'score' || !a.score.lowestHeldMult) continue;
    const mime = ctx.abilities.reduce((n, b) => n + (b.kind === 'score' ? b.score.retriggerHeld ?? 0 : 0), 0);
    tally.mult += a.score.lowestHeldMult * expectedLowestRankValue(ctx.types, ctx.heldCards) * (1 + mime);
  }

  // 3. Jokers, left to right: their own effect, then their edition.
  const modeled: string[] = [];
  const inactive: string[] = [];
  const unmodeled: string[] = [];
  board.forEach((joker, i) => {
    const ability = ctx.abilities[i];
    if (ability.kind === 'unmodeled') {
      if (RULE_JOKERS.has(joker.id) || joker.id in HAND_SIZE_JOKERS) modeled.push(joker.name);
      else unmodeled.push(joker.name);
    } else if (ability.kind === 'nothing' || !applies(ability.score, ctx)) {
      inactive.push(joker.name);
    } else {
      const score = ability.score;
      const w = timingWeight(score, ctx) * (score.heldAllSuits ? allHeldIn(score.heldAllSuits, ctx) : 1);
      applyRepeated(tally, score, 1, w);
      if (score.perCount) {
        const n = runCount(score.perCount.of, ctx, i);
        if (score.perCount.compounds) {
          applyRepeated(tally, score.perCount, n, 1);
        } else if (n > 0) {
          // "X0.2 Mult for each Steel Card" builds one X(1 + 0.2n); applying X0.2
          // n times instead would turn Steel Joker into a penalty.
          tally.chips += (score.perCount.chips ?? 0) * n;
          tally.mult += (score.perCount.mult ?? 0) * n;
          if (score.perCount.xmult !== undefined) tally.mult *= 1 + score.perCount.xmult * n;
        }
      }
      modeled.push(joker.name);
    }
    // A joker's edition is a flat bonus on the card itself: it scores every hand
    // whether or not the joker's own ability fires.
    tally.chips += EDITION_CHIPS[joker.edition];
    tally.mult += EDITION_MULT[joker.edition];
    tally.mult *= EDITION_XMULT[joker.edition];
  });

  const rounded = { chips: Math.round(tally.chips), mult: Math.round(tally.mult * 100) / 100 };
  const score = run.deck === 'Plasma'
    ? Math.round(((rounded.chips + rounded.mult) / 2) ** 2)
    : Math.round(rounded.chips * rounded.mult);
  return { ...rounded, score, modeled, inactive, unmodeled };
}

export function estimateHandScore(run: RunState, hand: HandType, options: EstimateOptions = {}): ScoreEstimate {
  return estimateWithBoard(run, hand, boardOf(run), options);
}

/**
 * The near-term bar: the boss blind an ante ahead, not merely the one in front
 * of you. Balatro's targets escalate by roughly 2.5x per ante, so a board that
 * only just clears today is already behind.
 *
 * This is the unit a card's worth is measured in, and the floor under the
 * baseline. It is deliberately *not* the point where more score stops helping.
 */
export function scoreTarget(run: RunState): number {
  const ante = Math.floor(run.ante) + TUNING.prior.lookaheadAntes;
  return blindTargets(ante, run.deck, run.stake).boss;
}

/**
 * The point past which more score genuinely buys nothing: the final boss of a
 * full run.
 *
 * Saturating at the near-term target instead would tell a player at ante 2 to
 * stop buying the moment they can clear ante 3 — which is how runs are lost,
 * since the bar rises roughly 2.5x every ante afterwards. Only a board that
 * already clears the last blind has finished scaling.
 */
export function scoreCeiling(run: RunState): number {
  return blindTargets(TUNING.economy.antesPerRun, run.deck, run.stake).boss;
}

/**
 * The score a card's contribution is measured against.
 *
 * Not simply your current estimate. A bare board scores about 12 against a 600
 * blind, and dividing by 12 makes every card look like a miracle: +4 Mult reads
 * as "+400%" when it is nowhere near enough to win. The baseline is therefore
 * floored at a share of the target, on the grounds that boards far below the
 * target are all equally losing and the useful question is how much a card
 * *adds*, not what it multiplies a near-zero number by.
 */
export function scoreBaseline(run: RunState, hand: HandType): number {
  const current = Math.min(estimateHandScore(run, hand).score, scoreCeiling(run));
  return Math.max(current, scoreTarget(run) * TUNING.prior.minBaselineShare);
}

/**
 * Turns an absolute score contribution into a multiplier on the baseline.
 *
 * Saturating at the target is the other half of the story: once a board clears
 * what it is building toward, more score buys nothing, and the advisor should
 * say so rather than keep recommending upgrades.
 */
export function marginalMultiplier(run: RunState, hand: HandType, contribution: number): number {
  if (contribution <= 0) return 1;
  const baseline = scoreBaseline(run, hand);
  if (baseline <= 0) return 1;
  return Math.max(1, Math.min(baseline + contribution, scoreCeiling(run)) / baseline);
}

/**
 * Whether the model can speak for this slot's ability. A copy joker is only as
 * modelled as what it copies, and one with nothing to copy yet is left to its
 * rating: an empty board says nothing about what Blueprint will be worth.
 */
function isModelledAt(board: ScoringJoker[], index: number): boolean {
  const own = board[index]?.score;
  if (!own) return true;
  return resolveAbility(board, index).kind === 'score';
}

export interface Contribution {
  /** Absolute score added, in the same units as the estimate. */
  score: number;
  /**
   * False when the joker's ability is outside the model here — a copy joker
   * whose best target is not modelled — so the caller falls back to the rating.
   */
  modelled: boolean;
}

/**
 * Absolute score that adding one joker contributes, at the slot where it does
 * the most. Zero when its modelled part cannot fire on this hand.
 *
 * `score` undefined means the joker's own ability is not modelled, so only its
 * edition contributes — the caller supplies an estimate for the ability itself.
 *
 * Every slot is tried because the best one depends on the card: an xMult joker
 * belongs right of the +Mult ones, a +Mult joker left of the xMult ones, and a
 * Blueprint left of whatever is worth copying. Placing a card where
 * jokerOrder.ts would advise, rather than always rightmost, is what lets a copy
 * joker be modelled at all.
 */
export function candidateContribution(
  run: RunState,
  hand: HandType,
  candidate: Pick<ScoringJoker, 'id' | 'name' | 'score' | 'rarity' | 'sellValue'> & { edition: Edition },
): Contribution {
  const board = boardOf(run);
  const before = estimateWithBoard(run, hand, board).score;
  let best: Contribution = { score: 0, modelled: false };
  let found = false;
  for (let at = board.length; at >= 0; at--) {
    const trial = [...board.slice(0, at), candidate, ...board.slice(at)];
    const modelled = isModelledAt(trial, at);
    const gain = Math.max(0, estimateWithBoard(run, hand, trial).score - before);
    // A modelled placement beats an unmodelled one; among equals, the larger gain.
    if (!found || (modelled && !best.modelled) || (modelled === best.modelled && gain > best.score)) {
      best = { score: gain, modelled };
      found = true;
    }
  }
  return best;
}

/**
 * What an owned joker contributes where it sits: the score lost by removing it.
 * Measured by removal, not by adding a second copy on top of the first.
 */
export function ownedContribution(run: RunState, hand: HandType, index: number, withAbility = true): Contribution {
  const board = boardOf(run);
  const self = board[index];
  if (!self) return { score: 0, modelled: false };
  const kept = withAbility ? board : board.map((j, i) => (i === index ? { ...j, score: undefined } : j));
  const without = board.filter((_, i) => i !== index);
  const gain = estimateWithBoard(run, hand, kept).score - estimateWithBoard(run, hand, without).score;
  return { score: Math.max(0, gain), modelled: isModelledAt(board, index) };
}

/** How much raising this hand's level moves the run along. Exact, not a guess. */
export function handLevelMultiplier(run: RunState, hand: HandType, levels = 1): number {
  const before = estimateHandScore(run, hand).score;
  const raised: RunState = {
    ...run,
    handLevels: { ...run.handLevels, [hand]: (run.handLevels[hand] ?? 1) + levels },
  };
  const after = estimateHandScore(raised, hand).score;
  return marginalMultiplier(run, hand, after - before);
}

/** Estimated score gain from adding this joker to the current run. */
export function estimateJokerDelta(run: RunState, hand: HandType, jokerId: string, edition: Edition): number {
  const joker = getJoker(jokerId);
  if (!joker?.score) return 0;
  return candidateContribution(run, hand, { ...toScoring(joker, edition), edition }).score;
}

/** A catalog joker as a candidate for the board. */
export function asCandidate(def: JokerDef, edition: Edition, withAbility = true): ScoringJoker {
  const joker = toScoring(def, edition);
  return withAbility ? joker : { ...joker, score: undefined };
}

export interface BossOutlook {
  boss: BossDef;
  /** Score the boss asks for, back to a normal boss's size when it is disabled. */
  target: number;
  /** The reference hand's estimate under the boss's effects. */
  score: number;
  /** Hands of the reference hand the round allows. */
  hands: number;
  /** Hands the estimate needs to clear it, or null when it scores nothing. */
  handsNeeded: number | null;
  /** Chicot on the board: the boss does nothing. */
  disabled: boolean;
}

/**
 * How the board stands against a specific boss. Disabling a boss also undoes
 * its size, as the game does for The Wall and Violet Vessel.
 */
export function bossOutlook(run: RunState, boss: BossDef, board: ScoringJoker[] = boardOf(run)): BossOutlook {
  const disabled = board.some(j => j.id === 'chicot');
  const hand = referenceHand(run);
  const score = estimateWithBoard(run, hand, board, { boss }).score;
  const target = disabled ? blindTargets(run.ante, run.deck, run.stake).boss : bossTarget(run, boss);
  const roundHands = Math.max(1, (!disabled && boss.hands) || run.handsPerRound);
  const hands = !disabled && boss.noRepeatHand ? 1 : roundHands;
  return {
    boss,
    target,
    score,
    hands,
    handsNeeded: score > 0 ? Math.ceil(target / score) : null,
    disabled,
  };
}
