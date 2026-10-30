import { defineConfig, devices } from '@playwright/test'

const PORT = 8788

// Sobe o Worker de verdade servindo o build do cliente, com semente fixa e estado limpo.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    browserName: 'chromium',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `cd apps/server && rm -rf .wrangler/e2e && npx wrangler dev --port ${PORT} --var TRUCO_SEED:7 --persist-to .wrangler/e2e`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
})
