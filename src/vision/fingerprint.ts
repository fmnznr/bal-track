/**
 * A card's fingerprint: what the recogniser compares instead of pixels.
 *
 * Two parts, because neither alone is enough. The gradient hash carries the
 * artwork and survives scaling, mild blur and the tilt Balatro gives its cards;
 * it is blind to colour, which matters because several jokers share a drawing
 * and differ only in hue. The coarse colour signature settles exactly those,
 * and is deliberately weak — an edition (Foil, Holographic, Polychrome) tints
 * the whole card, and a tint must not outvote the drawing.
 */
export interface ImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Fingerprint {
  /** 512 gradient bits, packed 32 to a word. */
  hash: Uint32Array;
  /** 6x6 RGB means, 0-255. */
  colour: Uint8Array;
}

const HASH_SIDE = 16; // 16x16 samples -> 256 horizontal + 256 vertical bits
const COLOUR_SIDE = 6;

/**
 * Area-average resample of a sub-rectangle. Every comparison in the recogniser
 * is a downscale of something much larger, so averaging beats sampling: it is
 * what keeps a card's fingerprint the same whether it was screenshotted at
 * 182px wide or 244.
 */
function resample(image: ImageLike, box: Box, outW: number, outH: number): Float32Array {
  const out = new Float32Array(outW * outH * 3);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  for (let oy = 0; oy < outH; oy++) {
    const sy0 = box.y0 + (oy * h) / outH;
    const sy1 = box.y0 + ((oy + 1) * h) / outH;
    const y0 = Math.max(0, Math.floor(sy0));
    const y1 = Math.min(image.height, Math.max(y0 + 1, Math.ceil(sy1)));
    for (let ox = 0; ox < outW; ox++) {
      const sx0 = box.x0 + (ox * w) / outW;
      const sx1 = box.x0 + ((ox + 1) * w) / outW;
      const x0 = Math.max(0, Math.floor(sx0));
      const x1 = Math.min(image.width, Math.max(x0 + 1, Math.ceil(sx1)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * image.width + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          r += image.data[i];
          g += image.data[i + 1];
          b += image.data[i + 2];
          n++;
        }
      }
      const o = (oy * outW + ox) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return out;
}

function luma(rgb: Float32Array, i: number): number {
  return 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
}

export function fingerprint(image: ImageLike, box: Box): Fingerprint {
  const side = HASH_SIDE + 1;
  const grid = resample(image, box, side, side);
  const hash = new Uint32Array(16);
  let bit = 0;
  const set = (on: boolean) => {
    if (on) hash[bit >>> 5] |= 1 << (bit & 31);
    bit++;
  };
  for (let y = 0; y < HASH_SIDE; y++) {
    for (let x = 0; x < HASH_SIDE; x++) {
      const here = luma(grid, (y * side + x) * 3);
      set(luma(grid, (y * side + x + 1) * 3) > here);
      set(luma(grid, ((y + 1) * side + x) * 3) > here);
    }
  }

  const small = resample(image, box, COLOUR_SIDE, COLOUR_SIDE);
  const colour = new Uint8Array(small.length);
  for (let i = 0; i < small.length; i++) colour[i] = Math.round(small[i]);
  return { hash, colour };
}

function popcount(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Distance between two fingerprints: differing bits, plus the mean colour
 * difference weighted so that it can break a tie but not overturn the artwork.
 */
export const COLOUR_WEIGHT = 2;

export function distance(a: Fingerprint, b: Fingerprint): number {
  let bits = 0;
  for (let i = 0; i < a.hash.length; i++) bits += popcount(a.hash[i] ^ b.hash[i]);
  let colour = 0;
  for (let i = 0; i < a.colour.length; i++) colour += Math.abs(a.colour[i] - b.colour[i]);
  return bits + (COLOUR_WEIGHT * colour) / a.colour.length;
}
