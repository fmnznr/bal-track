import { describe, expect, it } from 'vitest';
import { COMMIT_THRESHOLD, LEAN_THRESHOLD } from './strategy';
import { TUNING } from './tuning';

function leaves(value: unknown, path = 'TUNING'): [string, unknown][] {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
  }
  return [[path, value]];
}

describe('TUNING', () => {
  it('holds only finite numbers', () => {
    for (const [path, value] of leaves(TUNING)) {
      expect(typeof value, path).toBe('number');
      expect(Number.isFinite(value as number), path).toBe(true);
    }
  });

  it('keeps the priority cutoffs ordered', () => {
    expect(TUNING.priority.high).toBeGreaterThan(TUNING.priority.medium);
  });

  it('keeps commitment ordered above leaning', () => {
    expect(COMMIT_THRESHOLD).toBe(TUNING.strategy.commitThreshold);
    expect(LEAN_THRESHOLD).toBe(TUNING.strategy.leanThreshold);
    expect(COMMIT_THRESHOLD).toBeGreaterThan(LEAN_THRESHOLD);
  });

  it('puts the buy-nothing baseline below the medium cutoff', () => {
    // Buying nothing scores exactly 1, so the cutoffs must sit above it or every
    // action would outrank banking by construction.
    expect(TUNING.priority.medium).toBeGreaterThan(1);
  });

  it('needs a bigger share of the deck before a two-suit joker counts as supported', () => {
    expect(TUNING.deck.suit.abundantAboveMulti).toBeGreaterThan(TUNING.deck.suit.abundantAboveSingle);
  });

  it('states every drag as a multiplier below 1 and every boost above it', () => {
    const drags: [string, number][] = [
      ['stickers.eternal', TUNING.stickers.eternal],
      ['stickers.perishable', TUNING.stickers.perishable],
      ['slots.blockedPenalty', TUNING.slots.blockedPenalty],
      ['deck.suit.none', TUNING.deck.suit.none],
      ['deck.suit.scarce', TUNING.deck.suit.scarce],
      ['deck.face.none', TUNING.deck.face.none],
      ['deck.face.scarce', TUNING.deck.face.scarce],
      ['deck.enhanced.noneYet', TUNING.deck.enhanced.noneYet],
      ['deck.enhanced.driversLicenseDead', TUNING.deck.enhanced.driversLicenseDead],
      ['play.varietyJoker', TUNING.play.varietyJoker],
    ];
    for (const [path, value] of drags) {
      expect(value, path).toBeGreaterThan(0);
      expect(value, path).toBeLessThan(1);
    }

    const boosts: [string, number][] = [
      ['prior.ratingTopMultiplier', TUNING.prior.ratingTopMultiplier],
      ['synergy.perMatchingTag', TUNING.synergy.perMatchingTag],
      ['plan.keyJoker', TUNING.plan.keyJoker],
      ['plan.coreTag', TUNING.plan.coreTag],
      ['planet.matchesBuild', TUNING.planet.matchesBuild],
      ['deck.suit.abundant', TUNING.deck.suit.abundant],
      ['deck.face.abundant', TUNING.deck.face.abundant],
      ['deck.enhanced.driversLicenseLive', TUNING.deck.enhanced.driversLicenseLive],
      ['play.consistentHand', TUNING.play.consistentHand],
      ['reroll.expectedNetGain', TUNING.reroll.expectedNetGain],
      ['slots.sellAndBuyMargin', TUNING.slots.sellAndBuyMargin],
    ];
    for (const [path, value] of boosts) expect(value, path).toBeGreaterThan(1);
  });

  it('never lets a joker on a dead suit read as an upgrade', () => {
    // A multiplier this low replaces the old hard cap: it scales the card down
    // instead of clamping an unnamed rating.
    expect(TUNING.deck.suit.none * TUNING.prior.ratingTopMultiplier).toBeLessThan(1);
  });
});
