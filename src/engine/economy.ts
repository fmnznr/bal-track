import type { Edition, JokerStickers, RunState } from '../types';
import { earnsInterest } from './gameRules';

/** Balatro pays $1 of interest per $5 banked. A game rule, not a tunable weight. */
export const INTEREST_TIER_DOLLARS = 5;

/** Interest cap in dollars earned per round (base game: $5 at $25 banked). */
export function interestCapFor(voucherIds: string[]): number {
  if (voucherIds.includes('money-tree')) return 20;
  if (voucherIds.includes('seed-money')) return 10;
  return 5;
}

export function interest(money: number, cap = 5): number {
  return Math.max(0, Math.min(cap, Math.floor(money / INTEREST_TIER_DOLLARS)));
}

export function interestLost(money: number, cost: number, cap = 5): number {
  return interest(money, cap) - interest(money - cost, cap);
}

export function runInterest(run: Pick<RunState, 'deck' | 'money' | 'vouchers'>): number {
  return earnsInterest(run) ? interest(run.money, interestCapFor(run.vouchers)) : 0;
}

export function runInterestLost(
  run: Pick<RunState, 'deck' | 'money' | 'vouchers'>,
  cost: number,
): number {
  return earnsInterest(run) ? interestLost(run.money, cost, interestCapFor(run.vouchers)) : 0;
}

export const EDITION_COST_BONUS: Record<Edition, number> = {
  base: 0,
  foil: 2,
  holographic: 3,
  polychrome: 5,
  negative: 5,
};

export function sellValue(cost: number, edition: Edition, stickers?: JokerStickers): number {
  if (stickers?.rental) return 1;
  return Math.max(1, Math.floor((cost + EDITION_COST_BONUS[edition]) / 2));
}
