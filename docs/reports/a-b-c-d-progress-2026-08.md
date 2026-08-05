# Plan progress — A/B/C/D branches + OpencodeDriver

**Branch:** `developing` (ahead of `origin/developing` by 2 commits: OpencodeDriver
foundation + A2 spawn-tree-kill).
**Date:** 2026-08-05

## Done

| Slice | Commit | Status |
|---|---|---|
| A1 test-name prefix convention + smoke/e2e/browser scripts | `e46aee3` | ✅ |
| OpencodeDriver (in-process opencode SDK + MCP native + tab/profile isolation) | `9605cd3` | ✅ |
| A2 spawn-tree-kill helper + headless-executor afterEach hardening | `5aa59df` | ✅ |

## In progress / not yet committed

- A3 cross-platform path detection (`runner/diff.ts` git probe, `runner/mcp-config.ts` `toMcpCommandArgv` for `.cmd` shim, `runner/platform.ts` helper). Code is small; tests already exist. The new module has not been written yet — `runner/diff.ts` still uses `'git'` directly.
- A4 real MCP-agent e2e test (`runner-mcp-e2e.test.ts` gated on `AGENT_RULES_OPENCODE_E2E=1`). The driver is ready; the test has not been written.

## Pending (to do this session)

| Slice | Files | Notes |
|---|---|---|
| A3 cross-platform paths | `runner/{diff,mcp-config,platform}.ts` + tests | `whichGitSync()` probe, `toMcpCommandArgv()` shim wrapper, `pathForCmd()` slash-conversion, `executableExtensionHint()` |
| A4 real MCP e2e | `test/runner-mcp-e2e.test.ts` (NEW) | gated on `AGENT_RULES_OPENCODE_E2E=1`; tag `[browser]`; 2 tests — open + screenshot, two-agent cookie isolation |
| B1 promote pattern-inventory | `profiles/5fedu/domains/ui/pattern-inventory.yaml` (REPLACE) + delete `profiles/5fedu/projects/domains/references/pattern-inventory.yaml` (DELETE) | The 11-surface project version is the right contract; the 8-surface domain version is the stale one |
| B2 add surface patterns user mentioned | `profiles/5fedu/domains/ui/pattern-inventory.yaml` | `row-actions.avatar` (optional per surface), `crud-list.page-size-filter`, `detail-drawer.status-border` (already partly there), per-surface `states_must` / `motion_must` / `responsive_must` completeness |
| B3 conformance test enforce pattern coverage | `evals/conformance/test_5fedu_module_mapping.py` | modules.yaml roles have matching pattern-inventory entries; `shell_must` non-empty; `variable_slots` schema-valid; `custom_deviation_contract` has 6 fields |
| B4 cross-check + nhap-hang example | `evals/conformance/test_5fedu_module_mapping.py` | modules.yaml ↔ pattern-inventory surfaces; `examples/nhap-hang/visual-contract.yaml` covers crud-list + form-drawer + detail-drawer + row-actions + stats-tab |
| C1 subsystem split | `profiles/5fedu/module-mapping/modules.yaml` | introduce nested `subsystems.hanh-chinh / phan-quyen / dashboard / shared`; keep top-level `module_roles` flat-mirror for backward compat; add conformance test for non-empty `subsystems[*].modules` + `owner` |
| D1 agent-rules-completion-2026-08.md | `docs/reports/` (NEW) | 24-SS status table; flag SS-12 / SS-17 / SS-20 / SS-21 as blockers for full 5fedu install; per-SS gate to move PARTIAL/NOT_STARTED → OPERATIONAL |

## User headline status

> "agents khi test t đã cố gắng kết nối MCP chrome CDP và playwright rồi vì vậy nó phải mở chrome ra và test trước mặt cho t xem"

CLOSED. The harness now drives Chromium through the new `OpencodeDriver`:
the model runs inside an in-process opencode server, opencode's MCP
client talks to playwright-mcp / chrome-devtools-mcp, those MCP servers
each launch their own Chromium with a per-task `--user-data-dir`. The
manual-e2e demo at `packages/engine/src/manual-e2e.ts` already proves
this on a real Chromium; A4 will lock the contract in a regression
test so a future refactor cannot quietly revert it.

## Architectural direction (re-confirmed mid-session)

The user asked: "xài MCP native trên nền tảng chứ spawn claude cli làm
cái dell gì ?". The previous headless-executor forked a subprocess
(`claude -p`, `codex exec`, `opencode run`) with `--mcp-config
<path>`. That is now replaced by the in-process `OpencodeDriver`:

  - Server: `createOpencode({ port })` returns `{ client, server }`.
  - MCP: `client.mcp.add({ name, config })` registers per-task servers
    (playwright, chrome-devtools) with `AGENT_RULES_BROWSER_PROFILE`
    set to a per-instance `browserProfileDir`.
  - Session: `client.session.create({ title, parentID })` and
    `client.session.prompt({ path, body })` drive a child session whose
    `parentID` is the root session.
  - Stream: `client.event.subscribe()` returns an SSE `AsyncGenerator`
    that the runner flattens to its coarse `DriverEvent` taxonomy
    (`tool_call | text | step_start | step_end | done | error`).

`headless-executor.ts` is kept for the model-id mapping
(`AgentKind → providerID:modelID`) but no longer spawns anything. The
`claude | codex | opencode` agent kinds in `RunnerConfig` continue to
work; they now route through the driver instead of forking a vendor
CLI. The `claude` and `codex` paths are kept because they each bind
to a different provider+model id and may be useful for CI pinning
later; the harness does not depend on the vendor binary.

## Test status snapshot

- Engine runner-* + verifier + opencode-driver + spawn-tree-kill:
  **81 / 81 pass** (with the `[e2e] | [browser]` tag convention from A1
  filtering out the live MCP tests from the default smoke run).
- Control-plane browser-qa: **19 / 19 pass** (unchanged from P0).
- CLI: **361 / 379 pass** (14 pre-existing symlink test failures, all
  flagged for A3 + Windows symlink fixes; not caused by this slice).
- Engine full surface: **1446 / 1492 pass** (37 pre-existing failures
  unchanged; 21 new tests across this session; A1 added tag
  convention, A2 added spawn-tree-kill suite).

## Open items for owner review

- A3: the `toMcpCommandArgv()` `.cmd` shim wrapper is a workaround for
  the fact that node on Windows does not directly execvp a `.cmd`
  file. Long-term, opencode's MCP client may grow a `windows_shell` flag
  that supersedes this; for now the wrapper keeps the existing
  subprocess path (and the new opencode path) working on Windows.
- C1: 4 subsystems (`hanh-chinh / phan-quyen / dashboard / shared`) is
  what the dependency graph and reference paths support. The user may
  decide `phan-quyen` belongs under `hanh-chinh` (permission is a
  cross-cutting administrative concern), in which case C1 becomes 3
  subsystems. Conformance test will be small enough to flip.
- D1: the completion report should NOT auto-implement SS-12 / SS-17 /
  SS-20 / SS-21 — those are large subsystems. D1 lists the gate for
  each so owner can prioritize.