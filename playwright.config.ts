import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke coverage.
 *
 * The vitest suite renders screens in jsdom, one at a time, with a reducer it
 * drives directly. That leaves a gap nothing else covers: whether the built app
 * actually boots in a browser, whether state survives a real reload through
 * localStorage, and whether the flow holds together across screens.
 *
 * Runs against the production build, because that is what gets deployed — a dev
 * server would not catch a build that ships broken output.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{
    name: 'mobile',
    use: {
      ...devices['Pixel 7'],
      // CI installs its own browsers. Sandboxes that ship a pinned Chromium can
      // point at it instead of downloading a second copy.
      launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
    },
  }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
