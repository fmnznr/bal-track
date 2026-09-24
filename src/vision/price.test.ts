import { describe, expect, it } from 'vitest';
import { readPrice } from './price';
import type { DigitTemplates } from './price';
import digitsFile from './digits.json';
import { blank, drawCard, drawPriceTag } from './testing';

const digits = digitsFile as DigitTemplates;

/** A card with a price tag above it, the way a shop screenshot has one. The
    tag sits on the card's top edge, so a bigger scale grows it upwards rather
    than down over the card, the way the game draws it. */
const TAG_LEFT = 40;
const tagTop = (cardTop: number, scale: number) => cardTop - 8 - digits.height * scale;

function shopCard(text: string | null, scale = 2) {
  const screen = blank(700, 600, [30, 90, 60]);
  const box = { x0: 200, y0: 200, x1: 382, y1: 444 };
  drawCard(screen, box.x0, box.y0, 182, 244, [200, 60, 60]);
  if (text) drawPriceTag(screen, box.x0 + TAG_LEFT, tagTop(box.y0, scale), scale, text, digits);
  return { screen, box };
}

describe('readPrice', () => {
  it('reads a price of one and of two digits', () => {
    for (const price of [3, 4, 7, 10, 25]) {
      const { screen, box } = shopCard(`$${price}`);
      expect(readPrice(screen, box, digits)).toBe(price);
    }
  });

  it('reads the same price at another screen size', () => {
    // Balatro scales its interface with the screen; the tag is not a fixed
    // number of pixels on any device.
    for (const scale of [1, 2, 3]) {
      const { screen, box } = shopCard('$8', scale);
      expect(readPrice(screen, box, digits)).toBe(8);
    }
  });

  it('reports nothing for a card without a tag', () => {
    // The jokers already in play carry no price, and inventing one for them
    // would be worse than leaving the catalog cost in place.
    const { screen, box } = shopCard(null);
    expect(readPrice(screen, box, digits)).toBeNull();
  });

  it('refuses a tag it cannot read rather than guessing a number', () => {
    const scale = 2;
    const { screen, box } = shopCard('$7', scale);
    // Scribble over the digit, leaving the tag and its dollar sign in place.
    const digit = box.x0 + TAG_LEFT + digits.width * scale + 2;
    for (let y = tagTop(box.y0, scale); y < box.y0 - 8; y++) {
      for (let x = digit + 2; x < digit + digits.width * scale - 2; x++) {
        const i = (y * screen.width + x) * 4;
        screen.data[i] = 250; screen.data[i + 1] = 200; screen.data[i + 2] = 40;
      }
    }
    expect(readPrice(screen, box, digits)).toBeNull();
  });

  it('carries a template for every digit and the dollar sign', () => {
    expect(Object.keys(digits.glyphs).sort().join('')).toBe('$0123456789');
  });
});
