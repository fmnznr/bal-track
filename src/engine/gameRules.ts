import type { Edition, RunState } from '../types';

export const STAKES = ['White', 'Red', 'Green', 'Black', 'Blue', 'Purple', 'Orange', 'Gold'] as const;

export function stakeLevel(stake: string): number {
  const index = (STAKES as readonly string[]).indexOf(stake);
  return index === -1 ? 1 : index + 1;
}

export function stakeHas(stake: string, minimum: (typeof STAKES)[number]): boolean {
  return stakeLevel(stake) >= stakeLevel(minimum);
}

/** Blue Stake and above remove one discard; stake effects are cumulative. */
export function stakeDiscardPenalty(stake: string): number {
  return stakeHas(stake, 'Blue') ? 1 : 0;
}

export function earnsInterest(run: Pick<RunState, 'deck'>): boolean {
  return run.deck !== 'Green';
}

export function rentalUpkeep(stickers?: { rental?: boolean }): number {
  return stickers?.rental ? 3 : 0;
}

/**
 * Jokers occupying a slot. Negative-edition jokers sit on the board without
 * consuming one, so they never count towards the limit.
 */
export function usedJokerSlots(run: Pick<RunState, 'jokers'>): number {
  return run.jokers.filter(j => j.edition !== 'negative').length;
}

/** Whether a joker of this edition still fits on the board. */
export function hasFreeJokerSlot(run: Pick<RunState, 'jokers' | 'jokerSlots'>, edition: Edition): boolean {
  return edition === 'negative' || usedJokerSlots(run) < run.jokerSlots;
}

/** What the first reroll of a shop costs: $5, less $2 for each reroll voucher. */
export function baseRerollCost(vouchers: readonly string[]): number {
  let cost = 5;
  if (vouchers.includes('reroll-surplus')) cost -= 2;
  if (vouchers.includes('reroll-glut')) cost -= 2;
  return cost;
}

/** Cards a shop offers: two, and one more for each Overstock voucher. */
export function shopCardSlots(vouchers: readonly string[]): number {
  let slots = 2;
  if (vouchers.includes('overstock')) slots += 1;
  if (vouchers.includes('overstock-plus')) slots += 1;
  return slots;
}

/** Hands and discards a voucher adds to every round from now on. */
const RESOURCE_VOUCHERS: Record<string, { hands?: number; discards?: number }> = {
  grabber: { hands: 1 },
  'nacho-tong': { hands: 1 },
  wasteful: { discards: 1 },
  recyclomancy: { discards: 1 },
  hieroglyph: { hands: -1 },
  petroglyph: { discards: -1 },
};

/**
 * The run as it stands once a voucher is redeemed, without the payment.
 *
 * One table for both sides: the store books a redeemed voucher with it, and
 * the engine values a voucher on offer by comparing the run with and without.
 * Hand size is not booked here because it is derived from the vouchers owned.
 */
export function applyVoucher(run: RunState, voucherId: string): RunState {
  let { jokerSlots, consumableSlots, ante, boss } = run;
  if (voucherId === 'antimatter') jokerSlots += 1;
  if (voucherId === 'crystal-ball') consumableSlots += 1;
  if (voucherId === 'hieroglyph' || voucherId === 'petroglyph') {
    ante = Math.max(0, ante - 1);
    boss = null;
  }
  const resource = RESOURCE_VOUCHERS[voucherId];
  return {
    ...run,
    jokerSlots,
    consumableSlots,
    ante,
    boss,
    handsPerRound: Math.max(0, run.handsPerRound + (resource?.hands ?? 0)),
    discardsPerRound: Math.max(0, run.discardsPerRound + (resource?.discards ?? 0)),
    vouchers: [...run.vouchers, voucherId],
  };
}
