/**
 * The reference table: fingerprints of every card sprite, as numbers.
 *
 * Built by `scripts/build-card-hashes.mjs` from the game's own atlases, which
 * are not in this repository. A fingerprint cannot be turned back into a
 * picture, so what ships is a table of hashes, not game art.
 */
import type { Fingerprint } from './fingerprint';
import type { CardKind, ReferenceCard } from './recognise';

interface TableFile {
  version: number;
  colourBytes: number;
  cards: { kind: CardKind; cell: [number, number]; id: string | null }[];
  /** base64: per card, 16 little-endian hash words followed by the colour bytes. */
  prints: string;
}

const HASH_BYTES = 64;

function decodeBase64(text: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  // Node, for the build script and the tests.
  return new Uint8Array(Buffer.from(text, 'base64'));
}

export function parseTable(file: TableFile): ReferenceCard[] {
  if (file.version !== 1) throw new Error(`unknown card table version ${file.version}`);
  const bytes = decodeBase64(file.prints);
  const perCard = HASH_BYTES + file.colourBytes;
  if (bytes.length !== file.cards.length * perCard) {
    throw new Error(`card table is ${bytes.length} bytes, expected ${file.cards.length * perCard}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return file.cards.map((card, i) => {
    const at = i * perCard;
    const hash = new Uint32Array(HASH_BYTES / 4);
    for (let w = 0; w < hash.length; w++) hash[w] = view.getUint32(at + w * 4, true);
    const print: Fingerprint = { hash, colour: bytes.slice(at + HASH_BYTES, at + perCard) };
    return { kind: card.kind, cell: card.cell, id: card.id, print };
  });
}
