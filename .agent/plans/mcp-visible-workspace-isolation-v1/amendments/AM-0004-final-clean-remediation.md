# AM-0004 — Final clean remediation (EWMH compliance + lifecycle semantics)

Amendment ID: AM-0004
Type: owner-authorized final clean remediation
Date: 2026-08-15

## Fixes

A. **EWMH compliance — property claim removed.** Direct `xprop -set
   _NET_WM_DESKTOP` is NOT an EWMH-guaranteed mechanism: the property is
   WM-managed and may be ignored or overwritten. It has been REMOVED from the
   placement path. The backend now uses only the EWMH-compliant
   `_NET_WM_DESKTOP` CLIENT MESSAGE to the root window, which `wmctrl -t`
   implements; acceptance always comes from the post-move readback
   (providerWorkspace === targetWorkspace), never from an exit code.
   Fixtures cover: client message not applied (move no-op), client message
   rejected (wmctrl status != 0 → blocked), window mapped/focused before the
   move (steal-focus → verification_failed).

B. **Race reality.** No user-space mechanism can intercept MapRequest before
   the WM focus policy on a stock X11 setup without an Xlib/X event watcher.
   The guardian therefore: (1) attributes and moves the provider window at
   50ms cadence the instant it appears (early EWMH client message), (2) treats
   any race-window desktop/focus change as `detected_after_violation` with
   non-zero exit and provider termination, and (3) never downgrades a
   post-hoc detection to a prevention claim. `prevented_and_verified` is only
   granted when readback, visibility, isolation and owner-state proofs all
   hold with no observed violation.

C. **Lifecycle semantics.** Monitoring never stops after placement. Three
   cases are distinguished by `isLifecycleFocusViolation`:
   - provider active while current workspace != provider workspace →
     violation (owner cannot click a window on another workspace);
   - owner moved to the provider workspace and clicked the provider → active
     == provider while current workspace == provider workspace → NOT a
     violation (intentional owner interaction);
   - active window changed without attribution → `unobservable`, never PASS.
   Violations terminate the FULL provider descendant tree via /proc walk
   (leaves first — `terminateProcessTree`), never the caller's process group,
   and exit non-zero.

D. **Placement failures are never ignored.** A rejected EWMH move yields
   `blocked` with the exact command and reason recorded; a no-op move yields
   `verification_failed`. No exit code alone grants PASS.

## Probe

`live-focus-probe.mjs` is a true E2E: fresh source window resolution, explicit
target workspace, exact pinned provider from `integrations/registry.json`
(package + version + commandName + package.json version match; never a random
npx cache entry, never @latest), guardian-wrapped spawn with stdin kept alive,
MCP initialize → notifications/initialized → tools/list → a REAL browser tool
call chosen from tools/list (navigate/tabs preferred), placement receipt
await, race + lifecycle monitoring, before/after evidence, cleanup only of
probe-spawned processes.

## Live evidence (2026-08-15)

- Run 1 (pre non-iconic retry fix): before/after current workspace and active
  window UNCHANGED (ws 0), provider workspace 4 === target 4,
  other-windows-unchanged true; failed only on a stale WM_STATE read, fixed
  by retry logic.
- Run 2: UNOBSERVABLE — the owner actively switched desktops 1→2→3→0 during
  the race window (31 desktop-change observations); exit 4, no fabricated
  PASS, probe cleanup correct.
- Live acceptance remains PARTIAL / OWNER_ACCEPTANCE_REQUIRED until a clean
  idle run produces `prevented_and_verified` with the full evidence set.
