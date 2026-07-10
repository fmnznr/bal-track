import type { Edition } from '../types';

/** Interest cap in dollars earned per round (base game: $5 at $25 banked). */
export function interestCapFor(voucherIds: string[]): number {
  if (voucherIds.includes('money-tree')) return 20;
  if (voucherIds.includes('seed-money')) return 10;
  return 5;
}

export function interest(money: number, cap = 5): number {
  return Math.max(0, Math.min(cap, Math.floor(money / 5)));
}

export function interestLost(money: number, cost: number, cap = 5): number {
  return interest(money, cap) - interest(money - cost, cap);
}

export const EDITION_COST_BONUS: Record<Edition, number> = {
  base: 0,
  foil: 2,
  holographic: 3,
  polychrome: 5,
  negative: 5,
};

export function sellValue(cost: number, edition: Edition): number {
  return Math.max(1, Math.floor((cost + EDITION_COST_BONUS[edition]) / 2));
}
