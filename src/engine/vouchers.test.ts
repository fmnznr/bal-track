import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import type { RunState } from '../types';
import { recommend } from './recommend';
import { voucherValue } from './vouchers';

/** The ante-3 board from a real shop that put Director's Cut at +85%. */
function board(overrides: Partial<RunState> = {}): RunState {
  return {
    ...newRunState('Red', 'White'),
    ante: 3,
    money: 26,
    jokers: ['ice-cream', 'walkie-talkie', 'smiley-face', 'throwback', 'photograph']
      .map(jokerId => ({ jokerId, edition: 'base' as const })),
    ...overrides,
  };
}

const offer = (voucherId: string) => ({ cards: [], voucherId, packIds: [], rerollCost: 5 });

describe('vouchers valued by what they do', () => {
  it('gives Blank nothing, since it does nothing', () => {
    const value = voucherValue(board(), 'blank', 10)!;
    expect(value.multiplier).toBe(1);
    expect(value.incomeDollars).toBe(0);
  });

  it('pays Seed Money only on money above the old cap', () => {
    // $26 less the $10 price is $16: under the $25 the base cap already covers.
    expect(voucherValue(board(), 'seed-money', 10)!.incomeDollars).toBe(0);
    // $70 less $10 is $60: $10 of interest a round instead of $5.
    expect(voucherValue(board({ money: 70 }), 'seed-money', 10)!.incomeDollars).toBe(5 * 6);
  });

  it('judges Money Tree on top of Seed Money, which the game requires first', () => {
    // $46 left earns $9 under either cap, so the step from $10 to $20 adds nothing yet.
    expect(voucherValue(board({ money: 56 }), 'money-tree', 10)!.incomeDollars).toBe(0);
  });

  it('prices Director\'s Cut as a few percent and the rerolls it costs', () => {
    const value = voucherValue(board(), 'directors-cut', 10)!;
    expect(value.multiplier).toBeGreaterThan(1);
    expect(value.multiplier).toBeLessThan(1.15);
    expect(value.incomeDollars).toBeLessThan(0);
  });

  it('adds less with Retcon than Director\'s Cut already gave', () => {
    const cut = voucherValue(board(), 'directors-cut', 10)!;
    const retcon = voucherValue(board({ vouchers: ['directors-cut'] }), 'retcon', 10)!;
    expect(retcon.multiplier).toBeLessThanOrEqual(cut.multiplier);
  });

  it('finds nothing to reroll with Chicot on the board', () => {
    const chicot = board({ jokers: [{ jokerId: 'chicot', edition: 'base' }] });
    expect(voucherValue(chicot, 'directors-cut', 10)!.multiplier).toBe(1);
  });

  it('credits Grabber with the rounds a board cannot yet clear', () => {
    // Nothing on the board at ante 4: every blind is out of reach, so a fifth
    // hand is a quarter more of the way there.
    const empty = { ...newRunState('Red', 'White'), ante: 4, money: 26 };
    expect(voucherValue(empty, 'grabber', 10)!.multiplier).toBeCloseTo(5 / 4, 2);
  });

  it('pays Grabber only in spare-hand money once the board clears everything', () => {
    const strong = board({
      ante: 1, primaryHand: 'Flush',
      jokers: ['cavendish', 'joker', 'greedy-joker', 'lusty-joker', 'baron']
        .map(jokerId => ({ jokerId, edition: 'base' as const })),
    });
    const value = voucherValue(strong, 'grabber', 10)!;
    expect(value.multiplier).toBe(1);
    // A dollar for the unused hand, each of the six rounds.
    expect(value.incomeDollars).toBeCloseTo(6, 0);
  });

  it('prices a discount as what a steady bankroll saves', () => {
    const clearance = voucherValue(board(), 'clearance-sale', 10)!;
    expect(clearance.multiplier).toBe(1);
    expect(clearance.incomeDollars).toBeGreaterThan(0);
    // On top of Clearance Sale, Liquidation takes a half of list price where a
    // quarter was already off: a third of what is spent now, not a half.
    const owned = board({ vouchers: ['clearance-sale'] });
    const liquidation = voucherValue(owned, 'liquidation', 7)!;
    const spendOnce = clearance.incomeDollars / 0.25;
    expect(liquidation.incomeDollars / spendOnce).toBeCloseTo(1 / 3, 1);
  });

  it('values Antimatter as the joker it saves you from selling', () => {
    const recs = recommend(board({ vouchers: ['blank'] }), offer('antimatter'));
    const antimatter = recs.find(r => r.kind === 'buy-voucher')!;
    expect(antimatter.reasons.join(' ')).toMatch(/Keeps Walkie Talkie/);
    expect(antimatter.impact).toBeGreaterThan(1);
  });

  it('gives Antimatter nothing while slots are free', () => {
    const roomy = board({ vouchers: ['blank'], jokers: [{ jokerId: 'joker', edition: 'base' }] });
    const recs = recommend(roomy, offer('antimatter'));
    expect(recs.find(r => r.kind === 'buy-voucher')!.impact).toBe(1);
  });

  it('leaves the vouchers the engine cannot yet judge to their rating', () => {
    // Hieroglyph and Petroglyph buy an extra ante of time; Wasteful and the
    // hand-size vouchers help find a hand. Neither is something the engine models.
    // Rerolls and extra shop cards depend on how often you reroll, which the run
    // does not record; Crystal Ball on consumables held, likewise.
    for (const id of [
      'hieroglyph', 'petroglyph', 'wasteful', 'recyclomancy', 'paint-brush', 'palette',
      'reroll-surplus', 'reroll-glut', 'overstock', 'overstock-plus', 'crystal-ball',
    ]) {
      expect(voucherValue(board(), id, 10), id).toBeNull();
    }
  });

  it('no longer ranks Director\'s Cut above buying nothing in that shop', () => {
    const recs = recommend(board(), offer('directors-cut'));
    const cut = recs.find(r => r.kind === 'buy-voucher')!;
    const skip = recs.find(r => r.kind === 'skip')!;
    expect(cut.evidence).toBe('partial');
    expect(cut.score).toBeLessThan(skip.score);
  });
});
