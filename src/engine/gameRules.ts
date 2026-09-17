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
