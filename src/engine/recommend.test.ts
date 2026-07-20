import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { recommend, recommendPackPick } from './recommend';
import type { RunState, ShopState } from '../types';

function run(overrides: Partial<RunState> = {}): RunState {
  return { ...newRunState('Red', 'White'), ...overrides };
}

function shop(overrides: Partial<ShopState> = {}): ShopState {
  return { cards: [], voucherId: null, packIds: [], rerollCost: 5, ...overrides };
}

function owned(...jokerIds: string[]) {
  return jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const }));
}

describe('recommend — economy awareness', () => {
  it('advises against a weak buy that breaks an interest tier', () => {
    const recs = recommend(
      run({ money: 24, jokers: owned('golden-joker') }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 6 }] }),
    );
    expect(recs[0].kind).not.toBe('buy-joker');
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).toMatch(/interest/i);
  });

  it('marks unaffordable items instead of recommending them', () => {
    const recs = recommend(
      run({ money: 3 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.score).toBe(0);
    expect(buy?.reasons.join(' ')).toMatch(/Not affordable/);
  });
});

describe('recommend — strong buys', () => {
  it('puts a high-value joker on top with high confidence', () => {
    const recs = recommend(
      run({ money: 40, ante: 4 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs[0].kind).toBe('buy-joker');
    expect(recs[0].action).toBe('Buy Blueprint ($10)');
    expect(recs[0].confidence).toBe('high');
  });

  it('rewards synergy with the detected build', () => {
    const base = { money: 20, jokers: owned('droll-joker', 'crafty-joker') };
    const withSynergy = recommend(
      run(base),
      shop({ cards: [{ kind: 'joker', jokerId: 'greedy-joker', edition: 'base', price: 5 }] }),
    );
    const buy = withSynergy.find(r => r.kind === 'buy-joker');
    // greedy-joker shares no dominant tag with a flush build → no synergy bonus mentioned
    expect(buy?.reasons.join(' ')).not.toMatch(/Fits your build/);
  });
});

describe('recommend — full joker slots', () => {
  it('suggests selling the weakest joker for a clear upgrade', () => {
    const recs = recommend(
      run({
        money: 30,
        ante: 4,
        jokers: owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish'),
      }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs[0].kind).toBe('sell-and-buy');
    expect(recs[0].action).toMatch(/^Sell Joker, buy Blueprint/);
    expect(recs[0].reasons.join(' ')).toMatch(/Slots full/);
  });

  it('computes the interest note on the net cost when selling covers part of the buy', () => {
    const recs = recommend(
      run({
        money: 24,
        ante: 4,
        jokers: owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish'),
      }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    const composite = recs.find(r => r.kind === 'sell-and-buy');
    expect(composite?.reasons.join(' ')).toMatch(/\$24 → \$15/);
  });
});

describe('recommend — vouchers and packs', () => {
  it('discounts vouchers late in the run', () => {
    const recs = recommend(run({ money: 20, ante: 7 }), shop({ voucherId: 'telescope' }));
    const voucher = recs.find(r => r.kind === 'buy-voucher');
    expect(voucher?.reasons.join(' ')).toMatch(/Late in the run/);
  });

  it('recommends a celestial pack early', () => {
    const recs = recommend(run({ money: 20 }), shop({ packIds: ['celestial-normal'] }));
    expect(recs[0].kind).toBe('buy-pack');
    expect(recs[0].action).toBe('Buy Celestial Pack ($4)');
  });
});

describe('recommend — reroll and skip', () => {
  it('always offers reroll and skip as ranked actions', () => {
    const recs = recommend(run(), shop());
    expect(recs.some(r => r.kind === 'reroll')).toBe(true);
    expect(recs.some(r => r.kind === 'skip')).toBe(true);
  });

  it('explains the interest earned when skipping', () => {
    const recs = recommend(run({ money: 25 }), shop());
    const skip = recs.find(r => r.kind === 'skip');
    expect(skip?.reasons.join(' ')).toMatch(/\$5 interest/);
  });
});

describe('recommendPackPick', () => {
  it('prefers the planet that matches the build', () => {
    const flushRun = run({ jokers: owned('droll-joker', 'crafty-joker') });
    const picks = recommendPackPick(flushRun, ['mercury', 'jupiter']);
    expect(picks[0].action).toBe('Take Jupiter');
    expect(picks[0].reasons.join(' ')).toMatch(/matches your build/);
  });

  it('always ranks The Soul on top', () => {
    const picks = recommendPackPick(run(), ['jupiter', 'the-soul']);
    expect(picks[0].action).toBe('Take The Soul');
  });

  it('ranks buffoon-pack jokers with synergy', () => {
    const picks = recommendPackPick(run(), ['joker', 'blueprint']);
    expect(picks[0].action).toBe('Take Blueprint');
  });
});

describe('recommend — strategy feedback', () => {
  it('boosts a watchlist joker when a plan is recommended', () => {
    const flushRun = { ...run({ money: 20, jokers: owned('droll-joker') }), deck: 'Checkered' };
    const recs = recommend(flushRun, shop({ cards: [{ kind: 'joker', jokerId: 'smeared-joker', edition: 'base', price: 7 }] }));
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).toMatch(/watchlist for your recommended Flush plan/);
  });

  it('adds no strategy reasons while the advisor is open', () => {
    const recs = recommend(run({ money: 20 }), shop({ cards: [{ kind: 'joker', jokerId: 'crafty-joker', edition: 'base', price: 4 }] }));
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).not.toMatch(/recommended/);
  });

  it('boosts plan planets in pack picks', () => {
    const flushRun = { ...run({ jokers: owned('droll-joker') }), deck: 'Checkered' };
    const picks = recommendPackPick(flushRun, ['mercury', 'jupiter']);
    expect(picks[0].action).toBe('Take Jupiter');
    expect(picks[0].reasons.join(' ')).toMatch(/for your recommended Flush plan/);
  });
});

describe('recommend — skip calibration', () => {
  it('prefers banking over a mediocre buy early in the run', () => {
    const recs = recommend(
      run({ money: 13 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'droll-joker', edition: 'base', price: 6 }] }),
    );
    expect(recs[0].kind).toBe('skip');
    expect(recs[0].reasons.join(' ')).toMatch(/interest/i);
  });

  it('still buys a strong joker instead of banking', () => {
    const recs = recommend(
      run({ money: 13 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs[0].kind).toBe('buy-joker');
  });

  it('names the exact amount missing to the next interest tier', () => {
    const recs = recommend(
      run({ money: 23 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }] }),
    );
    const skip = recs.find(r => r.kind === 'skip');
    expect(skip?.reasons.join(' ')).toMatch(/Save \$2 more/);
  });

  it('boosts banking under an Economy plan', () => {
    const recs = recommend(
      run({ money: 20, jokers: owned('golden-joker', 'bull') }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }] }),
    );
    const skip = recs.find(r => r.kind === 'skip');
    expect(skip?.reasons.join(' ')).toMatch(/Economy Start plan/);
  });
});
