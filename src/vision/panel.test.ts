import { describe, expect, it } from 'vitest';
import digitsFile from './digits.json';
import type { DigitTemplates } from './price';
import { readMoney, readRerollCost } from './panel';
import { blank, drawCard, drawPriceTag, fillRect } from './testing';

const digits = digitsFile as DigitTemplates;

/** A screen with Balatro's furniture: a status column on the left holding the
    money, a green reroll button, and a card with its own price tag. */
function screen({ money, reroll, card }: { money?: string; reroll?: string; card?: boolean }) {
  const image = blank(1400, 800, [30, 90, 60]);
  fillRect(image, 0, 0, 340, 800, [40, 46, 52]);
  if (money) drawPriceTag(image, 60, 560, 4, money, digits);
  if (reroll) {
    fillRect(image, 420, 300, 300, 130, [51, 186, 131]);
    drawPriceTag(image, 470, 340, 3, reroll, digits, [252, 252, 250]);
  }
  const box = { x0: 800, y0: 300, x1: 982, y1: 544 };
  if (card) {
    drawCard(image, box.x0, box.y0, 182, 244, [200, 60, 60]);
    drawPriceTag(image, box.x0 + 40, box.y0 - 40, 2, '$7', digits);
  }
  return { image, box };
}

describe('readMoney', () => {
  it('reads the amount in the status column', () => {
    for (const amount of [2, 8, 29, 52]) {
      const { image } = screen({ money: `$${amount}` });
      expect(readMoney(image, digits, [])).toBe(amount);
    }
  });

  it('does not mistake a card price for the money in hand', () => {
    // A shop is full of gold amounts; only one of them is what you hold.
    const { image, box } = screen({ money: '$29', card: true });
    expect(readMoney(image, digits, [box])).toBe(29);
  });

  it('reports nothing when the column is covered', () => {
    const { image } = screen({ card: true });
    expect(readMoney(image, digits, [])).toBeNull();
  });
});

describe('readRerollCost', () => {
  it('reads the cost off the green button', () => {
    for (const cost of [5, 6, 12]) {
      const { image } = screen({ money: '$29', reroll: `$${cost}` });
      expect(readRerollCost(image, digits)).toBe(cost);
    }
  });

  it('reports nothing on a screen without a shop', () => {
    const { image } = screen({ money: '$29' });
    expect(readRerollCost(image, digits)).toBeNull();
  });
});
