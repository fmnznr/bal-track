import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const background = [20, 16, 27];
  const card = [224, 83, 61];
  const ink = [236, 230, 242];
  const rows = [];
  const left = size * 0.2;
  const right = size * 0.8;
  const top = size * 0.1;
  const bottom = size * 0.9;
  const radius = size * 0.08;
  const insideRoundedCard = (x, y) => {
    if (x < left || x > right || y < top || y > bottom) return false;
    const dx = x < left + radius ? left + radius - x : x > right - radius ? x - (right - radius) : 0;
    const dy = y < top + radius ? top + radius - y : y > bottom - radius ? y - (bottom - radius) : 0;
    return dx * dx + dy * dy <= radius * radius;
  };
  const insideDiamond = (x, y, cx, cy, half) => Math.abs(x - cx) + Math.abs(y - cy) <= half;

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // filter byte 0 + RGB pixels
    for (let x = 0; x < size; x++) {
      let color = insideRoundedCard(x, y) ? card : background;
      if (
        insideDiamond(x, y, size * 0.5, size * 0.5, size * 0.16)
        || insideDiamond(x, y, size * 0.3, size * 0.22, size * 0.045)
        || insideDiamond(x, y, size * 0.7, size * 0.78, size * 0.045)
      ) color = ink;
      row[1 + x * 3] = color[0];
      row[2 + x * 3] = color[1];
      row[3 + x * 3] = color[2];
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/pwa-192.png', png(192));
writeFileSync('public/pwa-512.png', png(512));
console.log('icons written to public/');
