# Parity verification runbook

## Preconditions

1. Claim packet defined (see `claim-format.md`)
2. Target URL is running (local dev or staging)
3. Reference URL available (or baseline screenshots in `.agent/parity-baselines/`)
4. MCPs installed: `playwright` + `chrome-devtools` (via `browser-qa`)
5. `qa-skills` loaded for matrix design if creating claims from scratch

## Session flow

### Step 1: Load claim packet

```powershell
$claims = Get-Content -Raw -Encoding UTF8 "claims.json" | ConvertFrom-Json
```

### Step 2: For each claim, execute matrix

For desktop viewport:

| Sub-step | Tool | Action |
|---|---|---|
| 2a | Playwright | Navigate to target URL |
| 2b | Playwright | Set data fixture (if applicable) |
| 2c | Playwright | Navigate to target page |
| 2d | Playwright | Wait for state (loading/populated/empty/error) |
| 2e | Chrome DevTools | Capture console messages |
| 2f | Chrome DevTools | Capture network requests |
| 2g | Playwright | Take screenshot |
| 2h | Playwright | Snapshot a11y tree |
| 2i | Playwright | Assert expected selectors exist |

For mobile viewport:

| Sub-step | Tool | Action |
|---|---|---|
| 3a | Playwright | Resize to 375x812 |
| 3b-3i | (same as 2c-2i) | Repeat with mobile viewport |

For interaction states:

| State | Tool | Action |
|---|---|---|
| hover | Playwright | `browser_hover` on target |
| focus | Playwright | `browser_press_key` Tab + assert focus ring |
| keyboard | Playwright | Tab through elements, assert focus order |
| touch | Playwright | `browser_click` with mobile viewport |

### Step 4: Collect evidence

Evidence artifacts saved to `.agent/parity-reports/<run-id>/<claim-id>/`:

```
.agent/parity-reports/<run-id>/
├── report.json
├── PC-001/
│   ├── populated-desktop-screenshot.png
│   ├── populated-desktop-a11y.json
│   ├── populated-desktop-console.json
│   ├── populated-desktop-network.json
│   ├── populated-mobile-screenshot.png
│   ├── populated-mobile-a11y.json
│   └── ...
├── PC-002/
│   └── ...
└── summary.json
```

### Step 5: Compute verdict

Compare expected vs observed:

- **Console errors > expected** → FAIL
- **Network failures > expected** → FAIL
- **Element not found** → FAIL
- **Visual diff > threshold** → visual diff check (not auto-fail, categorized)
- **Missing required evidence** → UNVERIFIED
- **Flaky baseline detection** → run again; if different, mark FLAKY

### Step 6: Classify residuals

For every visual/behavioral difference:

```json
{
  "classification": "defect",
  "details": "List view header padding is 14px, expected 16px per template",
  "expected_value": "16px",
  "actual_value": "14px"
}
```

### Step 7: Generate report

Write structured JSON report to `.agent/parity-reports/<run-id>/report.json`.

## Evidence collection commands

Default: use Playwright Agent CLI (`browser.verify`) for deterministic navigation/assertion/screenshot evidence. If the flow is genuinely exploratory, use Playwright MCP (`browser.explore`) from `integrations/recommended/playwright-mcp/`:

- `browser_navigate` — navigate to URL
- `browser_resize` — set viewport
- `browser_take_screenshot` — capture screenshot
- `browser_snapshot` — capture a11y tree snapshot
- `browser_click` / `browser_hover` — interaction
- `browser_wait_for` — wait for selector or state

Using Chrome DevTools MCP tools (from `integrations/recommended/chrome-devtools-mcp/`):

- `list_console_messages` — capture console
- `list_network_requests` — capture network
- `take_screenshot` — alternative screenshot
- `take_snapshot` — a11y snapshot
- `lighthouse_audit` — a11y audit

## Environment pinning

Record at start of session:

```json
{
  "browser": "chromium 125.0.6422.141",
  "viewport": { "desktop": "1280x720", "mobile": "375x812" },
  "locale": "vi-VN",
  "timezone": "Asia/Ho_Chi_Minh",
  "dpr": 2,
  "font_hint": "Roboto, Arial, sans-serif",
  "data_fixture": "employees-3-records"
}
```

## Flake detection

If a visual baseline check fails:

1. Record the diff score
2. Re-run the same check once
3. If second run matches first (consistent), mark as FAIL
4. If second run differs from first (inconsistent), mark as FLAKY
5. Never update expected screenshots automatically

## Expected screenshots

- Stored in `.agent/parity-baselines/` (gitignored)
- Named: `<claim-id>-<state>-<viewport>.png`
- Never auto-updated on failure
- Updated only on explicit owner request when the template changes

## Artifact gitignore

```gitignore
.agent/parity-reports/
.agent/parity-baselines/
```
