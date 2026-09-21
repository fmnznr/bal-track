/**
 * Finding cards in a screenshot, without knowing the layout or the background.
 *
 * Two independent cues, because each fails where the other holds:
 *
 * - Every card type is drawn with a light outline — a white joker frame, a pale
 *   tarot border, the light wrapper edge of a booster pack. That outline is
 *   there on green felt and on the animated purple of an opened pack alike, and
 *   it ignores the orange price pill, which is not part of the card.
 * - Anything that is not the background. The background is whatever dominates
 *   the image's outer band, so this adapts to the screen rather than assuming
 *   felt green. It catches dark cards whose outline the first cue misses.
 *
 * Neither cue decides what a card *is*: that is the fingerprint's job, and it
 * is also what rejects the playing cards and the deck back that both cues
 * happily return.
 */
import type { Box, ImageLike } from './fingerprint';

/** Sample every other pixel: cards are hundreds of pixels tall. */
const STEP = 2;
const MIN_BLOB = 200;
const MIN_CARD_HEIGHT = 80;

function scan(image: ImageLike, keep: (r: number, g: number, b: number) => boolean): boolean[] {
  const w = Math.ceil(image.width / STEP);
  const h = Math.ceil(image.height / STEP);
  const mask = new Array<boolean>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * STEP * image.width + x * STEP) * 4;
      mask[y * w + x] = keep(image.data[i], image.data[i + 1], image.data[i + 2]);
    }
  }
  return mask;
}

interface Blob extends Box {
  pixels: number;
}

/** Flood fill, iterative — a recursive fill overflows on a full-screen blob. */
function blobs(mask: boolean[], w: number, h: number): Blob[] {
  const seen = new Uint8Array(mask.length);
  const found: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;
    let minX = w, minY = h, maxX = 0, maxY = 0, n = 0;
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (n >= MIN_BLOB) {
      found.push(...splitWide(mask, w, {
        x0: minX * STEP, y0: minY * STEP,
        x1: (maxX + 1) * STEP, y1: (maxY + 1) * STEP,
        pixels: n * STEP * STEP,
      }));
    }
  }
  return found;
}

/**
 * Cards standing side by side can come back as one blob, and a price pill
 * bridging two of them is enough to join them. A card is a solid column of
 * foreground, so the gap between two of them shows up as a valley in the
 * column profile — split there, and keep splitting while the piece is still
 * too wide to be a card.
 */
function splitWide(mask: boolean[], maskW: number, b: Blob, depth = 0): Blob[] {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  if (depth >= 2 || w / h < 0.9) return [b];
  const cols = w / STEP;
  const profile = new Array<number>(cols).fill(0);
  for (let y = b.y0 / STEP; y < b.y1 / STEP; y++) {
    for (let c = 0; c < cols; c++) {
      if (mask[y * maskW + b.x0 / STEP + c]) profile[c]++;
    }
  }
  const margin = Math.round(cols * 0.25);
  let cut = -1;
  let lowest = Infinity;
  for (let c = margin; c < cols - margin; c++) {
    if (profile[c] < lowest) {
      lowest = profile[c];
      cut = c;
    }
  }
  if (cut < 0 || lowest > 0.35 * (h / STEP)) return [b];
  const at = b.x0 + cut * STEP;
  return [
    ...splitWide(mask, maskW, { ...b, x1: at, pixels: b.pixels / 2 }, depth + 1),
    ...splitWide(mask, maskW, { ...b, x0: at, pixels: b.pixels / 2 }, depth + 1),
  ];
}

function cardShaped(b: Blob): boolean {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  // Card art runs from 0.61 (a pack wrapper) to 0.74 (a joker) wide per unit
  // of height. The window is far looser than that on purpose: a blob often
  // swallows the price pill above a card or stops short where an edge is
  // interrupted, and the refinement step can recover from either. Handing it
  // a candidate it never sees cannot be recovered from.
  return h >= MIN_CARD_HEIGHT && w / h > 0.45 && w / h < 1.25;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

function byLightOutline(image: ImageLike): Blob[] {
  return blobs(
    scan(image, (r, g, b) => {
      const max = Math.max(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = max > 0 ? (max - Math.min(r, g, b)) / max : 0;
      return lum > 165 && sat < 0.45;
    }),
    Math.ceil(image.width / STEP),
    Math.ceil(image.height / STEP),
  );
}

function byBackgroundContrast(image: ImageLike): Blob[] {
  // Quantise colours coarsely and call the outer band's most common ones the
  // background, whatever they happen to be on this screen.
  const bucket = (r: number, g: number, b: number) =>
    ((r / 24) | 0) * 121 + ((g / 24) | 0) * 11 + ((b / 24) | 0);
  const counts = new Map<number, number>();
  const bandY = Math.max(2, Math.round(image.height * 0.04));
  const bandX = Math.max(2, Math.round(image.width * 0.04));
  for (let y = 0; y < image.height; y++) {
    const edgeRow = y < bandY || y >= image.height - bandY;
    for (let x = 0; x < image.width; x++) {
      if (!edgeRow && x >= bandX && x < image.width - bandX) continue;
      const i = (y * image.width + x) * 4;
      const key = bucket(image.data[i], image.data[i + 1], image.data[i + 2]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const background = new Set(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([key]) => key),
  );
  return blobs(
    scan(image, (r, g, b) => !background.has(bucket(r, g, b))),
    Math.ceil(image.width / STEP),
    Math.ceil(image.height / STEP),
  );
}

function overlap(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  const union =
    (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Candidate boxes, roughly framing a card each. Sizes are not normalised here:
 * a pack really is taller than a joker, and forcing one aspect on all of them
 * is what hides the packs.
 */
export function findCandidates(image: ImageLike): Box[] {
  const shaped = [...byLightOutline(image), ...byBackgroundContrast(image)].filter(cardShaped);
  if (shaped.length === 0) return [];
  const typical = median(shaped.map(b => b.y1 - b.y0));
  const kept: Box[] = [];
  for (const b of shaped) {
    const h = b.y1 - b.y0;
    if (h < 0.85 * typical || h > 1.6 * typical) continue;
    const box = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    // Only near-identical boxes are dropped here. Two cues framing the same
    // card differently is useful — the better framing wins after refinement.
    if (kept.every(k => overlap(box, k) < 0.85)) kept.push(box);
  }
  return kept.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}
