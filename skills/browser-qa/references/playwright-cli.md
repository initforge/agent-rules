# Playwright Agent CLI — bounded verification reference

Canonical provider: `browser.verify` → `playwright-cli`.
Pinned integration version: `@playwright/cli@0.1.18`.

Typical flow:

```text
npx -y @playwright/cli@0.1.18 open <url>
npx -y @playwright/cli@0.1.18 snapshot
npx -y @playwright/cli@0.1.18 click <ref>
npx -y @playwright/cli@0.1.18 screenshot
npx -y @playwright/cli@0.1.18 close
```

Use a named `PLAYWRIGHT_CLI_SESSION` when a bounded sequence must share state. Do not attach Playwright MCP unless the task actually needs exploratory interaction. Final proof should be reproducible from the recorded CLI actions or committed Playwright tests where practical.
