import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Host contract tests live outside the workspaces. Package tests are run by
 * their own workspace scripts.
 */
export default defineConfig({
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    include: [
      'platforms/claude/adapter.test.ts',
      'platforms/codex/adapter.test.ts',
      'platforms/deepseek-harness/adapter.test.ts',
      'platforms/opencode/adapter.test.ts',
    ],
    // Workspaces are run separately; including them here would run them twice.
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/**'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@initforge/agent-rules-kernel': resolve(__dirname, 'packages/kernel/dist'),
    },
  },
});
