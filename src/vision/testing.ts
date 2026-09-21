/**
 * Synthetic screens for the recogniser's tests.
 *
 * The real inputs are game frames, which do not belong in this repository, so
 * the tests build their own: a coloured field with card-shaped rectangles on
 * it, each with the light outline every Balatro card has. That exercises the
 * detector's actual reasoning — outline, background contrast, blob geometry —
 * without shipping a single pixel of anyone's artwork.
 */
import type { ImageLike } from './fingerprint';

export type RGB = [number, number, number];

export function blank(width: number, height: number, fill: RGB): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

export function fillRect(image: ImageLike, x0: number, y0: number, w: number, h: number, colour: RGB): void {
  for (let y = Math.max(0, y0); y < Math.min(image.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(image.width, x0 + w); x++) {
      const i = (y * image.width + x) * 4;
      image.data[i] = colour[0];
      image.data[i + 1] = colour[1];
      image.data[i + 2] = colour[2];
      image.data[i + 3] = 255;
    }
  }
}

/** A card: light border, coloured face, and a pattern so it has a fingerprint
    at all — a flat rectangle has no gradients to hash. */
export function drawCard(
  image: ImageLike, x: number, y: number, w: number, h: number, face: RGB, seed = 1,
): void {
  fillRect(image, x, y, w, h, [235, 233, 226]);
  fillRect(image, x + 4, y + 4, w - 8, h - 8, face);
  let value = seed;
  const cell = Math.max(4, Math.round(w / 8));
  for (let row = 0; row * cell < h - 16; row++) {
    for (let col = 0; col * cell < w - 16; col++) {
      value = (value * 1103515245 + 12345) & 0x7fffffff;
      if ((value >> 16) % 3 === 0) {
        fillRect(image, x + 8 + col * cell, y + 8 + row * cell, cell, cell,
          [(face[0] + 90) % 256, (face[1] + 40) % 256, (face[2] + 160) % 256]);
      }
    }
  }
}

/** The same picture at another size, the way a screenshot shows a sprite the
    atlas stores smaller. Nearest sampling keeps it honest: no smoothing that
    the fingerprint could be accidentally relying on. */
export function scaled(image: ImageLike, width: number, height: number): ImageLike {
  const out = blank(width, height, [0, 0, 0]);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const s = (sy * image.width + sx) * 4;
      const d = (y * width + x) * 4;
      out.data[d] = image.data[s];
      out.data[d + 1] = image.data[s + 1];
      out.data[d + 2] = image.data[s + 2];
      out.data[d + 3] = 255;
    }
  }
  return out;
}

/** Paint text the way the game's price tag does: gold pixel glyphs on a dark
    tag. Scaled up from the shipped templates, so a test exercises the reader's
    segmentation and scaling rather than a hand-drawn approximation. */
export function drawPriceTag(
  image: ImageLike, x: number, y: number, scale: number, text: string,
  templates: { width: number; height: number; glyphs: Record<string, string> },
  ink: RGB = [240, 176, 60],
): void {
  const gw = templates.width * scale;
  const gh = templates.height * scale;
  const gap = Math.max(2, Math.round(scale));
  const width = [...text].length * (gw + gap) + gap * 4;
  fillRect(image, x - gap * 2, y - gap * 2, width, gh + gap * 4, [46, 53, 56]);
  [...text].forEach((char, i) => {
    const bits = templates.glyphs[char];
    if (!bits) throw new Error(`no template for ${char}`);
    for (let row = 0; row < templates.height; row++) {
      for (let col = 0; col < templates.width; col++) {
        if (bits[row * templates.width + col] === '#') {
          fillRect(image, x + i * (gw + gap) + col * scale, y + row * scale, scale, scale, ink);
        }
      }
    }
  });
}
