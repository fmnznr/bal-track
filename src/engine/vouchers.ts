/**
 * Vouchers valued by what they do, not by their rating.
 *
 * Every voucher used to go through the joker rating curve, so its value was
 * its rating and nothing else: Director's Cut came out equal to Grabber and
 * Money Tree at +85% score, and Blank, which does nothing, at +8%. A voucher
 * rarely changes what a hand scores, so the curve was the wrong question for
 * most of them.
 *
 * The vouchers listed here are worked out with the machinery the engine
 * already has — the boss estimate and the money projection. The rest still
 * fall back to their rating until they get a model of their own.
 */
import { bossesForAnte, getVoucher } from '../catalog/catalog';
import type { RunState } from '../types';
import { interestCapFor, INTEREST_TIER_DOLLARS } from './economy';
import { applyVoucher } from './gameRules';
import { horizonRounds, incomeGap, interestVoucherIncome } from './projection';
import { blindTargets, bossOutlook, estimateHandScore, referenceHand } from './score';
import { TUNING } from './tuning';

export interface VoucherValue {
  /** Multiplier on hand score; exactly 1 for a voucher that adds none. */
  multiplier: number;
  /** Dollars it adds over the horizon. A voucher that costs to use is negative. */
  incomeDollars: number;
  reasons: string[];
  evidence: 'modeled' | 'partial';
}

/** What one boss reroll costs. */
const REROLL_DOLLARS = 10;

/**
 * How far a round of the reference hand gets toward a target: score times the
 * hands the round allows, over the target, capped at 1.
 *
 * The cap is the point. A blind the board clears anyway gains nothing from
 * another hand or a gentler boss; below it, the ratio reads as "this much more
 * score would have made the round as easy as that".
 */
function reachOf(score: number, hands: number, target: number): number {
  return target > 0 ? Math.min(1, (score * hands) / target) : 1;
}

/** The ante's three blinds as reach: the small and big blind, and every boss it can draw. */
interface AnteReach {
  small: number;
  big: number;
  bosses: number[];
}

