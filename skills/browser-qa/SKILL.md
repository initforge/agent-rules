---
name: browser-qa
description: >
  Eyes/hands UI QA via dual MCP: Playwright MCP (a11y navigate/click/assert) +
  Chrome DevTools MCP (console/network/perf/CDP). Use when: browser QA, click-through,
  verify UI, E2E, smoke UI, exploratory run, test như user, manual test UI, Playwright MCP,
  chrome-devtools, network error, console error, regression UI, screenshot verify,
  drawer/form live check, production smoke UI. Pair with qa-skills for matrix.
  Do NOT use for pure unit/API without UI; not 5fedu module build (5fedu-module-parity first);
  not Codex non-browser default unless owner explicit live/UI verify.
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
