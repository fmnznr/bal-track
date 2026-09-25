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
import type { BossDef, RunState } from '../types';
import { interestCapFor, INTEREST_TIER_DOLLARS } from './economy';
import { horizonRounds, interestVoucherIncome } from './projection';
import { bossOutlook } from './score';
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
 * How far a round of the reference hand gets toward this boss, capped at 1.
 *
 * The cap is the point: a boss the board clears anyway is not worth ten dollars
 * to avoid. Below it, the ratio reads as "this much more score would have made
 * this boss as easy as that one".
 */
function reach(run: RunState, boss: BossDef): number {
  const o = bossOutlook(run, boss);
  return o.target > 0 ? Math.min(1, (o.score * o.hands) / o.target) : 1;
}

interface Rerolls {
  /** Average reach against a boss with no reroll. */
  plain: number;
  /** Average reach with one reroll whenever the boss is below average. */
  once: number;
  /** Average reach rerolling until the boss is at least average. */
  untilAverage: number;
  /** Rerolls an ante takes under each policy. */
  onceUses: number;
  untilUses: number;
  pool: number;
}

function rerolls(run: RunState): Rerolls | null {
  const pool = bossesForAnte(run.ante);
  if (pool.length < 2) return null;
  const reaches = pool.map(boss => reach(run, boss));
  const mean = reaches.reduce((a, b) => a + b, 0) / reaches.length;
  const good = reaches.filter(r => r >= mean);
  const bad = reaches.length - good.length;
  const q = good.length / reaches.length;
  // A reroll draws a fresh boss, whose reach is the pool's average.
  const once = reaches.reduce((sum, r) => sum + Math.max(r, mean), 0) / reaches.length;
  const untilAverage = good.reduce((a, b) => a + b, 0) / good.length;
  return {
    plain: mean,
    once,
    untilAverage,
    onceUses: bad / reaches.length,
    untilUses: (1 - q) / q,
    pool: pool.length,
  };
}

/** Antes the horizon spans, the unit reroll costs are paid in. */
function antesInHorizon(run: RunState): number {
  return horizonRounds(run.ante) / TUNING.economy.roundsPerAnte;
}

/** A boss-round gain spread over the ante: the boss is one round in three. */
function perHand(bossRoundGain: number): number {
  return 1 + (bossRoundGain - 1) / TUNING.economy.roundsPerAnte;
}

function pct(multiplier: number): string {
  return `${Math.round((multiplier - 1) * 100)}%`;
}

function directorsCut(run: RunState): VoucherValue {
  const r = rerolls(run);
  if (!r || r.plain <= 0 || r.onceUses === 0) {
    return {
      multiplier: 1, incomeDollars: 0, evidence: 'partial',
      reasons: ['Your board handles every boss this ante about equally, so a reroll changes little'],
    };
  }
  const gain = r.once / r.plain;
  const cost = r.onceUses * REROLL_DOLLARS * antesInHorizon(run);
  return {
    multiplier: perHand(gain),
    incomeDollars: -cost,
    evidence: 'partial',
    reasons: [
      `Rerolling the ${Math.round(r.onceUses * 100)}% of bosses that are worse than average`
      + ` makes a boss round about ${pct(gain)} easier`,
      `The boss is one round in ${TUNING.economy.roundsPerAnte}; rerolls cost about $${Math.round(cost)}`
      + ` over the next ${horizonRounds(run.ante)} rounds`,
    ],
  };
}

function retcon(run: RunState): VoucherValue {
  const r = rerolls(run);
  if (!r || r.once <= 0 || r.onceUses === 0) {
    return {
      multiplier: 1, incomeDollars: 0, evidence: 'partial',
      reasons: ['Director\'s Cut already rerolls every boss worth rerolling'],
    };
  }
  // Retcon needs Director's Cut, so it is judged by what it adds to it.
  const gain = r.untilAverage / r.once;
  const extraUses = Math.max(0, r.untilUses - r.onceUses);
  const cost = extraUses * REROLL_DOLLARS * antesInHorizon(run);
  return {
    multiplier: perHand(gain),
    incomeDollars: -cost,
    evidence: 'partial',
    reasons: [
      `Rerolling until the boss is at least average, beyond Director's Cut's one roll,`
      + ` makes a boss round about ${pct(gain)} easier`,
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

const MODELS: Record<string, (run: RunState, price: number) => VoucherValue> = {
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
