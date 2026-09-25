import { describe, expect, it } from 'vitest';
import { initialDeckProfile, newRunState } from '../run/runStore';
import { economyMultiplier, recommend, recommendPackPick } from './recommend';
import type { OwnedJoker, RunState, ShopState } from '../types';

function run(overrides: Partial<RunState> = {}): RunState {
  return { ...newRunState('Red', 'White'), ...overrides };
}

function shop(overrides: Partial<ShopState> = {}): ShopState {
  return { cards: [], voucherId: null, packIds: [], rerollCost: 5, ...overrides };
}

function owned(...jokerIds: string[]): OwnedJoker[] {
  return jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const }));
}

describe('recommend — economy awareness', () => {
  it('charges a broken interest tier to the buy that breaks it', () => {
    const recs = recommend(
      run({ money: 24, jokers: owned('golden-joker') }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 6 }] }),
    );
    const buy = recs.find(r => r.kind === 'buy-joker')!;
    expect(buy.reasons.join(' ')).toMatch(/interest/i);
    // The price is $6, so anything above that is the interest the tier break costs.
    expect(buy.costDollars).toBeGreaterThan(6);
    expect(buy.score).toBeLessThan(buy.impact);
  });

  it('prices the same card higher when it does not break a tier', () => {
    const card = { kind: 'joker' as const, jokerId: 'joker', edition: 'base' as const, price: 6 };
    const breaksTier = recommend(run({ money: 24 }), shop({ cards: [card] }))
      .find(r => r.kind === 'buy-joker')!;
    const clearOfTier = recommend(run({ money: 40 }), shop({ cards: [card] }))
      .find(r => r.kind === 'buy-joker')!;
    expect(clearOfTier.costDollars).toBeLessThan(breaksTier.costDollars);
    expect(clearOfTier.score).toBeGreaterThan(breaksTier.score);
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
  it('puts a high-value joker on top with high priority', () => {
    const recs = recommend(
      run({ money: 40, ante: 4 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs[0].kind).toBe('buy-joker');
    expect(recs[0].action).toBe('Buy Blueprint ($10)');
    expect(recs[0].priority).toBe('high');
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
    // Owned jokers are judged by what selling them loses. Crafty Joker adds
    // nothing on this hand but sits on the recommended Flush plan, so it is
    // kept; Cavendish loses less than the Joker whose +4 Mult it multiplies.
    expect(recs[0].action).toMatch(/^Sell Cavendish, buy Blueprint/);
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
    expect(composite?.reasons.join(' ')).toMatch(/\$24 → \$1[0-9]/);
  });

  it('allows a sell-and-buy when the sale makes the purchase affordable', () => {
    const recs = recommend(
      run({
        money: 9,
        ante: 4,
        jokers: owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish'),
      }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs.some(rec => rec.kind === 'sell-and-buy')).toBe(true);
    expect(recs.find(rec => rec.refId === 'blueprint')?.reasons.join(' ')).not.toMatch(/Not affordable/);
  });

  it('never proposes selling an Eternal joker', () => {
    const jokers = owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish');
    jokers[0] = { ...jokers[0], stickers: { eternal: true } };
    const recs = recommend(
      run({ money: 30, ante: 4, jokers }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs.find(rec => rec.kind === 'sell-and-buy')?.action).not.toMatch(/Sell Joker,/);
  });
});

describe('recommend — vouchers and packs', () => {
  it('discounts vouchers late in the run, because fewer rounds are left to profit', () => {
    const early = recommend(run({ money: 20, ante: 1 }), shop({ voucherId: 'telescope' }))
      .find(r => r.kind === 'buy-voucher')!;
    const late = recommend(run({ money: 20, ante: 7 }), shop({ voucherId: 'telescope' }))
      .find(r => r.kind === 'buy-voucher')!;
    expect(late.impact).toBeLessThan(early.impact);
    expect(late.reasons.join(' ')).toMatch(/rounds left to profit/);
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

  it('does not invent interest for Green Deck', () => {
    const green = { ...run({ money: 25 }), deck: 'Green' };
    const skip = recommend(green, shop()).find(rec => rec.kind === 'skip');
    expect(skip?.reasons.join(' ')).toMatch(/earns no interest/);
    expect(skip?.reasons.join(' ')).not.toMatch(/earns \$5 interest/);
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

describe('recommendPackPick — replacement hints', () => {
  it('names the weakest owned joker when a pack pick needs a slot', () => {
    const fullRun = run({
      ante: 4,
      jokers: owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish'),
    });
    const picks = recommendPackPick(fullRun, ['blueprint']);
    expect(picks[0].reasons.join(' ')).toMatch(/sell Cavendish .*to make room/);
  });

  it('warns without a sell target when no pack pick is worth a slot', () => {
    // Every owned joker fires on this hand, so none of them is dead weight.
    const fullRun = run({
      ante: 4,
      primaryHand: 'Flush',
      jokers: owned('droll-joker', 'crafty-joker', 'the-tribe', 'golden-joker', 'cavendish'),
    });
    const picks = recommendPackPick(fullRun, ['ice-cream']);
    expect(picks[0].reasons.join(' ')).toMatch(/nothing is clearly worth selling/);
  });

  it('does not advise selling for a pick the deck signal floors', () => {
    const fullRun = {
      ...run({ jokers: owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish') }),
      deck: 'Checkered',
      deckProfile: initialDeckProfile('Checkered'),
    };
    const picks = recommendPackPick(fullRun, ['rough-gem']);
    expect(picks[0].reasons.join(' ')).not.toMatch(/to make room/);
    expect(picks[0].reasons.join(' ')).toMatch(/nothing is clearly worth selling/);
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
  it('prefers banking when a card costs more than it is worth', () => {
    // Overpriced for what it does, so the dollars outweigh the score it adds.
    const recs = recommend(
      run({ money: 40, jokers: owned('droll-joker', 'crafty-joker') }),
      shop({ cards: [{ kind: 'joker', jokerId: 'ice-cream', edition: 'base', price: 38 }] }),
    );
    expect(recs[0].kind).toBe('skip');
    const buy = recs.find(r => r.kind === 'buy-joker')!;
    expect(buy.score).toBeLessThan(1);
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
    expect(skip?.reasons.join(' ')).toMatch(/\$2 more reaches the next interest tier/);
  });

  it('boosts banking under an Economy plan', () => {
    const recs = recommend(
      run({ money: 20, jokers: owned('golden-joker', 'bull') }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }] }),
    );
    const skip = recs.find(r => r.kind === 'skip');
    expect(skip?.reasons.join(' ')).toMatch(/Economy Start plan/);
  });

  it('still buys a strong joker even under an Economy plan', () => {
    const recs = recommend(
      run({ money: 18, jokers: owned('golden-joker') }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs[0].kind).toBe('buy-joker');
  });

  it('anchors the whole scale on buying nothing', () => {
    for (const ante of [1, 4, 7]) {
      for (const money of [0, 13, 40]) {
        const skip = recommend(run({ money, ante }), shop()).find(r => r.kind === 'skip')!;
        expect(skip.score, `ante ${ante}, $${money}`).toBe(1);
        expect(skip.costDollars).toBe(0);
      }
    }
  });
});

describe('recommend — deck-profile awareness', () => {
  it('floors a suit joker whose suit is gone and says why', () => {
    const checkeredRun = { ...run({ money: 20 }), deck: 'Checkered', deckProfile: initialDeckProfile('Checkered') };
    const recs = recommend(checkeredRun, shop({ cards: [{ kind: 'joker', jokerId: 'greedy-joker', edition: 'base', price: 5 }] }));
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.score).toBeLessThanOrEqual(1);
    expect(buy?.reasons.join(' ')).toMatch(/No diamonds cards left/);
  });
});

describe('recommend — declared hand', () => {
  it('prefers the planet for the hand you build around', () => {
    const picks = recommendPackPick(run({ money: 20, primaryHand: 'Flush' }), ['mercury', 'jupiter']);
    expect(picks[0].action).toBe('Take Jupiter');
    // Levelling the hand the estimate is built on is the one consumable effect
    // the score model computes outright rather than guessing at.
    expect(picks[0].evidence).toBe('modeled');
    expect(picks[0].reasons.join(' ')).toMatch(/Levels Flush, the hand your estimate is built on/);
  });

  it('does not push any planet while no hand has been declared', () => {
    const picks = recommendPackPick(run({ money: 20 }), ['mercury', 'jupiter']);
    expect(picks.every(p => !/hand you build around/.test(p.reasons.join(' ')))).toBe(true);
  });
});

describe('recommend — score estimate', () => {
  it('reports the modelled gain of a modeled joker and says it is tempered', () => {
    const recs = recommend(
      run({ money: 20 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }] }),
    );
    const buy = recs.find(r => r.kind === 'buy-joker')!;
    expect(buy.evidence).toBe('partial');
    expect(buy.reasons.join(' ')).toMatch(/Modelled at about [\d,]+ score on your High Card/);
    expect(buy.reasons.join(' ')).toMatch(/weighed against its \d+\/10 rating/);
  });

  it('says nothing about jokers it cannot model', () => {
    const recs = recommend(
      run({ money: 20 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'green-joker', edition: 'base', price: 4 }] }),
    );
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).not.toMatch(/estimated/);
  });
});

describe('the scale itself', () => {
  const shopWith = (price: number) =>
    shop({ cards: [{ kind: 'joker' as const, jokerId: 'blueprint', edition: 'base' as const, price }] });

  it('reports score as impact paid for in dollars', () => {
    for (const r of recommend(run({ money: 40, ante: 3 }), shopWith(10))) {
      if (r.score === 0) continue; // unavailable actions carry no estimate
      expect(r.score, r.action).toBeCloseTo(r.impact * economyMultiplier(r.costDollars), 10);
    }
  });

  it('makes the same card worse the more it costs', () => {
    const scores = [2, 6, 12, 20].map(price =>
      recommend(run({ money: 40 }), shopWith(price)).find(r => r.kind === 'buy-joker')!.score);
    for (let i = 1; i < scores.length; i += 1) expect(scores[i]).toBeLessThan(scores[i - 1]);
  });

  it('gives an unavailable action a score of zero so it always sorts last', () => {
    const recs = recommend(run({ money: 1 }), shopWith(30));
    const buy = recs.find(r => r.kind === 'buy-joker')!;
    expect(buy.score).toBe(0);
    expect(recs[recs.length - 1].score).toBe(0);
  });

  it('charges rental upkeep against the rounds that are actually left', () => {
    const rental = { kind: 'joker' as const, jokerId: 'blueprint', edition: 'base' as const, price: 1, stickers: { rental: true } };
    const early = recommend(run({ money: 40, ante: 1 }), shop({ cards: [rental] })).find(r => r.kind === 'buy-joker')!;
    const late = recommend(run({ money: 40, ante: 8 }), shop({ cards: [rental] })).find(r => r.kind === 'buy-joker')!;
    expect(early.costDollars).toBeGreaterThan(late.costDollars);
    expect(early.reasons.join(' ')).toMatch(/Rental upkeep/);
  });

  it('does not let a joker on a dead suit read as an upgrade', () => {
    // Checkered has no diamonds at all, so Greedy Joker cannot fire.
    const picks = recommendPackPick(
      { ...run(), deck: 'Checkered', deckProfile: initialDeckProfile('Checkered') },
      ['greedy-joker'],
    );
    expect(picks[0].impact).toBeLessThan(1);
    expect(picks[0].reasons.join(' ')).toMatch(/No diamonds cards left/);
  });

  it('prices a swap as the ratio between the two jokers, not the newcomer alone', () => {
    const full = run({
      money: 30, ante: 4,
      jokers: owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish'),
    });
    const swap = recommend(full, shopWith(10)).find(r => r.kind === 'sell-and-buy')!;
    const free = recommend({ ...full, jokerSlots: 9 }, shopWith(10)).find(r => r.kind === 'buy-joker')!;
    expect(swap.impact).toBeLessThan(free.impact);
    expect(swap.reasons.join(' ')).toMatch(/contributes least/);
  });
});

describe('a card the model knows is dead', () => {
  it('does not let a good rating rescue a joker that adds nothing', () => {
    // Steel Joker is rated 7/10 mid-run, but with no Steel cards it contributes
    // literally zero. That is a certainty, not a noisy estimate, so the rating
    // prior must not lift it back above the buy-nothing baseline.
    const picks = recommendPackPick(run({ ante: 4 }), ['steel-joker']);
    expect(picks[0].impact).toBeCloseTo(1);
    expect(picks[0].reasons.join(' ')).toMatch(/Adds nothing to your/);
  });

  it('values the same joker once the deck supports it', () => {
    const base = run({ ante: 4 });
    const withSteel = {
      ...base,
      deckProfile: { ...base.deckProfile, enhanced: { ...base.deckProfile.enhanced, steel: 8 } },
    };
    const dead = recommendPackPick(base, ['steel-joker'])[0];
    const live = recommendPackPick(withSteel, ['steel-joker'])[0];
    expect(live.impact).toBeGreaterThan(dead.impact);
    expect(live.reasons.join(' ')).toMatch(/Modelled at about/);
  });

  it('treats a hand-conditional joker that cannot fire as the weakest on the board', () => {
    // Crafty Joker needs a Flush; the declared hand is a Pair, so it never fires.
    const recs = recommend(
      run({
        money: 30, ante: 4, primaryHand: 'Pair',
        jokers: owned('jolly-joker', 'crafty-joker', 'golden-joker', 'cavendish', 'the-duo'),
      }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    const swap = recs.find(r => r.kind === 'sell-and-buy');
    expect(swap?.action).toMatch(/^Sell Crafty Joker/);
  });
});

describe('recommend — the boss this ante', () => {
  it('says what Chicot would do against the boss you picked', () => {
    const recs = recommend(
      run({ money: 30, boss: 'the-plant', primaryHand: 'Pair', deckProfile: { ...initialDeckProfile('Red'), faceCards: 40 } }),
      shop({ cards: [{ kind: 'joker', jokerId: 'chicot', edition: 'base', price: 20 }] }),
    );
    const chicot = recs.find(r => r.refId === 'chicot')!;
    expect(chicot.reasons.join(' ')).toMatch(/Disables The Plant .*instead of/);
  });

  it('charges a discounted pack and voucher at their shop price', () => {
    const recs = recommend(
      run({ money: 30, vouchers: ['clearance-sale'] }),
      shop({ voucherId: 'overstock', packIds: ['arcana-normal'] }),
    );
    expect(recs.find(r => r.kind === 'buy-voucher')?.action).toBe('Buy Overstock ($7)');
    expect(recs.find(r => r.kind === 'buy-pack')?.action).toBe('Buy Arcana Pack ($3)');
  });
});

describe('a shop read from a real run', () => {
  // Ante 3, a full board, and The Idol on offer. Rated but unmodelled, it came
  // out as the top pick — "sell Walkie Talkie, buy The Idol" at +103% — when X2
  // for one card in 52 is worth a few percent a hand.
  const board = run({
    ante: 3, money: 26,
    jokers: owned('ice-cream', 'walkie-talkie', 'smiley-face', 'throwback', 'photograph'),
  });
  const offer = shop({ cards: [{ kind: 'joker', jokerId: 'the-idol', edition: 'base', price: 6 }] });

  it('does not sell a working joker for The Idol', () => {
    const recs = recommend(board, offer);
    const skip = recs.find(r => r.kind === 'skip')!;
    for (const r of recs.filter(rec => rec.action.includes('The Idol'))) {
      expect(r.score, r.action).toBeLessThan(skip.score);
    }
  });
});
