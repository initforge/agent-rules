import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Root test config: discovers the test files that live outside the workspaces.
 *
 * These used to be enumerated by hand in package.json's `test` script — one long line
 * naming eleven specific files — so a new test at the repo root simply did not run
 * until someone remembered to add it. Discovery removes that failure mode.
 *
 * Workspace packages keep their own configs and are run via
 * `npm run test --workspaces`.
 */
export default defineConfig({
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    include: [
      'automation/**/*.test.ts',
      'platforms/**/*.test.ts',
      'evals/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    // Workspaces are run separately; including them here would run them twice.
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/**'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@initforge/agent-rules-engine': resolve(__dirname, 'packages/engine/dist'),
    },
  },
});
