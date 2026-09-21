/**
 * Minimal PNG reader for the build-time scripts: 8-bit RGB/RGBA,
 * non-interlaced, which is what the game ships. Kept here rather than pulled
 * in as a dependency — the app must not grow one for a build-time chore.
 */
import { inflateSync } from 'node:zlib';

export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0, depth = 0, colour = 0;
  const idat = [];
  let palette = null;
  let alpha = null;
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') alpha = Buffer.from(body);
    else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour];
  if (!channels) throw new Error(`unsupported colour type ${colour}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const lines = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = raw.subarray(src, src + stride);
    src += stride;
    const out = lines.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= channels ? prior[x - channels] : 0;
      let value = row[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`unknown filter ${filter}`);
      out[x] = value & 0xff;
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    const s = i * channels;
    if (colour === 6) {
      data[o] = lines[s]; data[o + 1] = lines[s + 1]; data[o + 2] = lines[s + 2]; data[o + 3] = lines[s + 3];
    } else if (colour === 2) {
      data[o] = lines[s]; data[o + 1] = lines[s + 1]; data[o + 2] = lines[s + 2]; data[o + 3] = 255;
    } else if (colour === 0) {
      data[o] = data[o + 1] = data[o + 2] = lines[s]; data[o + 3] = 255;
    } else if (colour === 4) {
      data[o] = data[o + 1] = data[o + 2] = lines[s]; data[o + 3] = lines[s + 1];
    } else {
      const p = lines[s] * 3;
      data[o] = palette[p]; data[o + 1] = palette[p + 1]; data[o + 2] = palette[p + 2];
      data[o + 3] = alpha && lines[s] < alpha.length ? alpha[lines[s]] : 255;
    }
  }
  return { data, width, height };
}
