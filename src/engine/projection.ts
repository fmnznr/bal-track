/**
 * Money over the next few rounds, so a purchase is priced by what it does to
 * the bankroll you will actually have — not by one shop visit in isolation.
 *
 * The advisor used to charge a purchase its price plus a flat two rounds of
 * lost interest, and valued income jokers only through their curated rating.
 * Both are now read off a simulation: the run's income each round (blind
 * reward, spare hands, interest, income jokers, Gold cards) played forward
 * over a planning horizon, once as things stand and once with the change.
 * The difference at the end of the horizon, compounding included, is what the
 * change costs or earns.
 *
 * The simulation assumes the player banks everything inside the horizon. That
 * is the conservative reading for a purchase: money spent later is spent on
 * something, and the model does not know on what.
 */
import { getJoker } from '../catalog/catalog';
import type { JokerDef, RunState } from '../types';
import { cardTypes, isFace, hasSuit } from './cards';
import { interestCapFor, INTEREST_TIER_DOLLARS } from './economy';
import { earnsInterest, stakeHas } from './gameRules';
import { blindTargets, boardOf, estimateHandScore, handSize, referenceHand, scoringCards } from './score';
import { TUNING } from './tuning';

/**
 * Rounds of play left in the run, which is what turns a per-round cost into a
 * total one. A rental joker bought in ante 1 pays its upkeep eight times as
 * often as the same joker bought in ante 8.
 */
export function roundsRemaining(ante: number): number {
  const { antesPerRun, roundsPerAnte } = TUNING.economy;
  return Math.max(1, (antesPerRun - Math.floor(ante) + 1) * roundsPerAnte);
}

/** Rounds a purchase is judged over: the planning horizon, or what is left of the run. */
export function horizonRounds(ante: number): number {
  return Math.min(roundsRemaining(ante), TUNING.economy.planningHorizonRounds);
}

export interface IncomeSource {
  label: string;
  /** Dollars per round. */
  dollars: number;
}

/** Dollars a blind pays for beating it. Red Stake and above pay nothing for the Small Blind. */
function blindReward(run: RunState): number {
  const small = stakeHas(run.stake, 'Red') ? 0 : 3;
  return (small + 4 + 5) / 3;
}

/** How many hands a round takes to clear, against the ante's average blind. */
export function handsPlayedPerRound(run: RunState): number {
  const hands = Math.max(1, run.handsPerRound);
  const score = estimateHandScore(run, referenceHand(run)).score;
  if (score <= 0) return hands;
  const t = blindTargets(run.ante, run.deck, run.stake);
  const average = (t.small + t.big + t.boss) / 3;
  return Math.min(hands, Math.max(1, Math.ceil(average / score)));
}

interface Round {
  run: RunState;
  types: ReturnType<typeof cardTypes>;
  scoring: number;
  held: number;
  played: number;
  chance: number;
  allFace: boolean;
}

function roundOf(run: RunState): Round {
  const board = boardOf(run);
  const hand = referenceHand(run);
  const scoring = scoringCards(hand);
  return {
    run,
    types: cardTypes(run.deckProfile),
    scoring,
    held: Math.max(0, handSize(run, board) - scoring),
    played: handsPlayedPerRound(run),
    chance: 2 ** board.filter(j => j.id === 'oops-all-6s').length,
    allFace: board.some(j => j.id === 'pareidolia'),
  };
}

/** Share of cards that are face cards, Stone and rules included. */
function faceShare(r: Round): number {
  const rules = { allFace: r.allFace, smeared: false };
  return r.types.reduce((sum, c) => sum + (isFace(c, rules) ? c.p : 0), 0);
}

/**
 * What an income joker pays per round, from the same deck model the score
 * estimate uses. Jokers not listed here earn nothing the model can count.
 *
 * Rocket's payout grows by $2 for every boss beaten after it was bought, which
 * the app does not record, so it is counted at its starting $1 plus the growth
 * a new copy would see over the horizon — averaged over the rounds, because
 * the last boss of the horizon is beaten at the end of it and pays for almost
 * none of the span.
 *
 * Egg is deliberately absent. Its $3 a round is sell value, not money in hand:
 * it cannot be spent, cannot earn interest, and arrives once, if the joker is
 * ever sold. Counting it here made an Egg project like a Golden Joker.
 */
/** Rocket pays $1, and $2 more after each boss. Averaged over the rounds of
    the horizon: with three rounds to an ante, six rounds see $1, $1, $1, $3,
    $3, $3 — two dollars a round, not three. */
function rocketAverage(rounds: number): number {
  if (rounds <= 0) return 1;
  let total = 0;
  for (let i = 0; i < rounds; i += 1) {
    total += 1 + 2 * Math.floor(i / TUNING.economy.roundsPerAnte);
  }
  return total / rounds;
}

