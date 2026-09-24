/**
 * Reading the price tag above a card.
 *
 * Balatro prints prices in a pixel font, gold on a dark tag, at a size that
 * follows the screen. That makes this the easy end of recognition: a glyph
 * normalised to a small grid is the same grid whatever the screen size, so
 * ten templates and a nearest-match settle it. Nothing here guesses — an
 * unreadable tag returns nothing and the catalog price stands.
 *
 * Why it matters beyond convenience: a shop with Clearance Sale or Liquidation
 * prices everything below its catalog cost, and the engine's whole judgement is
 * "is this worth the dollars it costs".
 */
import type { Box, ImageLike } from './fingerprint';

export interface DigitTemplates {
  width: number;
  height: number;
  /** label -> row-major bits, one character per cell. */
  glyphs: Record<string, string>;
}

/** How far above a card its price tag sits, as a share of the card's height. */
const TAG_BAND = 0.34;
const SIDE_SLACK = 20;
/** A glyph may differ in at most this share of cells and still be that glyph. */
const MAX_GLYPH_ERROR = 0.18;

export interface Mask {
  bits: boolean[];
  width: number;
  height: number;
}

export type Ink = (r: number, g: number, b: number) => boolean;

/** The gold Balatro prints money and prices in. */
export const GOLD: Ink = (r, g, b) => r > 170 && g > 110 && g < 215 && b < 120 && r - b > 80;

/** The near-white of button labels. */
export const WHITE: Ink = (r, g, b) => r > 200 && g > 200 && b > 190;

/** The blue Balatro prints the hands counter (and its chips) in. */
export const BLUE: Ink = (r, g, b) => b > 200 && b - r > 120 && g > 90 && g < 210;

/** The red of the discards counter (and of the mult). */
export const RED: Ink = (r, g, b) => r > 190 && r - g > 120 && r - b > 120;

export function inkMask(image: ImageLike, box: Box, ink: Ink): Mask {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const bits = new Array<boolean>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = ((box.y0 + y) * image.width + box.x0 + x) * 4;
      bits[y * width + x] = ink(image.data[i], image.data[i + 1], image.data[i + 2]);
    }
  }
  return { bits, width, height };
}

function goldMask(image: ImageLike, box: Box): { bits: boolean[]; width: number; height: number } {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const bits = new Array<boolean>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = ((box.y0 + y) * image.width + box.x0 + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      bits[y * width + x] = r > 170 && g > 110 && g < 215 && b < 120 && r - b > 80;
    }
  }
  return { bits, width, height };
}

function trimRows(mask: Mask): Mask {
  let top = 0;
  let bottom = mask.height;
  const rowHas = (y: number) => {
    for (let x = 0; x < mask.width; x++) if (mask.bits[y * mask.width + x]) return true;
    return false;
  };
  while (top < bottom && !rowHas(top)) top++;
  while (bottom > top && !rowHas(bottom - 1)) bottom--;
  return {
    bits: mask.bits.slice(top * mask.width, bottom * mask.width),
    width: mask.width,
    height: bottom - top,
  };
}

/** Columns that hold ink, grouped into glyphs. */
export function columnRuns(mask: Mask, minWidth = 2): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  for (let x = 0; x <= mask.width; x++) {
    let on = false;
    for (let y = 0; y < mask.height && x < mask.width; y++) {
      if (mask.bits[y * mask.width + x]) { on = true; break; }
    }
    if (on && start === null) start = x;
    else if (!on && start !== null) {
      if (x - start >= minWidth) runs.push([start, x]);
      start = null;
    }
  }
  return runs;
}

/** A glyph on a fixed grid, so one template serves every screen size. */
export function normalise(mask: Mask, from: number, to: number, w: number, h: number): boolean[] {
  let top = 0;
  let bottom = mask.height;
  const rowHas = (y: number) => {
    for (let x = from; x < to; x++) if (mask.bits[y * mask.width + x]) return true;
    return false;
  };
  while (top < bottom && !rowHas(top)) top++;
  while (bottom > top && !rowHas(bottom - 1)) bottom--;
  const gw = to - from;
  const gh = bottom - top;
  const out = new Array<boolean>(w * h).fill(false);
  if (gw <= 0 || gh <= 0) return out;
  for (let y = 0; y < h; y++) {
    const y0 = top + Math.floor((y * gh) / h);
    const y1 = Math.max(y0 + 1, top + Math.ceil(((y + 1) * gh) / h));
    for (let x = 0; x < w; x++) {
      const x0 = from + Math.floor((x * gw) / w);
      const x1 = Math.max(x0 + 1, from + Math.ceil(((x + 1) * gw) / w));
      let on = 0;
      let seen = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++, seen++) {
          if (mask.bits[sy * mask.width + sx]) on++;
        }
      }
      out[y * w + x] = seen > 0 && on * 2 >= seen;
    }
  }
  return out;
}

export function glyphToString(cells: readonly boolean[]): string {
  return cells.map(on => (on ? '#' : '.')).join('');
}

export function classify(cells: readonly boolean[], templates: DigitTemplates): string | null {
  let best: string | null = null;
  let bestWrong = Infinity;
  for (const [label, bits] of Object.entries(templates.glyphs)) {
    let wrong = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i] !== (bits[i] === '#')) wrong++;
    if (wrong < bestWrong) { bestWrong = wrong; best = label; }
  }
  return bestWrong <= cells.length * MAX_GLYPH_ERROR ? best : null;
}

/** Gold glyphs inside a rectangle, left to right. */
export function glyphsInRect(image: ImageLike, rect: Box, w: number, h: number): boolean[][] {
  if (rect.y1 - rect.y0 < 8) return [];
  const mask = trimRows(goldMask(image, rect));
  if (mask.height < 6) return [];
  return columnRuns(mask).map(([from, to]) => normalise(mask, from, to, w, h));
}

/** Glyph masks found on the tag above a card — the building block the
    template builder and the reader share. */
export function tagGlyphs(image: ImageLike, box: Box, w: number, h: number): boolean[][] {
  const height = box.y1 - box.y0;
  const band: Box = {
    x0: Math.max(0, box.x0 - SIDE_SLACK),
    y0: Math.max(0, box.y0 - Math.round(height * TAG_BAND)),
    x1: Math.min(image.width, box.x1 + SIDE_SLACK),
    // Stops short of the card: a gold card would otherwise bleed into the tag.
    y1: Math.max(0, box.y0 - 2),
  };
  return glyphsInRect(image, band, w, h);
}

/** The price above a card, or null when there is no readable tag. */
export function readPrice(image: ImageLike, box: Box, templates: DigitTemplates): number | null {
  const glyphs = tagGlyphs(image, box, templates.width, templates.height);
  if (glyphs.length < 2) return null;
  const labels = glyphs.map(g => classify(g, templates));
  if (labels.some(l => l === null)) return null;
  const [first, ...rest] = labels as string[];
  if (first !== '$' || rest.length === 0 || rest.some(l => !/^[0-9]$/.test(l))) return null;
  return Number(rest.join(''));
}
