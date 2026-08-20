import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Certification config: one serial test process over every TypeScript test in
 * the repository. It resolves engine package imports to source so certification
 * cannot accidentally pass against stale dist/ output.
 */
export default defineConfig({
  server: { fs: { allow: ['..'] } },
  test: {
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/generated/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: { json: 'vitest-verify-report.json' },
  },
  resolve: {
    alias: {
      '@initforge/agent-rules-engine': resolve(__dirname, 'packages/engine/src'),
    },
  },
});
