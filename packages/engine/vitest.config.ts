import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  test: {
    // Default 10s for cold fixture I/O; isolated per-test timeout for
    // expensive integration checks only (browser / npm audit).
    testTimeout: 10_000,
  },
});