const INCOME: Record<string, (r: Round) => number> = {
  'golden-joker': () => 4,
  rocket: r => rocketAverage(horizonRounds(r.run.ante)),
  'cloud-9': r => r.run.deckProfile.deckSize * r.types.reduce((s, c) => s + (c.rank === '9' ? c.p : 0), 0),
  'delayed-gratification': r => 2 * r.run.discardsPerRound * TUNING.economy.unusedDiscardShare,
  'business-card': r => r.played * r.scoring * faceShare(r) * Math.min(1, 0.5 * r.chance) * 2,
  'rough-gem': r => r.played * r.scoring * r.types.reduce(
    (s, c) => s + (hasSuit(c, 'diamonds', { allFace: false, smeared: false }) ? c.p : 0), 0,
  ),
  'golden-ticket': r => r.played * r.scoring * r.types.reduce((s, c) => s + (c.enhancement === 'gold' ? c.p : 0), 0) * 4,
  'reserved-parking': r => r.played * r.held * faceShare(r) * Math.min(1, 0.5 * r.chance),
};

/** Whether the projection knows what this joker earns. */
export function earnsIncome(def: Pick<JokerDef, 'id'>): boolean {
  return def.id in INCOME || def.id === 'to-the-moon';
}

/** Everything a round pays before interest, source by source. */
export function roundIncome(run: RunState): IncomeSource[] {
  const r = roundOf(run);
  const spareHands = Math.max(0, Math.max(1, run.handsPerRound) - r.played);
  const sources: IncomeSource[] = [{ label: 'Blind reward', dollars: blindReward(run) }];
  if (run.deck === 'Green') {
    // Green Deck pays per spare hand and discard instead of interest.
    sources.push({ label: 'Spare hands', dollars: 2 * spareHands });
    sources.push({ label: 'Spare discards', dollars: run.discardsPerRound * TUNING.economy.unusedDiscardShare });
  } else {
    sources.push({ label: 'Spare hands', dollars: spareHands });
  }
  const gold = r.held * r.types.reduce((s, c) => s + (c.enhancement === 'gold' ? c.p : 0), 0) * 3;
  if (gold > 0) sources.push({ label: 'Gold cards held', dollars: gold });
  for (const owned of run.jokers) {
    const earn = INCOME[owned.jokerId];
    const def = getJoker(owned.jokerId);
    if (earn && def) sources.push({ label: def.name, dollars: earn(r) });
  }
  return sources.filter(s => s.dollars > 0);
}

/** Interest on a bankroll, with To the Moon's extra dollar per $5 step. */
export function interestOn(run: RunState, money: number): number {
  if (!earnsInterest(run)) return 0;
  const steps = Math.min(interestCapFor(run.vouchers), Math.max(0, Math.floor(money / INTEREST_TIER_DOLLARS)));
  const moons = run.jokers.filter(j => j.jokerId === 'to-the-moon').length;
  return steps * (1 + moons);
}

/** Money at the end of each of the next `rounds` rounds, banking everything. */
export function projectMoney(run: RunState, rounds: number): number[] {
  const perRound = roundIncome(run).reduce((sum, s) => sum + s.dollars, 0);
  const path: number[] = [];
  let money = run.money;
  for (let i = 0; i < rounds; i++) {
    money += perRound + interestOn(run, money);
    path.push(money);
  }
  return path;
}

function moneyAtHorizon(run: RunState): number {
  const path = projectMoney(run, horizonRounds(run.ante));
  return path[path.length - 1] ?? run.money;
}

/**
 * Interest a purchase costs over the horizon: the gap between banking and
 * spending, less the price itself. A buy that leaves you above the interest
 * cap costs nothing here; one that drops you to $0 costs every tier you would
 * have climbed back through.
 */
export function interestCost(run: RunState, price: number): number {
  if (price <= 0) return 0;
  const spent = { ...run, money: run.money - price };
  return Math.max(0, moneyAtHorizon(run) - moneyAtHorizon(spent) - price);
}

/**
 * What owning a joker earns over the horizon, compounding included, measured
 * as the difference it makes to the bankroll at the end.
 */
export function jokerIncome(run: RunState, def: Pick<JokerDef, 'id'>, ownedIndex?: number): number {
  if (!earnsIncome(def)) return 0;
  const withIt = ownedIndex !== undefined ? run : { ...run, jokers: [...run.jokers, { jokerId: def.id, edition: 'base' as const }] };
  const without = ownedIndex !== undefined
    ? { ...run, jokers: run.jokers.filter((_, i) => i !== ownedIndex) }
    : run;
  return Math.max(0, moneyAtHorizon(withIt) - moneyAtHorizon(without));
}
