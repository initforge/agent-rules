# Integrations

`integrations/registry.json` is the single canonical registry for external CLI/MCP providers. Runtime capability providers are compiled from this registry; directory names are storage only, not policy authority.

## Policies

- `required` — hard runtime dependency; use sparingly.
- `recommended` — eligible when its capability is routed; not attached to every task.
- `optional` — never selected unless explicitly requested or separately enabled by policy.
- `manual/` — local/manual providers such as Pencil; always explicit-only and outside automatic registry routing.

## Current profiles

| Profile | Required | Recommended |
|---|---|---|
| `core` | — | codebase-memory-mcp, rtk |
| `research` | — | context7 |
| `qa` | — | playwright-cli, playwright-mcp, chrome-devtools-mcp |
| `frontend` | — | playwright-cli, playwright-mcp, chrome-devtools-mcp |

Context7 is intentionally not part of the default `core` set (REQ-008 /
skill-mcp-fabric-v1): library/framework/SDK/version documentation is fetched
on-demand (Context7 CLI first, MCP escalation only) instead of being loaded
into every coding session. The pinned MCP entry remains available under the
`research` profile.

Normal coding browser proof uses `browser.verify` → Playwright Agent CLI.
Playwright MCP is `browser.explore` (exploratory/persistent state; it is not
activated merely because a prompt mentions Playwright); Chrome DevTools MCP is
`browser.debug` (console/network/performance/CDP escalation; in CI or
sensitive profiles use `--no-usage-statistics` and an isolated browser
profile, and never attach a personal logged-in browser). Serena is an
explicit-only experimental `code.semantic` provider until ablation/resource
evidence justifies promotion. Pencil remains manual/explicit-only.

## Taxonomy

The registry models, in one canonical source:

- **capability** — the logical contract (e.g. `browser.verify`,
  `docs.lookup`, `code.semantic`, `output.compress`, `browser.debug`);
- **provider** — the implementation (an integration record);
- **transport** — MCP, CLI, native host, hook/plugin;
- **middleware** — shell/output transformation (RTK is `classification:
  shell-middleware`, never an MCP server).

Capability aliases (additive, REQ-002): `docs.library` → `docs.lookup`,
`shell.output.reduce` → `output.compress`, `code.graph`/`code.symbol` →
`code.semantic`, `design.pen` → `design.inspect`. Legacy capability names stay
canonical; aliases are resolved by the kernel broker without renaming
providers.

RTK enforcement per host (recorded in `registry.json`): `claude` hook-hard,
`opencode` plugin-hard, `codex` and `antigravity` best-effort instruction.
Reduction is measured by the harness (raw vs filtered output), never taken
from `rtk gain` self-report, and middleware never alters evidence or hides
failure.

codebase-memory results are **advisory** when freshness/coverage metadata
(`indexed`, `revision_matches_head`, `parser_coverage`,
`requested_files_covered`) is missing or stale; absence of graph results never
proves absence of references — native grep/read/LSP fallback remains
mandatory.

## Validation

```bash
node automation/validate-tool-registry.mjs
python automation/generate-doc-references.py
```

Generated human-readable registry output lives at `generated/references/integration-registry.md`.


### Bounded installation and host exposure

- `AGENT_RULES_INTEGRATION_PROFILE=core` is the default installer profile. It installs only the small core recommended set; use `research`, `frontend`, `qa`, `all`, or `none` explicitly when appropriate.
- Installing a provider does **not** imply exposing its MCP tool schema globally. Governed runs attach only providers selected by the Capability Broker.
- `AGENT_RULES_GLOBAL_MCP_PROFILE` defaults to `none`. Set it to `core`, `research`, `frontend`, `qa`, or `all` only when you intentionally want always-on MCP servers in an interactive host.
- Explicit-only providers (for example Serena and Pencil) are never added by a global profile.

## Visible workspace isolation (mcp-visible-workspace-isolation-v1)

Distinct concepts — never conflated:

- **visible/headed** — the provider opens a REAL window the owner can see and
  switch to by hand. Visible is the default local mode.
- **isolated** — browser profile/session isolation (`--isolated`,
  per-task profile, never a personal browser profile). `--isolated` is NOT
  workspace isolation.
- **workspace binding** — mapping a project/OpenCode session to its virtual
  desktop (`AGENT_RULES_SOURCE_WINDOW_ID` /
  `AGENT_RULES_TARGET_WORKSPACE` / `AGENT_RULES_MCP_SESSION_ID`, injected
  per-session by `platforms/opencode/wrappers/session-launch.mjs`). Global
  config never contains hardcoded bindings; multi-candidate resolution fails
  closed with NEEDS_USER.
