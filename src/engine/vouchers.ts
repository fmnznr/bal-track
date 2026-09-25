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
import type { RunState, ShopHabits } from '../types';
import { interestCapFor, INTEREST_TIER_DOLLARS } from './economy';
import { applyVoucher, baseRerollCost, shopCardSlots, usedJokerSlots } from './gameRules';
import { discountPercent } from './prices';
import { horizonRounds, incomeGap, interestVoucherIncome, steadySpend } from './projection';
import { blindTargets, bossOutlook, effectiveScore, referenceHand } from './score';
import { TUNING } from './tuning';

/** What a voucher's value can depend on beyond the run itself. */
export interface VoucherContext {
  /**
   * The owned joker that would be sold to make room, with its worth on the
   * ranking scale. Null when nothing on the board could be sold.
   */
  weakest: () => { name: string; multiplier: number; incomeDollars: number; modelled: boolean } | null;
  /** How this player shops, if the app has seen enough of it. */
  habits?: ShopHabits;
}

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

/**
 * The score behind reach is the effective one: the reference hand's score
 * averaged with the Pair it falls back to when it does not come together. A
 * boss's score is scaled by the same hit rate.
 */
function anteReach(run: RunState): AnteReach {
  const effective = effectiveScore(run);
  const hitRate = effective.made > 0 ? effective.score / effective.made : 1;
  const hands = Math.max(1, run.handsPerRound);
  const targets = blindTargets(run.ante, run.deck, run.stake);
  return {
    small: reachOf(effective.score, hands, targets.small),
    big: reachOf(effective.score, hands, targets.big),
    bosses: bossesForAnte(run.ante).map(boss => {
      const o = bossOutlook(run, boss);
      return reachOf(o.score * hitRate, o.hands, o.target);
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
function resources(voucherId: string, what: string, finding = false) {
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
    if (finding) {
      const odds = (r: RunState) => Math.round(effectiveScore(r).odds * 100);
      reasons.push(`Your ${referenceHand(run)} comes together about ${odds(spent)}% of the time,`
        + ` ${odds(after)}% with it`);
      reasons.push('Odds from a plain keep-and-discard strategy; a careful player does better with or without it');
    }
    if (income >= 1) {
      reasons.push(`About $${Math.round(income)} more over the next ${horizonRounds(run.ante)} rounds`
        + ' from spare hands and discards');
    }
    return { multiplier, incomeDollars: income, evidence: finding ? 'partial' : 'modeled', reasons };
  };
}

/**
 * A shop discount, as the money it saves on what a steady bankroll spends.
 * The step is measured from the discount the run already has, so Liquidation
 * on top of Clearance Sale saves a third of what is spent, not a half.
 */
function discount(voucherId: string) {
  return (run: RunState, price: number): VoucherValue => {
    const left = { ...run, money: run.money - price };
    const before = discountPercent(run.vouchers) / 100;
    const after = discountPercent([...run.vouchers, voucherId]) / 100;
    const spend = steadySpend(left);
    const share = 1 - (1 - after) / (1 - before);
    const rounds = horizonRounds(run.ante);
    const saved = spend * share * rounds;
    return {
      multiplier: 1,
      incomeDollars: saved,
      evidence: 'partial',
      reasons: [
        `Spending what you earn, about $${Math.round(spend)} a round, it saves about $${Math.round(saved)}`
        + ` over the next ${rounds} rounds`,
        'Assumes a steady bankroll: every dollar a round pays is spent, none of it on rerolls,'
        + ' which the game does not discount',
      ],
    };
  };
}

/**
 * A joker slot, as the joker it saves you from selling. On a full board the
 * next joker worth buying displaces the weakest one; with room to spare, a
 * slot does nothing until the board fills.
 */
function antimatter(run: RunState, _price: number, context?: VoucherContext): VoucherValue | null {
  const free = run.jokerSlots - usedJokerSlots(run);
  if (free > 0) {
    return {
      multiplier: 1, incomeDollars: 0, evidence: 'modeled',
      reasons: [`You have ${free} free joker slot${free === 1 ? '' : 's'} already;`
        + ' another only pays once the board is full'],
    };
  }
  const weakest = context?.weakest();
  // Nothing on a full board can be sold (Eternal, Negative): no joker to measure the slot by.
  if (!weakest) return null;
  return {
    multiplier: weakest.multiplier,
    incomeDollars: weakest.incomeDollars,
    evidence: weakest.modelled ? 'modeled' : 'partial',
    reasons: [`Keeps ${weakest.name}, your weakest joker, when the next one arrives:`
      + ` it is worth +${pct(weakest.multiplier)}${weakest.incomeDollars >= 1
        ? ` and $${Math.round(weakest.incomeDollars)}` : ''}`],
  };
}

/**
 * Shops the player must have been counted through before their reroll rate is
 * trusted. Below it the reroll vouchers fall back to their rating rather than
 * to a guess at how people in general shop.
 */
const MIN_SHOPS = 5;

function rerollRate(habits: ShopHabits | undefined): number | null {
  return habits && habits.shops >= MIN_SHOPS ? habits.rerolls / habits.shops : null;
}

function yourShopping(habits: ShopHabits, rate: number): string {
  return `You reroll about ${rate.toFixed(1)} times a shop, counted over your last ${habits.shops} shops`;
}

/** $2 off every reroll, at the rate this player actually rerolls. */
function rerollDiscount(run: RunState, _price: number, context?: VoucherContext): VoucherValue | null {
  const rate = rerollRate(context?.habits);
  if (rate === null) return null;
  const rounds = horizonRounds(run.ante);
  const saved = 2 * rate * rounds;
  return {
    multiplier: 1,
    incomeDollars: saved,
    evidence: 'modeled',
    reasons: [
      yourShopping(context!.habits!, rate),
      `$2 off each saves about $${Math.round(saved)} over the next ${rounds} rounds`,
    ],
  };
}

/**
 * One more card in every shop, counted as the rerolls it saves. With s cards
 * a shop, each page of it — the first and one per reroll — shows one card
 * more, so a player who rerolls r times sees as many cards as (1 + r) / s
 * more rerolls would have shown. Those rerolls come after the player's own,
 * so each costs the escalated price.
 */
function extraCard(run: RunState, _price: number, context?: VoucherContext): VoucherValue | null {
  const rate = rerollRate(context?.habits);
  if (rate === null) return null;
  const slots = shopCardSlots(run.vouchers);
  const saved = (1 + rate) / slots;
  const first = baseRerollCost(run.vouchers) + rate;
  const perShop = saved * (first + Math.max(0, saved - 1) / 2);
  const rounds = horizonRounds(run.ante);
  return {
    multiplier: 1,
    incomeDollars: perShop * rounds,
    evidence: 'partial',
    reasons: [
      yourShopping(context!.habits!, rate),
      `A card more in every shop shows as much as ${saved.toFixed(1)} more rerolls would,`
      + ` about $${perShop.toFixed(0)} a shop: $${Math.round(perShop * rounds)} over the next ${rounds} rounds`,
      'Counted as the rerolls it saves, which assumes you would have wanted to see those cards',
    ],
  };
}

type Model = (run: RunState, price: number, context?: VoucherContext) => VoucherValue | null;

const MODELS: Record<string, Model> = {
  'clearance-sale': discount('clearance-sale'),
  liquidation: discount('liquidation'),
  antimatter,
  'reroll-surplus': rerollDiscount,
  'reroll-glut': rerollDiscount,
  overstock: extraCard,
  'overstock-plus': extraCard,
  grabber: resources('grabber', 'One more hand a round'),
  'nacho-tong': resources('nacho-tong', 'One more hand a round'),
  wasteful: resources('wasteful', 'One more discard a round', true),
  recyclomancy: resources('recyclomancy', 'One more discard a round', true),
  'paint-brush': resources('paint-brush', 'One more card in hand', true),
  palette: resources('palette', 'One more card in hand', true),
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
export function voucherValue(
  run: RunState, voucherId: string, price: number, context?: VoucherContext,
): VoucherValue | null {
  const model = MODELS[voucherId];
  if (!model) return null;
  const requires = getVoucher(voucherId)?.requires;
  const owned = requires && !run.vouchers.includes(requires)
    ? { ...run, vouchers: [...run.vouchers, requires] }
    : run;
  return model(owned, price, context);
}
