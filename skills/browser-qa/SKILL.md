---
name: browser-qa
description: >
  Eyes/hands UI QA via dual MCP: Playwright MCP (a11y navigate/click/assert) +
  Chrome DevTools MCP (console/network/perf/CDP). Use when the owner asks for browser,
  live/manual, click-through, E2E, smoke, exploratory, screenshot or console/network proof.
  Static source/UI verification does not trigger this skill. Pair with qa-skills for matrix.
  Do NOT use for pure unit/API without UI; not 5fedu module build (5fedu-module-parity first);
  not Codex non-browser default unless owner explicit live/UI verify.
routing: {"signals":["browser","live/manual","click-through","e2e","smoke","exploratory","screenshot","console/network","playwright","chrome-devtools"],"excludes":["static source verification","unit/api only"],"priority":80,"loads":["skill:browser-qa"],"supports":["qa-skills","5fedu-module-parity"],"project_scope":"","platform_scope":"all","max_route_tokens":3500,"default":false}
---

# Browser QA

**Ý đồ:** Dual MCP — **Playwright** (hands structured) + **Chrome DevTools** (x-ray debug). Não: `qa-skills`.

## Combo

| Vai | Skill / MCP |
|---|---|
| Não | `qa-skills` |
| Hands navigate/click/assert | **Playwright MCP** (`playwright`) |
| Debug network/console/perf | **Chrome DevTools MCP** (`chrome-devtools`) |

Deep / exploratory / verify UI / E2E manual → **bắt buộc `qa-skills` + `browser-qa`** (não + dual MCP). Không chạy browser-qa không matrix; không qa-skills không hands.

## Hard gates

1. Lazy — không auto unit/lint-only.
2. Codex: browser chỉ khi owner explicit UI/live hoặc non-browser không đủ.
3. 5fedu build: primary `5fedu-module-parity`.
4. Evidence: steps + expect + actual + snapshot/screenshot (+ console/network khi fail).
5. Mutate local/staging; cấm prod không phép.

## Dual-MCP playbook (mạnh nhất)

| Bước | Playwright MCP | Chrome DevTools |
|---|---|---|
| Mở URL / login / click / form | **Primary** | Hỗ trợ nếu cần CDP |
| Assert UI state / a11y tree | **Primary** | Screenshot phụ |
| Fail: JS error, failed request | Ghi step fail | **Primary** console + network |
| Perf / long task | — | **Primary** performance |
| Permission multi-role | Session/context | Optional second profile |

Chi tiết: [`references/runbook.md`](references/runbook.md) · dual: [`references/dual-mcp.md`](references/dual-mcp.md).

## Procedure

1. Scope URL/roles/flows.
2. `qa-skills` → matrix.
3. Playwright: chạy cases; DevTools: attach khi fail/ nghi ngờ network.
4. Report findings + evidence.

## Phrase bank

browser QA, click-through, verify UI, E2E, smoke UI, exploratory, Playwright MCP, chrome-devtools, console error, network fail, test như user

## Related

- `qa-skills`
- Integrations: `playwright-mcp`, `chrome-devtools-mcp`
