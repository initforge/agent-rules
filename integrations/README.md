# Integrations

Thư mục này nói rõ ý đồ cài sẵn của repo, không bắt người đọc phải lục manifest mới hiểu.

## Policy

- `required/`: dependency nền, phải cài và verify pass.
- `recommended/`: dependency hữu ích, auto-check và auto-install khi thiếu.
- `optional/`: giữ wrapper và ownership, không auto-cài.

## Baseline hiện tại

- `required/codebase-memory-mcp`
- `recommended/context7`
- `recommended/playwright-mcp` — hands UI QA (a11y tree)
- `recommended/chrome-devtools-mcp` — CDP debug (console/network/perf)
- `optional/caveman`

**UI QA combo:** skills `qa-skills` + `browser-qa` → Playwright MCP (navigate/click) + Chrome DevTools MCP (debug).

Registry machine-readable nằm ở `registry.json`.


