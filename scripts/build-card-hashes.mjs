/**
 * Build the recogniser's reference table from the game's own sprite atlases.
 *
 * The atlases stay out of this repository: what ships is this script's output,
 * a few hundred fingerprints of 512 bits and 108 bytes each. A fingerprint
 * cannot be turned back into a picture, and the whole table is about 25 KB.
 *
 *   node scripts/build-card-hashes.mjs <folder with the 2x atlases>
 *
 * The folder is expected to hold Jokers.png, Tarots.png, Vouchers.png and
 * boosters.png in the language the player plays in. Extract them from the
 * game's resources/textures folder; the 1x set works too, the cells are simply
 * half the size, which this script detects from the image width.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from './png.mjs';

const ATLASES = [
  { kind: 'joker', file: 'Jokers.png', cols: 10 },
  { kind: 'tarot', file: 'Tarots.png', cols: 10 },
  { kind: 'voucher', file: 'Vouchers.png', cols: 9 },
  { kind: 'pack', file: 'boosters.png', cols: 4 },
];

/** The card's art, trimmed to where it actually is and laid on white — the
    way it appears in a screenshot. Each type has its own proportions (a pack
    wrapper is narrower than a joker), and keeping them is what lets one
    comparison serve all four atlases. */
function cellOnWhite(image, x0, y0, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (image.data[((y0 + y) * image.width + x0 + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const data = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = ((y0 + minY + y) * image.width + x0 + minX + x) * 4;
      const d = (y * cw + x) * 4;
      const a = image.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) data[d + c] = Math.round(image.data[s + c] * a + 255 * (1 - a));
      data[d + 3] = 255;
    }
  }
  return { data, width: cw, height: ch };
}

const folder = process.argv[2];
if (!folder) {
  console.error('usage: node scripts/build-card-hashes.mjs <folder with the atlases>');
  process.exit(1);
}

// Load the app's own fingerprint code rather than restating it here: two
// implementations of one hash drift apart, and a drifted table matches nothing.
const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { fingerprint } = await server.ssrLoadModule('/src/vision/fingerprint.ts');

const cards = [];
for (const { kind, file, cols } of ATLASES) {
  const image = decodePng(readFileSync(join(folder, file)));
  const cellW = image.width / cols;
  const cellH = Math.round(cellW * (190 / 142));
  const rows = Math.round(image.height / cellH);
  if (!Number.isInteger(cellW) || Math.abs(rows * cellH - image.height) > 2) {
    throw new Error(`${file}: ${image.width}x${image.height} is not a ${cols}-column grid`);
  }
  let used = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const art = cellOnWhite(image, c * cellW, r * cellH, cellW, cellH);
      if (!art) continue;
      const print = fingerprint(art, { x0: 0, y0: 0, x1: art.width, y1: art.height });
      cards.push({ kind, cell: [r, c], id: null, print });
      used++;
    }
  }
  console.log(`${file}: ${cols}x${rows} cells of ${cellW}x${cellH}, ${used} with art`);
}
await server.close();

// One binary blob rather than arrays of numbers: the same table written as
// JSON numbers is nearly three times the size, for bytes nobody reads.
const bytesPerCard = 64 + cards[0].print.colour.length;
const blob = Buffer.alloc(cards.length * bytesPerCard);
cards.forEach(({ print }, i) => {
  const at = i * bytesPerCard;
  print.hash.forEach((word, w) => blob.writeUInt32LE(word >>> 0, at + w * 4));
  Buffer.from(print.colour).copy(blob, at + 64);
});

const out = 'src/vision/card-hashes.json';
writeFileSync(out, `${JSON.stringify({
  version: 1,
  colourBytes: cards[0].print.colour.length,
  cards: cards.map(({ kind, cell, id }) => ({ kind, cell, id })),
  prints: blob.toString('base64'),
})}\n`);
console.log(`${cards.length} cards -> ${out} (${(readFileSync(out).length / 1024).toFixed(1)} KB)`);
