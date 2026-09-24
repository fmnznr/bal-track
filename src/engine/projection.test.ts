import { describe, expect, it } from 'vitest';
import { getJoker } from '../catalog/catalog';
import { newRunState } from '../run/runStore';
import {
  horizonRounds, interestCost, interestOn, jokerIncome, projectMoney, roundIncome, roundsRemaining,
} from './projection';
import { recommend } from './recommend';
import type { RunState } from '../types';

function runWith(jokerIds: string[] = [], overrides: Partial<RunState> = {}): RunState {
  return {
    ...newRunState('Red', 'White'),
    jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })),
    ...overrides,
  };
}

const dollars = (run: RunState) => roundIncome(run).reduce((s, x) => s + x.dollars, 0);

describe('round income', () => {
  it('pays the average blind reward, less the Small Blind from Red Stake up', () => {
    expect(roundIncome(runWith())[0]).toEqual({ label: 'Blind reward', dollars: 4 });
    expect(roundIncome(runWith([], { stake: 'Red' }))[0].dollars).toBe(3);
  });

  it('pays for spare hands once the board clears blinds early', () => {
    const strong = runWith([], { handLevels: { ...newRunState('Red', 'White').handLevels, 'High Card': 40 } });
    expect(roundIncome(strong).find(s => s.label === 'Spare hands')?.dollars).toBe(3);
  });

  it('adds what income jokers pay', () => {
    expect(dollars(runWith(['golden-joker'])) - dollars(runWith())).toBe(4);
    expect(dollars(runWith(['egg']))).toBe(dollars(runWith()) + 3);
  });
});

describe('interest', () => {
  it('pays a dollar per $5 up to the cap, doubled per To the Moon', () => {
    expect(interestOn(runWith(), 17)).toBe(3);
    expect(interestOn(runWith(), 100)).toBe(5);
    expect(interestOn(runWith([], { vouchers: ['seed-money'] }), 100)).toBe(10);
    expect(interestOn(runWith(['to-the-moon']), 100)).toBe(10);
    expect(interestOn(runWith([], { deck: 'Green' }), 100)).toBe(0);
  });

  it('compounds banked money round by round', () => {
    expect(projectMoney(runWith([], { money: 0 }), 3)).toEqual([4, 8, 13]);
  });

  it('charges a purchase the interest it forgoes over the horizon', () => {
    // Staying above the cap all the way costs nothing extra.
    expect(interestCost(runWith([], { money: 60 }), 10)).toBe(0);
    // Dropping from $10 to $4 at ante 1 slows every round that follows.
    expect(interestCost(runWith([], { money: 10 }), 6)).toBeGreaterThan(2);
  });

  it('judges over two antes, or what is left of the run', () => {
    expect(horizonRounds(1)).toBe(6);
    expect(horizonRounds(8)).toBe(3);
    expect(roundsRemaining(8)).toBe(3);
  });
});

describe('income jokers', () => {
  it('value their payout over the horizon, interest included', () => {
    const golden = getJoker('golden-joker')!;
    expect(jokerIncome(runWith([], { money: 0 }), golden)).toBeGreaterThanOrEqual(24);
    // Measured by removal once owned, so it is the same number either way.
    const owned = runWith(['golden-joker'], { money: 0 });
    expect(jokerIncome(owned, golden, 0)).toBeCloseTo(jokerIncome(runWith([], { money: 0 }), golden));
  });

  it('puts a joker that only earns money on the cost side of the ranking', () => {
    const recs = recommend(
      runWith([], { money: 30 }),
      { cards: [{ kind: 'joker', jokerId: 'golden-joker', edition: 'base', price: 6 }], voucherId: null, packIds: [], rerollCost: 5 },
    );
    const golden = recs.find(r => r.refId === 'golden-joker')!;
    expect(golden.impact).toBe(1);
    expect(golden.costDollars).toBeLessThan(0);
    expect(golden.evidence).toBe('modeled');
    expect(golden.score).toBeGreaterThan(1);
    expect(golden.reasons.join(' ')).toMatch(/Earns about \$\d+ over the next 6 rounds/);
  });

  it('shows the banked outlook next to buying nothing', () => {
    const recs = recommend(runWith([], { money: 10 }), {
      cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }], voucherId: null, packIds: [], rerollCost: 5,
    });
    expect(recs.find(r => r.kind === 'skip')?.reasons.join(' ')).toMatch(/about \$16 next shop and \$\d+ in 6 rounds/);
  });
});
