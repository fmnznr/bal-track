import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import type { RunState } from '../types';
import { voucherPriorContribution } from './impact';
import { recommend } from './recommend';
import { scoreTarget } from './score';
import { TUNING } from './tuning';
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

  it('counts a free-slot Antimatter from when this run\'s pace fills the board', () => {
    const three = board().jokers.slice(0, 3);
    // Three jokers by ante 3: a joker and a half an ante, so two free slots
    // fill in about an ante and a third, and the extra slot pays after that.
    const early = recommend(board({ vouchers: ['blank'], jokers: three }), offer('antimatter'))
      .find(r => r.kind === 'buy-voucher')!;
    expect(early.impact).toBeGreaterThan(1);
    expect(early.reasons.join(' ')).toMatch(/fill in about 1\.3 antes/);
    // The same board at ante 6 fills too slowly to use the slot before the end.
    const late = recommend(board({ ante: 6, vouchers: ['blank'], jokers: three }), offer('antimatter'))
      .find(r => r.kind === 'buy-voucher')!;
    expect(late.impact).toBe(1);
  });

  describe('at the rate you reroll', () => {
    const habits = (rerolls: number, shops = 10) => ({ weakest: () => null, habits: { shops, rerolls } });

    it('saves $2 a reroll with Reroll Surplus', () => {
      // One reroll a shop, six shops ahead.
      expect(voucherValue(board(), 'reroll-surplus', 10, habits(10))!.incomeDollars).toBe(2 * 1 * 6);
      expect(voucherValue(board(), 'reroll-surplus', 10, habits(0))!.incomeDollars).toBe(0);
    });

    it('counts Overstock as the rerolls it saves', () => {
      // Never rerolling: a third card is half a reroll a shop, at $5.
      expect(voucherValue(board(), 'overstock', 10, habits(0))!.incomeDollars).toBeCloseTo(0.5 * 5 * 6);
      // Rerolling once: each page shows a card more, a whole reroll's worth,
      // at the $6 a second reroll costs.
      expect(voucherValue(board(), 'overstock', 10, habits(10))!.incomeDollars).toBeCloseTo(1 * 6 * 6);
    });

    it('gives Overstock Plus less than Overstock, since each page already shows three', () => {
      const plus = voucherValue(board({ vouchers: ['overstock'] }), 'overstock-plus', 10, habits(10))!;
      const first = voucherValue(board(), 'overstock', 10, habits(10))!;
      expect(plus.incomeDollars).toBeLessThan(first.incomeDollars);
    });

    it('trusts no rate until enough shops are counted, and leaves the rating to stand', () => {
      expect(voucherValue(board(), 'reroll-surplus', 10, habits(4, 4))).toBeNull();
      expect(voucherValue(board(), 'overstock', 10)).toBeNull();
    });
  });

  it('values a discard by how much more often your hand comes together', () => {
    const flush = voucherValue(board({ primaryHand: 'Flush' }), 'wasteful', 10)!;
    expect(flush.multiplier).toBeGreaterThan(1);
    expect(flush.evidence).toBe('partial');
    expect(flush.reasons.join(' ')).toMatch(/Your Flush comes together about \d+% of the time, \d+% with it/);
    // High Card always comes together, so there is nothing to find.
    expect(voucherValue(board({ primaryHand: 'High Card' }), 'wasteful', 10)!.multiplier).toBe(1);
  });

  it('values a bigger hand the same way', () => {
    expect(voucherValue(board({ primaryHand: 'Straight' }), 'paint-brush', 10)!.multiplier).toBeGreaterThan(1);
  });

  it('prices an ante back as three more rounds of pay, against the hand it costs', () => {
    const hieroglyph = voucherValue(board({ primaryHand: 'Flush' }), 'hieroglyph', 10)!;
    // The lost hand makes this ante's blinds harder...
    expect(hieroglyph.multiplier).toBeLessThan(1);
    // ...and the extra ante pays three rounds.
    expect(hieroglyph.incomeDollars).toBeGreaterThan(0);
    expect(hieroglyph.reasons.join(' ')).toMatch(/3 more rounds before the last blind/);
  });

  it('leaves the vouchers the engine cannot yet judge to their rating', () => {
    // Crystal Ball depends on consumables the run cannot foresee.
    for (const id of ['crystal-ball']) {
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

describe('the curve for vouchers without a model', () => {
  it('is zero at the rating of a voucher that does nothing', () => {
    expect(voucherPriorContribution(board(), TUNING.voucherPrior.zeroRating)).toBe(0);
  });

  it('rises with the rating to its fitted scale at 10', () => {
    const run = board();
    const at = (r: number) => voucherPriorContribution(run, r);
    expect(at(4)).toBeGreaterThan(0);
    expect(at(6)).toBeGreaterThan(at(4));
    expect(at(10)).toBeCloseTo(scoreTarget(run) * TUNING.voucherPrior.topShareOfTarget);
  });

  it('says a rated voucher is not modelled yet', () => {
    const recs = recommend(board(), offer('observatory'));
    const observatory = recs.find(r => r.kind === 'buy-voucher')!;
    expect(observatory.evidence).toBe('heuristic');
    expect(observatory.reasons.join(' ')).toMatch(/Not modelled yet: rated 8\/10/);
  });
});
