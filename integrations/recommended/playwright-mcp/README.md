# Playwright MCP

Agent browser control via accessibility tree (Microsoft). Primary **hands** for UI QA with skill `browser-qa`.

- Install: `npx -y @playwright/mcp@latest` (+ Chromium via install script)
- Adapters use `--headless --isolated` to avoid visible `about:blank` windows and persistent profiles.
- Pair with `chrome-devtools-mcp` for network/console/perf debug
