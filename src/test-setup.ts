import '@testing-library/jest-dom/vitest';

// Newer Node versions break Web Storage in this vitest/jsdom combination
// (window.localStorage comes up undefined). Provide a functional in-memory
// fallback so tests behave like a browser; no-op wherever the environment
// already supplies real storage.
if (typeof globalThis.localStorage === 'undefined') {
  const makeStorage = (): Storage => {
    let store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      clear: () => {
        store = new Map();
      },
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    } as Storage;
  };
  const local = makeStorage();
  const session = makeStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: local, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: session, configurable: true });
  }
}
