# Parity verification pipeline

## Overview

The parity verification pipeline is an automated loop that proves each claim with evidence across visual, responsive, behavioral, accessibility, console, network, and data-state dimensions.

## Pipeline stages

```
┌─────────────────────────────┐
│  1. Claim definition         │  ← claim-format.md
│     (claim packet)           │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│  2. Environment pinning      │  ← viewport, browser, font, locale, timezone, data
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│  3. State/viewport matrix    │  ← browser-qa (Playwright + Chrome DevTools)
│     execution                │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│  4. Evidence collection      │  ← screenshots, a11y snapshots, console logs,
│                              │     network logs, source assertions
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│  5. Verdict computation      │  ← PASS / FAIL / UNVERIFIED / FLAKY
│     per claim                │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│  6. Residual classification  │  ← defect / accepted_deviation /
│                              │     environment_rendering / unknown
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│  7. Report generation        │  ← machine-readable JSON + human summary
└─────────────────────────────┘
```

## Stage details

### 1. Claim definition

Each parity claim is a structured assertion with:

- `id` — unique identifier (e.g., `PC-001`)
- `dimension` — visual | responsive | behavioral | accessibility | console | network | data-state
- `claim` — human-readable assertion
- `viewport` — desktop (1280x720) | mobile (375x812) | both
- `state` — loading | populated | empty | error | hover | focus | keyboard | touch
- `expected` — the expected observable outcome
- `proof_profile` — which evidence kinds are required

### 2. Environment pinning

Every verification records:

- Viewport dimensions
- Browser name + version
- System fonts available
- Locale (lang, region)
- Timezone
- Data fixtures used (hash or inline)
- Screen DPI / device pixel ratio

### 3. State/viewport matrix

Dual MCP execution model:

| Tool | Role |
|---|---|
| Playwright Agent CLI | Default deterministic navigate/click/fill/assert/snapshot/screenshot proof for coding tasks |
| Playwright MCP | Exploratory persistent browser interaction when a CLI flow is not yet known |
| Chrome DevTools MCP | Console read, network read, performance, CDP |

Matrix order:
1. Desktop loading → Desktop populated → Desktop empty → Desktop error
2. Mobile loading → Mobile populated → Mobile empty → Mobile error
3. Desktop hover → Desktop focus → Desktop keyboard nav
4. Mobile touch → Mobile scroll

### 4. Evidence collection

Evidence types collected per claim:

- Source screenshot (PNG, 2x)
- A11y tree snapshot (JSON)
- Console log capture (JSON)
- Network request log (JSON)
- Source assertion (text)
- Visual diff (if baseline available)
- Performance trace (if applicable)

### 5. Verdict computation

| Condition | Verdict |
|---|---|
| Expected matches observed within tolerance | PASS |
| Expected differs from observed | FAIL |
| Missing proof for required dimensions | UNVERIFIED |
| Visual baseline inconsistent across runs | FLAKY |

### 6. Residual classification

| Class | Meaning | Action |
|---|---|---|
| defect | Real parity bug | Fix required |
| accepted_deviation | Owner-approved difference | Document in claim |
| environment_rendering | Font/OS/browser rendering diff | No action, record for context |
| unknown | Cannot classify | Escalate to owner |

### 7. Report generation

Output is a machine-readable JSON report at `.agent/parity-reports/<id>/report.json` plus a human-readable summary.

## Input

- Claim packet (JSON array of claim objects)
- Target URL
- Reference URL (optional, for side-by-side)
- Data fixtures

## Output

- `.agent/parity-reports/<run-id>/` — all evidence artifacts
- `.agent/parity-reports/<run-id>/report.json` — structured report
- Console PASS/FAIL summary per claim

## Automation

The pipeline is automated via `automation/parity-verify.ps1`. It:
1. Reads a claim packet JSON
2. Pins environment (viewport, data)
3. Executes the matrix via browser-qa skills
4. Collects evidence
5. Computes verdicts
6. Generates report