function anteReach(run: RunState): AnteReach {
  const score = estimateHandScore(run, referenceHand(run)).score;
  const hands = Math.max(1, run.handsPerRound);
  const targets = blindTargets(run.ante, run.deck, run.stake);
  return {
    small: reachOf(score, hands, targets.small),
    big: reachOf(score, hands, targets.big),
    bosses: bossesForAnte(run.ante).map(boss => {
      const o = bossOutlook(run, boss);
      return reachOf(o.score, o.hands, o.target);
    }),
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);

/** An ante's reach when its boss round comes out at `boss`. */
function overAnte(a: AnteReach, boss: number): number {
  return (a.small + a.big + boss) / TUNING.economy.roundsPerAnte;
}

interface Rerolls {
  /** Average boss reach with no reroll. */
  plain: number;
  /** Rerolling once whenever the boss is below average; a fresh draw is worth the average. */
  once: number;
  /** Rerolling until the boss is at least average. */
  untilAverage: number;
  /** Rerolls an ante takes under each policy. */
  onceUses: number;
  untilUses: number;
}

function rerolls(bosses: number[]): Rerolls | null {
  if (bosses.length < 2) return null;
  const average = mean(bosses);
  const good = bosses.filter(r => r >= average);
  const q = good.length / bosses.length;
  return {
    plain: average,
    once: mean(bosses.map(r => Math.max(r, average))),
    untilAverage: mean(good),
    onceUses: 1 - q,
    untilUses: (1 - q) / q,
  };
}

/** Antes the horizon spans, the unit reroll costs are paid in. */
function antesInHorizon(run: RunState): number {
  return horizonRounds(run.ante) / TUNING.economy.roundsPerAnte;
}

function pct(multiplier: number): string {
  return `${Math.round((multiplier - 1) * 100)}%`;
}

function directorsCut(run: RunState): VoucherValue {
  const a = anteReach(run);
  const r = rerolls(a.bosses);
  if (!r || r.onceUses === 0 || overAnte(a, r.plain) <= 0) {
    return {
      multiplier: 1, incomeDollars: 0, evidence: 'partial',
      reasons: ['Your board handles every boss this ante about equally, so a reroll changes little'],
    };
  }
  const bossGain = r.once / r.plain;
  const gain = overAnte(a, r.once) / overAnte(a, r.plain);
  const cost = r.onceUses * REROLL_DOLLARS * antesInHorizon(run);
  return {
    multiplier: gain,
    incomeDollars: -cost,
    evidence: 'partial',
    reasons: [
      `Rerolling the ${Math.round(r.onceUses * 100)}% of bosses that are worse than average`
      + ` makes a boss round about ${pct(bossGain)} easier`,
      `The boss is one round in ${TUNING.economy.roundsPerAnte}; rerolls cost about $${Math.round(cost)}`
      + ` over the next ${horizonRounds(run.ante)} rounds`,
    ],
  };
}

function retcon(run: RunState): VoucherValue {
  const a = anteReach(run);
  const r = rerolls(a.bosses);
  if (!r || r.onceUses === 0 || overAnte(a, r.once) <= 0) {
    return {
      multiplier: 1, incomeDollars: 0, evidence: 'partial',
      reasons: ['Director\'s Cut already rerolls every boss worth rerolling'],
    };
  }
  // Retcon needs Director's Cut, so it is judged by what it adds to it.
  const bossGain = r.untilAverage / r.once;
  const gain = overAnte(a, r.untilAverage) / overAnte(a, r.once);
  const extraUses = Math.max(0, r.untilUses - r.onceUses);
  const cost = extraUses * REROLL_DOLLARS * antesInHorizon(run);
  return {
    multiplier: gain,
    incomeDollars: -cost,
    evidence: 'partial',
    reasons: [
      `Rerolling until the boss is at least average, beyond Director's Cut's one roll,`
      + ` makes a boss round about ${pct(bossGain)} easier`,
      `About ${extraUses.toFixed(1)} more rerolls an ante, $${Math.round(cost)}`
      + ` over the next ${horizonRounds(run.ante)} rounds`,
    ],
  };
}

function interestCap(voucherId: string) {
  return (run: RunState, price: number): VoucherValue => {
    const income = interestVoucherIncome(run, voucherId, price);
    const newCap = interestCapFor([...run.vouchers, voucherId]);
    // The old cap binds from here up; a dollar tier above it is the first to pay.
    const paysFrom = (interestCapFor(run.vouchers) + 1) * INTEREST_TIER_DOLLARS;
    const left = run.money - price;
    return {
      multiplier: 1,
      incomeDollars: income,
      evidence: 'modeled',
      reasons: income > 0
        ? [`Raises the interest cap to $${newCap}: about $${Math.round(income)} more`
          + ` over the next ${horizonRounds(run.ante)} rounds at the $${left} you would have left`]
        : [`Raises the interest cap to $${newCap}, which pays only from $${paysFrom} banked;`
          + ` you would have $${left} left`],
    };
  };
}

/**
 * A voucher that changes hands, discards or the ante, judged by comparing the
 * ante's reach with it and without, plus the money that changes with it: a
 * spare hand pays a dollar at the end of the round.
 */
function resources(voucherId: string, what: string) {
  return (run: RunState, price: number): VoucherValue => {
    const spent = { ...run, money: run.money - price };
    const after = applyVoucher(spent, voucherId);
    const beforeReach = anteReach(spent);
    const afterReach = anteReach(after);
    const before = overAnte(beforeReach, mean(beforeReach.bosses));
    const withIt = overAnte(afterReach, mean(afterReach.bosses));
    const multiplier = before > 0 ? withIt / before : 1;
    const income = incomeGap(after, spent);
    const reasons = [
      multiplier > 1.005
        ? `${what} makes the ante's rounds about ${pct(multiplier)} easier to clear with your board`
        : `${what} changes little for a board that already clears this ante's blinds`,
    ];
    if (income >= 1) {
      reasons.push(`About $${Math.round(income)} more over the next ${horizonRounds(run.ante)} rounds`
        + ' from the hand you would not need');
    }
    return { multiplier, incomeDollars: income, evidence: 'modeled', reasons };
  };
}

const MODELS: Record<string, (run: RunState, price: number) => VoucherValue> = {
  grabber: resources('grabber', 'One more hand a round'),
  'nacho-tong': resources('nacho-tong', 'One more hand a round'),
  'directors-cut': directorsCut,
  retcon,
  'seed-money': interestCap('seed-money'),
  'money-tree': interestCap('money-tree'),
  blank: () => ({
    multiplier: 1,
    incomeDollars: 0,
    evidence: 'modeled',
    reasons: ['Does nothing on its own. It unlocks Antimatter (+1 Joker slot) in a later shop,'
      + ' which is not counted here'],
  }),
};

/**
 * The voucher's worked-out value, or null to fall back to its rating.
 *
 * A second-tier voucher is only ever offered once its first tier is owned, so
 * it is judged on top of that tier even when the run does not record it —
 * Money Tree without Seed Money would otherwise be credited with both.
 */
export function voucherValue(run: RunState, voucherId: string, price: number): VoucherValue | null {
  const model = MODELS[voucherId];
  if (!model) return null;
  const requires = getVoucher(voucherId)?.requires;
  const owned = requires && !run.vouchers.includes(requires)
    ? { ...run, vouchers: [...run.vouchers, requires] }
    : run;
  return model(owned, price);
}