- **guardian** — `packages/kernel/src/runner/mcp-guardian.mjs` +
  `focus-workspace.ts`: strict provider-window attribution (exact pid, then
  /proc descendants; never "first new window"), NON-activating workspace move
  (never `wmctrl -a/-R/-s`, never xdotool windowactivate, never synthetic
  keys), post-move proof that providerWorkspace === targetWorkspace, the
  provider window is visible/non-iconic (WM_STATE), no other window moved, and
  the owner's current desktop + active window are unchanged. The guardian is a
  placement/focus guard — it is NOT a magic shield against every provider
  activation: if a headed provider steals focus or self-activates (race on
  map), the receipt is `verification_failed` and the run reports
  BLOCKED/NEEDS_USER instead of masking the problem.
- **headless** — explicit CI/owner mode only (`AGENT_RULES_MCP_VISIBILITY=
  headless`); never a silent fallback from visible mode; tests never use it to
  fake a visible-workspace pass.

Every GUI MCP launch emits a privacy-safe receipt (window ids hashed, no
titles) with session binding, target/actual workspace, non-iconic proof,
other-windows-unchanged proof, and before/after owner state.

### Race prevention and outcomes (AM-0002)

- The guardian monitors `_NET_CURRENT_DESKTOP` / `_NET_ACTIVE_WINDOW`
  continuously across the whole launch lifecycle, moves the provider window
  the instant it is strictly attributed (early move, before the WM focus
  policy can act), and only then classifies the outcome:
  - `prevented_and_verified` — no race-window violation and all post-move
    proofs hold;
  - `detected_after_violation` — desktop changed or the provider stole the
    active window during the race window; the guardian exits NON-ZERO and the
    session is NOT focus-safe;
  - `blocked_before_launch` — headed placement safety was not established, so
    the provider is never launched;
  - `verification_failed` — launched but post-move proof failed;
  - `unobservable` — owner interaction is suspected during the race window;
    evidence cannot be attributed (never a PASS).
- Live runtime reconciliation (`reconcile-opencode-mcp.mjs --check`) now
  distinguishes on-disk config IN_SYNC from live processes IN_SYNC vs
  STALE/DRIFTED (no guardian wrapper, `@latest` in argv). Stale sessions are
  reported with restart instructions and never killed.
- `automation/live-focus-probe.mjs` runs the live acceptance when the owner
  stays idle; it fails on any violation and reports UNOBSERVABLE when owner
  interaction makes the evidence untrustworthy.

### AM-0003: prevention-first mechanics (final)

- Earliest non-activating hint: the guardian sets `_NET_WM_DESKTOP` on the
  provider window directly (xprop) BEFORE issuing `wmctrl -t`, so the WM can
  place the window on the target workspace before its focus policy acts.
- Race monitoring at 50ms during launch; lifecycle monitoring at 250ms that
  NEVER stops while the server lives. If the provider window becomes the
  active window while the current workspace is not the provider workspace
  (impossible for the owner to do by clicking), the provider process tree is
  terminated, the receipt is `detected_after_violation` and the guardian
  exits non-zero.
- The live probe performs a REAL MCP handshake (initialize, tools/list, and
  an actual browser/design tool call chosen from tools/list) so the provider
  window is guaranteed to appear; it uses the EXACT pinned provider version
  from `integrations/registry.json` (never @latest, never a random cache
  entry) and cleans up only the process tree it spawned.

### Session binding & candidate resolution (mcp-availability-repair-v1)

- Candidate resolution groups ONLY OpenCode session windows (title prefix
  `OC |`); browser/MCP/desktop/owner-app child windows are never source
  candidates. Resolution order: env binding → explicit `--window` → grouped
  OC windows → project-root narrowing (window title contains the basename of
  the owning OpenCode process CWD, resolved via `/proc/<pid>/cwd` ancestry).
  The current desktop is never a target.
- Genuine multi-session ambiguity returns NEEDS_USER with candidates grouped
  per session and one concrete bind command — never a first-window guess.
- Direct-bypass project configs (playwright/chrome-devtools MCP entries
  without the `mcp-guardian.mjs` wrapper) are detected by
  `reconcile-opencode-mcp.mjs --check` (status `BYPASS`, exit 1) and must be
  removed or wrapped; the guardian is never disabled.
