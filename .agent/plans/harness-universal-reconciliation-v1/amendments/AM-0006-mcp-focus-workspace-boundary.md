# AM-0006 — MCP GUI focus/workspace boundary (visible, non-activating, source-workspace scoped)

Status: `OWNER_APPROVED_EFFECTIVE`

Applied to plan revision: `6`

## Owner correction

Playwright MCP, Chrome DevTools MCP, and Pencil MCP open real GUI windows on the
local desktop. On Cinnamon/X11 with `focus-new-windows='smart'`, those windows can
self-activate and drag the owner to another virtual desktop, or land on the
owner's current desktop instead of the OpenCode session's desktop. This breaks
multi-desktop workflows.

Required behavior, verbatim:

> "Visible on the originating OpenCode workspace, non-activating, isolated, and
> no automatic workspace switch."

Semantics that must never be conflated: `visible`, `headed`, `focused`, `active`,
`mapped`, `workspace-scoped`. "Foreground" remains a compatibility alias for
visible, never an implicit license to activate or switch.

## Classification

- Class: `implementation_defect` (harness MCP policy lacks a focus/workspace
  contract) + `installed_runtime_drift` (global OpenCode config uses `@latest`,
  lacks `--isolated`, and persists an ephemeral `/tmp/.mount_Pen.*` Pencil path).
- Raw finding (preserved verbatim): "MCP GUI launches (Playwright, Chrome
  DevTools, Pencil) can steal keyboard focus, switch the owner's virtual
  desktop, or open on the owner's current desktop instead of the OpenCode
  session's desktop, because the harness models only foreground/headless and
  has no source-window binding, target-workspace placement, or focus
  preservation contract."
- Impacted acceptance (selective reopen in candidate epoch 3):
  - `REQ-011 / AC-011` (foreground-visible browser/mobile/Pencil sessions) —
    affected: visible was implicitly interpreted as active/focused.
  - `REQ-012 / AC-012` (Pencil discovery, no persisted /tmp/.mount paths) —
    affected: installed global config persists an ephemeral mount path.
  - `REQ-013 / AC-013` (routing from facts) — affected: no fact source for
    source-workspace routing; focus policy is not derivable from prompt words.
  - `REQ-016 / AC-016` (dogfood) — affected: installed-host parity portion
    must include focus-safe MCP projection.
- Reviewed and NOT affected: `REQ-019 / AC-019` (closed-loop model remains
  schema-provable; this correction is not a sensor-model change).
- Historical PASS records and evidence files are preserved verbatim. Affected
  evidence is stale only for candidate epoch 3.

## Rules

1. Local interactive browser/Pencil: always headed/visible; `--headless` is
   CI-only or explicit owner authorization with its own receipt.
2. Browser always `--isolated` with the canonical pinned package version.
3. Target workspace = workspace of the OpenCode session that triggered the MCP
   call. Never the owner's current desktop, never a hardcoded index, never a
   window title as sole authority.
4. Never activate/switch: no `wmctrl -a/-R/-s`, no xdotool windowactivate, no
   synthetic keyboard. Placement uses non-activating move only.
5. Focus preservation is verified: owner's current desktop and active window
   must be unchanged before/after provider launch; verified by receipt.
6. Pencil stays explicit-only; generic UI/design words or plain OpenCode
   startup never activate it. The stable launcher reuses a live instance,
   never spawns a second one, detects cross-session singleton conflict
   (CONFLICT/NEEDS_USER), and never raises/focuses windows.
7. Ephemeral AppImage mount paths are resolved at runtime only and never
   persisted in installed config.
8. Ambiguous or missing source-workspace binding fails closed
   (`BLOCKED`/`NEEDS_USER`); no GUI is opened on a guessed workspace.
9. Cinnamon `focus-new-windows` remediation on the owner machine is local and
   reversible, with before/after receipt and rollback; it is never an
   installer default and never a substitute for adapter correctness.
10. Evidence stages: static config/source tests = `TEST_VERIFIED`; one
    controlled native focus run = at most `NATIVE_SMOKE_VERIFIED`; real
    OpenCode workflow with verified binding = `LIVE_CANDIDATE`/`LIVE_OBSERVED`
    per AM-0005; never `OPERATIONALLY_PROVEN` after one run.

## Acceptance

`AC-FOCUS-01..14` per the owner correction batch: correct source workspace,
no workspace switch, no focus stealing, visible local browser, browser
isolation, explicit CI headless, Pencil explicit-only, stable Pencil path,
focus-safe Pencil, multi-session safety, installed parity, reversible host
change, honest evidence stage, live observation (or honest
LIVE_UNPROVEN/BLOCKED).
