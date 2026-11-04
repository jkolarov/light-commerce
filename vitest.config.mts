import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // `@/...` and `@payload-config` from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    // Unit tests are `*.test.ts(x)`, in `tests/` or next to the code. End-to-end tests (S25) use another runner.
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
  },
})
