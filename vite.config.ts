/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bal-Track — Balatro Shop Advisor',
        short_name: 'Bal-Track',
        description: 'Manual Balatro run tracker with shop recommendations',
        theme_color: '#1a1423',
        background_color: '#14101b',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
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
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
