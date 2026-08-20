# AM-0002 — Prevention-first race remediation + live runtime reconciliation

Amendment ID: AM-0002
Type: owner-authorized remediation (continuation of mcp-visible-workspace-isolation-v1)
Date: 2026-08-14

## Rationale (owner brief)

Detecting steal-focus after the fact is not preventing it. The core blocker of
AC-009 is the race between MapRequest, Muffin focus policy and the
non-activating move: the guardian currently moves the provider window only
after it already appeared, so a headed window may self-focus on the current
desktop before the move, disturbing the owner. `reconcile --check` only proves
the on-disk config, not the live runtime.

## Revisions

1. **Guardian contract (prevention-first).** The guardian continuously
   monitors `_NET_CURRENT_DESKTOP` and `_NET_ACTIVE_WINDOW` across the whole
   launch/startup race window (not only before/after snapshots), moves the
   provider window as early as possible once attributed, and classifies the
   outcome:
   - `prevented_and_verified` — no violation observed during the race window
     and all post-move proofs hold;
   - `detected_after_violation` — the provider (or an unattributable actor)
     changed the current desktop or stole the active window during the race
     window; the run exits non-zero and the session is NOT treated as
     focus-safe;
   - `blocked_before_launch` — headed placement safety could not be
     established before launching the provider (missing/ambiguous binding,
     capability gap); the provider is NOT launched;
   - `verification_failed` — launched but post-move proof failed (wrong
     workspace, iconic, other windows moved).
   Receipt placement enum extended accordingly; `placed` becomes
   `prevented_and_verified`.
2. **Live runtime reconciliation.** `reconcile-opencode-mcp.mjs --check`
   distinguishes:
   - config on disk IN_SYNC;
   - live process IN_SYNC (guardian-wrapped, pinned version, visible mode);
   - live process STALE/DRIFTED (`@latest` in argv, no guardian in process
     tree, version mismatch, or legacy window on a foreign workspace).
   STALE processes are reported with restart instructions, never killed.
3. **Live acceptance probe.** `automation/live-focus-probe.mjs` runs when the
   owner deliberately stays idle: captures before state, launches the provider
   through the guardian, monitors the entire race window, captures after
   state, and reports UNOBSERVABLE/NEEDS_USER if owner interaction makes the
   evidence untrustworthy. Pass only when every invariant holds with live
   evidence.
4. No global Cinnamon settings, no user config edits, no headless fallback,
   no hide/minimize/Xvfb, no process kills, no commit/push/deploy.

## New plan requirements

REQ-011 prevention-first race monitoring with outcome classification;
REQ-012 live runtime reconciliation (config vs live STALE distinction);
REQ-013 owner-run live acceptance probe (UNOBSERVABLE detection);
REQ-014 updated tests/fixtures for the new outcome semantics.
