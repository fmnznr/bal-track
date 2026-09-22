/**
 * Reading a screenshot, from a file the player picked to a list of cards.
 *
 * Kept apart from the UI and loaded on demand: the reference table is 77 KB
 * that nobody who never imports a screenshot should have to download.
 */
import { findCandidates } from './detect';
import type { ImageLike } from './fingerprint';
import { recogniseIn } from './recognise';
import type { DetectedCard } from './recognise';
import { readHud } from './panel';
import type { Hud } from './panel';
import { readPrice } from './price';
import type { DigitTemplates } from './price';
import { parseTable } from './table';
import cardHashes from './card-hashes.json';
import digits from './digits.json';

/** A card the screenshot showed, with the price on its tag when there was a
    readable one. Owned jokers carry no tag, and neither does a card whose tag
    the reading could not settle — in both cases the catalog price stands. */
export type ReadCard = DetectedCard & { price: number | null };

export interface ScreenshotReading {
  cards: ReadCard[];
  /** The money in hand and the reroll cost, where the screenshot showed them. */
  hud: Hud;
  width: number;
  height: number;
}

let table: ReturnType<typeof parseTable> | null = null;

export function readImage(image: ImageLike): ScreenshotReading {
  table ??= parseTable(cardHashes as Parameters<typeof parseTable>[0]);
  const found = recogniseIn(image, findCandidates(image), table);
  const templates = digits as DigitTemplates;
  return {
    cards: found.map(card => ({ ...card, price: readPrice(image, card.box, templates) })),
    hud: readHud(image, templates, found.map(card => card.box)),
    width: image.width,
    height: image.height,
  };
}

/** Pixels from a picked file, wherever this runs: a worker has no document. */
export async function decode(file: Blob): Promise<ImageLike> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
    const context = canvas.getContext('2d') as
      (OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null);
    if (!context) throw new Error('no 2d canvas context');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export async function readFile(file: Blob): Promise<ScreenshotReading> {
  return readImage(await decode(file));
}
