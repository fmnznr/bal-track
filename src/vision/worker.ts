/**
 * The reading runs off the main thread. It takes a second or two on a phone,
 * and a frozen interface for that long reads as a crash.
 */
import { readFile } from './read';
import type { ScreenshotReading } from './read';

self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const reading: ScreenshotReading = await readFile(event.data);
    self.postMessage({ ok: true, reading });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
