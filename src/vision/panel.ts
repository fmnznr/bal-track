/**
 * Reading the two numbers that are not printed on a card: the money you hold
 * and what a reroll costs.
 *
 * Both are the same pixel font as a price tag, so the glyph templates carry
 * over unchanged. What differs is where to look and what colour to look for.
 * Money is gold like a price, and is told apart from a price by being the
 * largest gold amount that is not sitting above a card. The reroll cost is
 * white on the green button, which is the one strongly green thing on screen
 * apart from the club pips.
 */
import { findBlobs } from './detect';
import type { Blob } from './detect';
import type { Box, ImageLike } from './fingerprint';
import { classify, columnRuns, GOLD, inkMask, normalise, WHITE } from './price';
import type { DigitTemplates, Ink } from './price';

export interface Hud {
  money: number | null;
  rerollCost: number | null;
}

interface Word {
  text: string;
  box: Box;
  glyphHeight: number;
}

/**
 * Every run of glyphs of one ink, grouped into words.
 *
 * Built from connected blobs rather than from rows of the whole image: the
 * status column holds a gold sign, a gold plate and gold counters at different
 * heights, and anything that segments by full-width rows merges them into one
 * unreadable line. A glyph in this font is one connected stroke, so a blob is
 * a glyph, and glyphs that sit at the same height within a glyph's width of
 * each other are a word.
 */
function words(image: ImageLike, region: Box, ink: Ink, templates: DigitTemplates): Word[] {
  const glyphs = findBlobs(image, ink, 60)
    .filter(b => b.x0 >= region.x0 && b.x1 <= region.x1 && b.y0 >= region.y0 && b.y1 <= region.y1)
    .filter(b => b.y1 - b.y0 >= 10 && b.x1 - b.x0 >= 4);

  // Lines first, columns second. Sorting the whole column by x alone
  // interleaves the plate with the sign above it, and a stray glyph between
  // two digits breaks the number apart.
  const lines: Blob[][] = [];
  for (const glyph of [...glyphs].sort((a, b) => a.y0 - b.y0)) {
    const height = glyph.y1 - glyph.y0;
    const line = lines.find(l => {
      const last = l[l.length - 1];
      const overlap = Math.min(last.y1, glyph.y1) - Math.max(last.y0, glyph.y0);
      const ratio = height / (last.y1 - last.y0);
      // Same height as well as same row: a button label beside the money plate
      // shares its rows, and merging the two makes an unreadable number.
      return overlap > 0.6 * Math.min(last.y1 - last.y0, height) && ratio > 0.65 && ratio < 1.55;
    });
    if (line) line.push(glyph);
    else lines.push([glyph]);
  }

  const out: Word[] = [];
  for (const line of lines) {
    let group: Blob[] = [];
    const flush = () => {
      if (group.length === 0) return;
      const box = {
        x0: group[0].x0, y0: Math.min(...group.map(g => g.y0)),
        x1: group[group.length - 1].x1, y1: Math.max(...group.map(g => g.y1)),
      };
      const mask = inkMask(image, box, ink);
      const text = columnRuns(mask)
        .map(([from, to]) => classify(normalise(mask, from, to, templates.width, templates.height), templates) ?? '?')
        .join('');
      out.push({ text, box, glyphHeight: box.y1 - box.y0 });
      group = [];
    };
    for (const glyph of line.sort((a, b) => a.x0 - b.x0)) {
      const previous = group[group.length - 1];
      if (previous) {
        const gap = glyph.x0 - previous.x1;
        const ratio = (glyph.y1 - glyph.y0) / (previous.y1 - previous.y0);
        if (gap > 0.8 * (previous.x1 - previous.x0) || ratio < 0.65 || ratio > 1.55) flush();
      }
      group.push(glyph);
    }
    flush();
  }
  return out;
}

const AMOUNT = /^\$([0-9]+)$/;
/** On the reroll button the dollar sign is thinner than the digits and its
    strokes break up at this size, so the cost is taken from the digits alone —
    the only number on a button whose other word is "Reroll". */
const COST = /^\$?([0-9]+)$/;

/** Where a price tag sits, so the money reader can ignore those amounts. */
function tagBand(card: Box): Box {
  const height = card.y1 - card.y0;
  return { x0: card.x0 - 40, y0: card.y0 - Math.round(height * 0.4), x1: card.x1 + 40, y1: card.y0 + 4 };
}

const inside = (inner: Box, outer: Box) =>
  inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.y0 >= outer.y0 && inner.y1 <= outer.y1;

/**
 * The money in hand. Balatro's status column is on the left of the screen at
 * every size, and the amount there is printed larger than a price tag, so the
 * two rules together settle which gold number is which.
 */
export function readMoney(image: ImageLike, templates: DigitTemplates, cards: readonly Box[]): number | null {
  const column = { x0: 0, y0: 0, x1: Math.round(image.width * 0.45), y1: image.height };
  const candidates = words(image, column, GOLD, templates)
    .filter(word => AMOUNT.test(word.text))
    .filter(word => !cards.some(card => inside(word.box, tagBand(card))));
  if (candidates.length === 0) return null;
  const biggest = candidates.reduce((a, b) => (b.glyphHeight > a.glyphHeight ? b : a));
  return Number(AMOUNT.exec(biggest.text)![1]);
}

/** The reroll cost, from the green button it is printed on. */
export function readRerollCost(image: ImageLike, templates: DigitTemplates): number | null {
  const green = findBlobs(image, (r, g, b) => g > 150 && g - r > 80 && g - b > 30, 400)
    .filter(b => {
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      return w > image.width * 0.05 && w / h > 1.2 && w / h < 4;
    });
  if (green.length === 0) return null;
  const button = green.reduce((a, b) =>
    ((b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a));
  const amounts = words(image, button, WHITE, templates)
    .map(word => COST.exec(word.text))
    .filter((match): match is RegExpExecArray => match !== null);
  return amounts.length === 1 ? Number(amounts[0][1]) : null;
}

/** Exposed for the diagnostics script: what the reader saw before deciding. */
export function readWords(image: ImageLike, region: Box, ink: Ink, templates: DigitTemplates): Word[] {
  return words(image, region, ink, templates);
}

export function readHud(image: ImageLike, templates: DigitTemplates, cards: readonly Box[]): Hud {
  return {
    money: readMoney(image, templates, cards),
    rerollCost: readRerollCost(image, templates),
  };
}
