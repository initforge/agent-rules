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
    // Production-Runner tests spawn real headless worker subprocesses and run
    // git fixture workflows that legitimately take ~25s cold; 60s keeps them
    // from flaking under concurrent verify:all partitions without weakening
    // any assertion (the work is real, not stubbed).
    testTimeout: 60_000,
    // Tag conventions used by `npm run smoke -- engine` and friends:
    //   fast   - < 1s, no spawn, no network. Default smoke surface.
    //   e2e    - may spawn agents / open browsers. Run explicitly.
    //   browser - Playwright / chrome-devtools MCP. Run on a host with
    //             Chrome + @playwright/mcp available.
    //   flaky  - known flaky on Windows symlink tests; tracked separately.
    // Tags are added to `it(...)` calls; CLI selection via --testNamePattern
    // or by grep'ing `tag:` here is the source of truth.
  },
});
