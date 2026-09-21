/**
 * Run the recogniser over real screenshots and print what it found.
 *
 * The end-to-end quality of this feature is a measurement, not an opinion, and
 * the screenshots it needs are game frames that do not belong in the
 * repository. So this harness takes them from wherever they are:
 *
 *   node scripts/check-recognition.mjs shot1.png shot2.png ...
 */
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/check-recognition.mjs <screenshot.png> ...');
  process.exit(1);
}

const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { findCandidates } = await server.ssrLoadModule('/src/vision/detect.ts');
const { recogniseIn } = await server.ssrLoadModule('/src/vision/recognise.ts');
const { parseTable } = await server.ssrLoadModule('/src/vision/table.ts');
const table = parseTable(JSON.parse(readFileSync('src/vision/card-hashes.json', 'utf8')));

for (const file of files) {
  const image = decodePng(readFileSync(file));
  const started = Date.now();
  const boxes = findCandidates(image);
  const found = recogniseIn(image, boxes, table);
  const name = file.split('/').pop();
  console.log(`${name}  ${image.width}x${image.height}  candidates ${boxes.length}  found ${found.length}  (${Date.now() - started} ms)`);
  for (const c of found) {
    console.log(`   ${c.kind.padEnd(8)} ${(c.ids.join(' / ') || '?').padEnd(22)}`
      + `score ${String(c.score).padStart(4)}  margin ${String(c.margin).padStart(4)}`
      + `   box ${c.box.x0},${c.box.y0} ${c.box.x1 - c.box.x0}x${c.box.y1 - c.box.y0}`);
  }
}
await server.close();
