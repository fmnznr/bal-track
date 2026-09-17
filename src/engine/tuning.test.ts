import { describe, expect, it } from 'vitest';
import { COMMIT_THRESHOLD, LEAN_THRESHOLD } from './strategy';
import { EDITION_SCORE_BONUS } from './recommend';
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

  it('is the single source of the edition desirability table', () => {
    expect(EDITION_SCORE_BONUS).toBe(TUNING.edition);
  });

  it('needs a bigger share of the deck before a two-suit joker counts as supported', () => {
    expect(TUNING.deck.suit.abundantAboveMulti).toBeGreaterThan(TUNING.deck.suit.abundantAboveSingle);
  });

  it('states every penalty as a negative number so call sites can add them', () => {
    const penalties: [string, number][] = [
      ['stickers.eternal', TUNING.stickers.eternal],
      ['stickers.perishable', TUNING.stickers.perishable],
      ['stickers.rental', TUNING.stickers.rental],
      ['stickers.owned.perishable', TUNING.stickers.owned.perishable],
      ['slotsFull.consumable', TUNING.slotsFull.consumable],
      ['voucher.latePenalty', TUNING.voucher.latePenalty],
      ['skip.strongBuyPenalty', TUNING.skip.strongBuyPenalty],
      ['deck.suit.scarcePenalty', TUNING.deck.suit.scarcePenalty],
      ['deck.face.scarcePenalty', TUNING.deck.face.scarcePenalty],
      ['deck.enhanced.noneYetPenalty', TUNING.deck.enhanced.noneYetPenalty],
      ['deck.enhanced.driversLicenseDead', TUNING.deck.enhanced.driversLicenseDead],
      ['play.varietyJokerPenalty', TUNING.play.varietyJokerPenalty],
    ];
    for (const [path, value] of penalties) expect(value, path).toBeLessThan(0);
  });
});
