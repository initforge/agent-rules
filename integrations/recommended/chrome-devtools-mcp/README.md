# Chrome DevTools MCP

CDP-level browser tools: network, console, performance, DOM, screenshots. **Debug layer** for UI QA; pair with Playwright MCP for structured click-through.

Default adapter uses `--headless --isolated` to avoid visible `about:blank` windows and persistent profiles.

Operational policy (REQ-006 / skill-mcp-fabric-v1):

- Debug-only capability (`browser.debug`): console/network/performance/CDP
  diagnostics. Interaction (click/fill/navigate/assert) stays with Playwright
  (CLI for deterministic verification, MCP for exploratory sessions).
- Use `--no-usage-statistics` (and `--no-performance-crux` when field data is
  not needed) in CI or sensitive profiles; always use an isolated browser
  profile and never attach a personal logged-in browser.
- Multi-tab sessions can raise resource usage when the MCP loads tabs on
  connect; keep tab counts bounded in automation.
