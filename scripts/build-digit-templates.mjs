/**
 * Build the price reader's digit templates from labelled screenshots.
 *
 *   node scripts/build-digit-templates.mjs spec.json
 *
 * The spec names, for each sample, the screenshot, the card box whose price
 * tag to read (or a plain rect), and the text that is printed there:
 *
 *   [{ "file": "shop.png", "box": [1310, 422, 1488, 664], "text": "$7" },
 *    { "file": "shop.png", "rect": [400, 870, 720, 1010], "text": "$8" }]
 *
 * Screenshots are game frames and stay out of the repository, so the shipped
 * templates are this script's output rather than something rebuilt on demand.
 * It loads the reader's own normalisation code, because a template built by a
 * second implementation would match nothing the first one produces.
 *
 * The grid is finer than a price tag needs. The status column prints its
 * counters about twice the size of a tag, and on an 8x12 grid the loops of an
 * "8" quantise to two columns, so one pixel of jitter turned an ante 8 into a
 * 0 or a 6. Samples of both sizes on a 12x18 grid tell them apart.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const W = 12;
const H = 18;

const specPath = process.argv[2];
if (!specPath) {
  console.error('usage: node scripts/build-digit-templates.mjs <spec.json>');
  process.exit(1);
}

const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { tagGlyphs, glyphsInRect, glyphToString } = await server.ssrLoadModule('/src/vision/price.ts');

const samples = new Map(); // label -> list of glyph strings
for (const { file, box, rect, text } of JSON.parse(readFileSync(specPath, 'utf8'))) {
  const image = decodePng(readFileSync(file));
  const [x0, y0, x1, y1] = box ?? rect;
  const where = { x0, y0, x1, y1 };
  const glyphs = box ? tagGlyphs(image, where, W, H) : glyphsInRect(image, where, W, H);
  if (glyphs.length !== [...text].length) {
    console.warn(`${file} ${box ?? rect}: found ${glyphs.length} glyphs for "${text}" — skipped`);
    continue;
  }
  [...text].forEach((label, i) => {
    if (!samples.has(label)) samples.set(label, []);
    samples.get(label).push(glyphToString(glyphs[i]));
  });
}
await server.close();

/** Where samples of one glyph disagree, the majority decides: the disagreement
    is antialiasing at one size, not a different character. */
const glyphs = {};
for (const [label, seen] of [...samples].sort()) {
  let bits = '';
  for (let i = 0; i < W * H; i++) {
    const on = seen.filter(s => s[i] === '#').length;
    bits += on * 2 >= seen.length ? '#' : '.';
  }
  glyphs[label] = bits;
  console.log(`${label}: ${seen.length} sample(s)`);
}

const missing = [...'0123456789$'].filter(c => !(c in glyphs));
if (missing.length > 0) console.warn(`no sample for: ${missing.join(' ')}`);

writeFileSync('src/vision/digits.json', `${JSON.stringify({ width: W, height: H, glyphs })}\n`);
console.log(`${Object.keys(glyphs).length} glyphs -> src/vision/digits.json`);
