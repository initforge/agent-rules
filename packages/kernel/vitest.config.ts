import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@initforge/agent-rules-kernel': resolve(__dirname, 'dist'),
    },
  },
});
