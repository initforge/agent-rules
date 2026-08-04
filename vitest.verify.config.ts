import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/** Serialized Vitest for verify:all. Isolated workers, no file parallelism. */
export default defineConfig({
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    // Serialized: one worker, no file parallelism
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    // Replicate package-level timeout
    testTimeout: 10_000,
    // Machine-readable output + pass-on-fail for script-level exit control
    reporters: ['json'],
    outputFile: {
      json: 'vitest-verify-report.json',
    },
  },
  resolve: {
    alias: {
      '@initforge/agent-rules-engine': resolve(__dirname, 'packages/engine/dist'),
    },
  },
});
