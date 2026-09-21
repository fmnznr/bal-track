/**
 * How the interface asks for a screenshot to be read.
 *
 * Always in a worker, never on this thread. Reading takes a second or two on
 * a phone, and an interface frozen for that long reads as a crash. There is
 * deliberately no same-thread fallback: it would mean a second copy of the
 * 77 KB reference table in the bundle, and every browser this app targets has
 * had module workers for years. If one cannot be started, the screen says so
 * and the manual entry it sits beside still works.
 */
import type { ScreenshotReading } from './read';

export type ReadScreenshot = (file: Blob) => Promise<ScreenshotReading>;

interface WorkerReply {
  ok: boolean;
  reading?: ScreenshotReading;
  error?: string;
}

export const readScreenshot: ReadScreenshot = file => {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return new Promise<ScreenshotReading>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.ok && event.data.reading) resolve(event.data.reading);
      else reject(new Error(event.data.error ?? 'reading failed'));
    };
    worker.onerror = () => reject(new Error('the screenshot reader could not start'));
    worker.postMessage(file);
  }).finally(() => worker.terminate());
};
