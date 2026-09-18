import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The manifest icons are precached on their own; these two are only
      // referenced from the document head, so name them to keep the offline
      // shell complete.
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Bal-Track — Balatro Shop Advisor',
        short_name: 'Bal-Track',
        description: 'Manual Balatro run tracker with shop recommendations',
        theme_color: '#21252e',
        background_color: '#21252e',
        display: 'standalone',
        // The square icons keep their own margin; the maskable one holds the
        // art inside the safe circle, because a launcher may crop to any shape.
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    // Node >= 24 ships an experimental localStorage global that reads as
    // undefined without --localstorage-file; its presence stops vitest from
    // copying jsdom's real Storage onto the test global. Disable it so the
    // jsdom implementation wins.
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: './src/test-setup.ts',
    // e2e/ belongs to Playwright; vitest cannot run test.use() and would fail
    // to collect it.
    exclude: [...configDefaults.exclude, '**/.claude/**', 'e2e/**'],
  },
});
