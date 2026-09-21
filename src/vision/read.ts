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
import { parseTable } from './table';
import cardHashes from './card-hashes.json';

export interface ScreenshotReading {
  cards: DetectedCard[];
  width: number;
  height: number;
}

let table: ReturnType<typeof parseTable> | null = null;

export function readImage(image: ImageLike): ScreenshotReading {
  table ??= parseTable(cardHashes as Parameters<typeof parseTable>[0]);
  return {
    cards: recogniseIn(image, findCandidates(image), table),
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
