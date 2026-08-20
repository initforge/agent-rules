---
name: browser-qa
description: 'Browser QA using the smallest provider that proves the claim: Playwright Agent CLI for normal coding verification,
  Playwright MCP for exploratory interaction, and Chrome DevTools MCP for console/network/CDP diagnostics. Use for live browser/E2E/visual
  proof; not for pure unit/API-only work.'
---
# Browser QA

Use the smallest browser surface that proves the acceptance claim.

Routing aliases include `qa-skills`, `chrome-devtools`, `console error`, `smoke UI`,
and `E2E`; these terms do not change provider selection or proof requirements.

## Provider policy

1. **Normal coding verification → `browser.verify` → Playwright Agent CLI.**
   - Prefer `playwright-cli` / `npx -y @playwright/cli@0.1.18` for deterministic navigate/snapshot/click/assert/screenshot proof.
   - It is the default coding-agent browser path because it avoids attaching a large MCP tool schema to every task.
2. **Exploratory interaction → `browser.explore` → Playwright MCP.**
   - Use only when the agent needs a persistent exploratory loop, rich page introspection, or interactive self-healing behavior.
3. **Browser diagnostics → `browser.debug` → Chrome DevTools MCP.**
   - Use for console, network, CDP, performance, or browser-runtime diagnosis.
4. Never require all three providers for ordinary UI work. Capability routing chooses only what the TaskPacket needs.

## Manual visibility contract

When the task explicitly requests a manual walkthrough, the browser and the
operator-facing surface must be visible in the foreground:

- Manual Playwright work opens a visible browser/session. A headless run is
  automated evidence only and cannot be relabeled as manual verification.
- Manual Chrome DevTools work opens the visible browser and DevTools surface so
  console, network, CDP, and performance observations are inspectable by the
  operator.
- If the requested visible surface cannot be opened, observed, or kept bound to
  the evidence receipt, record `BLOCKED`/`UNAVAILABLE`; never silently downgrade
  to a hidden session and claim manual PASS.
- CI may use a separate explicitly declared headless profile. Its result must
  retain the execution mode and cannot satisfy a manual-visible requirement.

This contract applies to projects using the skill; it does not auto-install,
auto-route, or make any browser provider globally mandatory.

See [`references/playwright-cli.md`](references/playwright-cli.md) for the bounded CLI workflow.

## Evidence ladder

- Static/build claim → lint/typecheck/build evidence.
- UI behavior claim → browser.verify evidence.
- Unknown live-browser behavior → browser.explore, then convert the discovered flow into deterministic browser.verify proof where feasible.
- Console/network/performance diagnosis → browser.debug.
- Visual parity → screenshot/runtime evidence plus the parity verifier; browser availability alone is not parity proof.

## Hard rules

- Do not infer PASS from screenshots when the claim is interaction/behavior.
- Do not use MCP merely because it is installed.
- Keep raw traces/screenshots/logs as evidence artifacts; return concise summaries to the worker context.
- For explicitly activated 5fedu ERP tasks, the 5fedu source/behavior map is authoritative and this skill only supplies browser proof.
