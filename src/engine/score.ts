import handValuesJson from '../data/handValues.json';
import blindsJson from '../data/blinds.json';
import { getJoker } from '../catalog/catalog';
import { HAND_TYPES } from '../types';
import type {
  CardMatch, Edition, HandType, HandValueDef, JokerScore, RunCount, RunState, ScoreContribution,
} from '../types';
import { stakeHas } from './gameRules';
import { TUNING } from './tuning';
import { faceShare, suitShare } from './deckSignals';

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

/** Chips an average played card contributes, nudged by the deck's face-card share. */
function averageCardChips(run: RunState): number {
  const { deckSize, faceCards } = run.deckProfile;
  // 2-10 and aces average 6.5 chips; J/Q/K contribute 10.
  if (deckSize <= 0) return 6.5;
  const faceShare = Math.min(1, Math.max(0, faceCards / deckSize));
  return 6.5 + faceShare * 3.5;
}

export function blindTargets(ante: number, deck?: string, stake = 'White'): { small: number; big: number; boss: number } {
  const safeAnte = Number.isFinite(ante) ? Math.floor(ante) : 1;
  const table = stakeHas(stake, 'Purple')
    ? blinds.purpleStakeAnteBase
    : stakeHas(stake, 'Green')
      ? blinds.greenStakeAnteBase
      : blinds.anteBase;
  const base = table[Math.min(8, Math.max(0, safeAnte))];
  // Plasma doubles every blind requirement.
  const deckFactor = deck === 'Plasma' ? 2 : 1;
  return {
    small: Math.round(base * blinds.multipliers.small * deckFactor),
    big: Math.round(base * blinds.multipliers.big * deckFactor),
    boss: Math.round(base * blinds.multipliers.boss * deckFactor),
  };
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

export interface ScoreEstimate {
  chips: number;
  mult: number;
  score: number;
  modeled: string[];
  /** Modelled, but this hand does not trigger them. */
  inactive: string[];
  unmodeled: string[];
}

/** Ranks in a standard deck, for turning "each played 10 or 4" into a share. */
const RANKS = 13;

/**
 * The share of the deck a per-card effect matches, which is also the expected
 * share of a hand's scoring cards that trigger it.
 */
function matchShare(run: RunState, match: CardMatch): number {
  switch (match.kind) {
    case 'suit':
      return suitShare(run.deckProfile, match.suit);
    case 'face':
      return faceShare(run.deckProfile);
    case 'rank':
      // The deck profile tracks suits and faces but not ranks, so ranks are
      // assumed evenly spread. A deck stuffed with one rank scores better than
      // this says.
      return Math.min(1, Math.max(0, match.ranks / RANKS));
  }
}

/** Counts a joker can scale with, read straight off the run. */
function runCount(run: RunState, of: RunCount): number {
  switch (of) {
    case 'emptyJokerSlots':
      return Math.max(0, run.jokerSlots - run.jokers.filter(j => j.edition !== 'negative').length);
    case 'jokers':
      return run.jokers.length;
    case 'discardsPerRound':
      return run.discardsPerRound;
    case 'deckSize':
      return run.deckProfile.deckSize;
    case 'cardsRemovedFromDeck':
      return Math.max(0, STANDARD_DECK_SIZE - run.deckProfile.deckSize);
    case 'money':
      return Math.max(0, run.money);
    case 'steelCards':
      return run.deckProfile.enhanced.steel;
    case 'stoneCards':
      return run.deckProfile.enhanced.stone;
  }
}

/** A full Balatro deck, the baseline Erosion counts removals against. */
const STANDARD_DECK_SIZE = 52;

interface Repeated {
  chips: number;
  mult: number;
  xmult: number;
}

const NOTHING: Repeated = { chips: 0, mult: 0, xmult: 1 };

/**
 * A contribution triggered once per matching card.
 *
 * Each trigger is a separate multiplication, so two scoring Kings under
 * Triboulet are X2 then X2 again. A fractional expected count therefore becomes
 * a fractional power, not a fractional factor.
 */
function perTrigger(part: ScoreContribution, count: number): Repeated {
  if (count <= 0) return NOTHING;
  return {
    chips: (part.chips ?? 0) * count,
    mult: (part.mult ?? 0) * count,
    xmult: part.xmult !== undefined ? part.xmult ** count : 1,
  };
}

/**
 * A contribution that scales with a count rather than firing per card.
 *
 * These read as "X0.2 Mult for each Steel Card", which builds one multiplier of
 * 1 + 0.2n rather than applying X0.2 n times. Getting this backwards would turn
 * Steel Joker into a penalty.
 */
function perUnit(part: ScoreContribution, count: number): Repeated {
  if (count <= 0) return NOTHING;
  return {
    chips: (part.chips ?? 0) * count,
    mult: (part.mult ?? 0) * count,
    xmult: part.xmult !== undefined ? 1 + part.xmult * count : 1,
  };
}

/** A joker reduced to what the score model can actually read from it. */
interface ScoringJoker {
  name: string;
  score?: JokerScore;
  edition: Edition;
}

function boardOf(run: RunState): ScoringJoker[] {
  const board: ScoringJoker[] = [];
  for (const owned of run.jokers) {
    const joker = getJoker(owned.jokerId);
    if (joker) board.push({ name: joker.name, score: joker.score, edition: owned.edition });
  }
  return board;
}

function estimateWithBoard(run: RunState, hand: HandType, board: ScoringJoker[]): ScoreEstimate {
  const def = byHand.get(hand);
  if (!def) return { chips: 0, mult: 0, score: 0, modeled: [], inactive: [], unmodeled: [] };

  const level = run.handLevels[hand] ?? 1;
  let chips = def.baseChips + def.chipsPerLevel * (level - 1) + def.scoringCards * averageCardChips(run);
  let mult = def.baseMult + def.multPerLevel * (level - 1);
  const modeled: string[] = [];
  const inactive: string[] = [];
  const unmodeled: string[] = [];

  // Jokers trigger left to right, so additive and multiplicative effects are applied
  // in board order — the same order jokerOrder.ts advises on.
  for (const joker of board) {
    const score = joker.score;
    const applies = score !== undefined && (!score.requiresHand || handContains(hand, score.requiresHand));

    if (!score) {
      unmodeled.push(joker.name);
    } else if (applies) {
      chips += score.chips ?? 0;
      mult += score.mult ?? 0;
      mult *= score.xmult ?? 1;

      if (score.perCard) {
        const expected = def.scoringCards * matchShare(run, score.perCard.match);
        const part = perTrigger(score.perCard, expected);
        chips += part.chips;
        mult += part.mult;
        mult *= part.xmult;
      }
      if (score.perCount) {
        const part = perUnit(score.perCount, runCount(run, score.perCount.of));
        chips += part.chips;
        mult += part.mult;
        mult *= part.xmult;
      }
      modeled.push(joker.name);
    } else {
      inactive.push(joker.name);
    }
    // A joker's requiresHand gates its own ability, but its edition (foil/holo/polychrome)
    // is a flat bonus on the card itself: it scores every hand regardless of whether the
    // joker's own effect fires. Base/negative editions add zero, so this is a no-op for them.
    chips += EDITION_CHIPS[joker.edition];
    mult += EDITION_MULT[joker.edition];
    mult *= EDITION_XMULT[joker.edition];
  }

  const rounded = { chips: Math.round(chips), mult: Math.round(mult * 100) / 100 };
  const score = run.deck === 'Plasma'
    ? Math.round(((rounded.chips + rounded.mult) / 2) ** 2)
    : Math.round(rounded.chips * rounded.mult);
  return { ...rounded, score, modeled, inactive, unmodeled };
}

export function estimateHandScore(run: RunState, hand: HandType): ScoreEstimate {
  return estimateWithBoard(run, hand, boardOf(run));
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
 * Absolute score that adding one joker contributes, in the same units as the
 * estimate itself. Zero when its modelled part cannot fire on this hand.
 *
 * `score` undefined means the joker's own ability is not modelled, so only its
 * edition contributes — the caller supplies an estimate for the ability itself.
 *
 * The joker is appended rightmost, which is where an xMult joker belongs and
 * where jokerOrder.ts advises putting one. A player who leaves it elsewhere
 * gets less than this out of it.
 */
export function jokerScoreContribution(
  run: RunState,
  hand: HandType,
  score: JokerScore | undefined,
  edition: Edition,
): number {
  const before = estimateHandScore(run, hand).score;
  const after = estimateWithBoard(run, hand, [...boardOf(run), { name: '', score, edition }]).score;
  return Math.max(0, after - before);
}

/** How much adding one joker multiplies what the run is building toward. */
export function jokerScoreMultiplier(
  run: RunState,
  hand: HandType,
  score: JokerScore | undefined,
  edition: Edition,
): number {
  return marginalMultiplier(run, hand, jokerScoreContribution(run, hand, score, edition));
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
  return jokerScoreContribution(run, hand, joker.score, edition);
}
