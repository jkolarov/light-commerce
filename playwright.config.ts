import { defineConfig, devices } from '@playwright/test'

import { e2e, serverEnv } from './tests/e2e/support/env'

// The end-to-end test (`pnpm test:e2e`, S25): browse → cart → pay → order, in a real browser,
// against the dev server with both modules on. How it pays (Stripe's test mode, or a fake Stripe
// in CI), its port and its own database: tests/e2e/support/env.ts.

const env = serverEnv()
const quote = (value: string) => JSON.stringify(value)

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  // One browser, one test at a time: the tests share the dev server and its database.
  workers: 1,
  fullyParallel: false,
  // A flaky end-to-end test is a finding, not something to retry.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  // The dev server compiles each route on its first visit.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: e2e.baseURL,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    e2e.mode === 'stub'
      ? {
          name: 'Stripe stub',
          command: 'node tests/e2e/stripe-stub/server.ts',
          url: `${e2e.stubURL}/health`,
          env,
          stdout: 'pipe',
          reuseExistingServer: false,
        }
      : {
          // Forwards Stripe's test-mode webhooks to the dev server. The key goes in the
          // environment (the CLI reads STRIPE_API_KEY), not on the command line.
          name: 'Stripe CLI',
          command: `${quote(e2e.stripeCli)} listen --events payment_intent.succeeded,payment_intent.payment_failed --forward-to ${quote(`localhost:${e2e.port}${e2e.webhookPath}`)}`,
          env: { STRIPE_API_KEY: e2e.stripeSecretKey },
          // "Ready!" is on stderr, in the line that also prints the signing secret: Playwright
          // still reads stderr to wait for it, but doesn't echo it. The forwarded events
          // (`--> payment_intent.succeeded`, `<-- [200] POST …`) are on stdout.
          wait: { stderr: /Ready!/ },
          stderr: 'ignore',
          stdout: 'pipe',
          reuseExistingServer: false,
          timeout: 30_000,
        },
    {
      // A fresh database seeded with the demo, then the dev server. Next.js allows one dev server
      // per folder: stop `pnpm dev` first.
      name: 'App',
      command: `rm -rf ${quote(e2e.dataDir)} && mkdir -p ${quote(e2e.dataDir)} && pnpm seed && pnpm exec next dev --port ${e2e.port}`,
      url: `${e2e.baseURL}/healthz`,
      env,
      stdout: 'pipe',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
