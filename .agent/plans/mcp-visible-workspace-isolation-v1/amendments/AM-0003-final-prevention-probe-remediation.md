# AM-0003 — Final prevention/probe/runtime remediation

Amendment ID: AM-0003
Type: owner-authorized final remediation (continuation of mcp-visible-workspace-isolation-v1)
Date: 2026-08-14

## Fixes mandated by the owner brief

A. **Polling is not prevention.** The guardian now performs the earliest
   non-activating hint available from user space: the instant a provider
   window is strictly attributed, its `_NET_WM_DESKTOP` property is set
   directly (xprop, never activating) BEFORE the `wmctrl -t` move — the WM
   can place the window on the target workspace before its focus policy
   acts. Race monitoring runs at 50ms during the launch window. If the WM/
   provider still cannot guarantee safe visible launch, the run fails closed
   (`blocked_before_launch`) — never headless/hide/minimize/Xvfb.

B. **Monitor never stops after placement.** The guardian keeps monitoring for
   the whole server lifecycle (250ms cadence) using
   `isLifecycleFocusViolation`: if the provider window becomes the active
   window while the current workspace is NOT the provider workspace (an owner
   cannot click a window on another workspace), the provider process tree is
   terminated, the receipt is `detected_after_violation` and the guardian
   exits NON-ZERO. Post-placement monitoring is documented as a lifecycle
   safety-net on top of the prevention move, not a substitute.

C. **Probe does not close stdin early.** `live-focus-probe.mjs` keeps stdin
   open and performs a real MCP handshake: `initialize` →
   `notifications/initialized` → `tools/list` → a REAL browser/design tool
   call (tool selected from `tools/list`, navigate/tabs preferred; never a
   hard-coded tool name) so the provider window is guaranteed to appear.
   Cleanup only touches the process tree the probe spawned.

D. **Probe uses the pinned provider.** Provider resolution reads the version
   pin from `integrations/registry.json` and scans the npx cache for the
   EXACT version (package.json match). Random first-cache-entry selection and
   `@latest` are rejected with BLOCKED.

E. **Live runtime reconciliation.** `reconcile --check` keeps the
   config-IN_SYNC vs live-STALE distinction; restart commands are specific
   (close and reopen the owning OpenCode session; no `reconcile --apply` when
   the config is already IN_SYNC) and confirm `guardian_wrapped=true` after
   restart. Stale processes are never killed.

## Receipt semantics (unchanged from AM-0002, now provable)

`prevented_and_verified` requires: visible/non-iconic proof, provider
workspace === target workspace, current/active window before === after, no
race-window violation, no lifecycle focus violation, real provider tool call
executed, receipt written after the UI appeared. Owner interaction during the
probe → `unobservable` + non-zero exit, never PASS.

## Live acceptance

The probe was prepared and pinned-resolution verified (playwright-mcp
@0.0.78, chrome-devtools-mcp @1.7.0 exact cache matches). Live execution was
NOT possible during this run because the owner was actively using the host
(desktop switched 0→1 mid-session); per the brief this is recorded as
UNOBSERVABLE/BLOCKED with the exact manual command — never a fabricated PASS.
