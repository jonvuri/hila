import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Test browser contexts isolate their OPFS databases. Parallelize spec files,
  // while keeping tests within each file ordered.
  workers: 4,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    // The Vite dev server already sets COOP/COEP headers required for SharedArrayBuffer
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /performance-contract\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-performance',
      testMatch: /performance-contract\.spec\.ts/,
      dependencies: ['chromium'],
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run start',
    port: 3000,
    reuseExistingServer: true,
  },
})
