---
name: qa-skills
description: >
  QA brain — exploratory matrix, edge/permission/state, severity, bug reports.
  Upstream map: petrkindlmann/qa-skills. Use when: QA checklist, exploratory, edge-case,
  test như QA, manual cases, bug triage, ngóc ngách, permission matrix, verify UI plan,
  release readiness smoke plan, regression plan, test strategy UI. Combo hands: browser-qa
  (Playwright MCP + Chrome DevTools). Do NOT pure unit/API-only; not 5fedu module build
  (5fedu-module-parity first).
routing: {"signals":["QA checklist","exploratory","edge-case","test như QA","manual cases","bug triage","permission matrix","release readiness","regression plan","test strategy UI"],"intent_signals":["qa"],"excludes":["pure unit/api only"],"priority":60,"loads":["skill:qa-skills"],"supports":["browser-qa","5fedu-module-parity"],"project_scope":"","platform_scope":"all","max_route_tokens":3000,"default":false}
---

# QA Skills

**Upstream:** [petrkindlmann/qa-skills](https://github.com/petrkindlmann/qa-skills)

## Combo

| Vai | Skill |
|---|---|
| **Não** | `qa-skills` (this) |
| **Mắt + tay** | `browser-qa` → Playwright MCP + Chrome DevTools MCP |

Deep/manual/UI verify → **bắt buộc load cả 2**: `qa-skills` + `browser-qa` (não + mắt/tay). Không chỉ một skill.

## Hard gates

1. Lazy — không auto unit/lint.
2. Matrix in-scope trước claim “đã QA”.
3. Permission ≥2 role khi chạm phân quyền.
4. 5fedu build: primary `5fedu-module-parity`.

## Procedure

1. Scope flows/roles.
2. Matrix: [`references/methodology.md`](references/methodology.md).
3. Run: **`browser-qa`** (dual MCP).
4. Findings + evidence.

## Phrase bank

QA checklist, exploratory, edge case, test như QA, manual test, ngóc ngách, verify UI, regression plan, smoke plan

## Related

- `browser-qa`
- Integrations: `playwright-mcp`, `chrome-devtools-mcp`
