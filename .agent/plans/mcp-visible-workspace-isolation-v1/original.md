# mcp-visible-workspace-isolation-v1 — owner-authorized phase plan (original intent)

This file preserves the raw owner directive verbatim in condensed form. The
owner brief (transmitted as "ONE-SHOT IMPLEMENTATION PROMPT — MCP VISIBLE
WORKSPACE ISOLATION — agent-rules", 2026-08-14) authorizes a new phase:

**Goal.** Audit, implement, verify and report MCP/browser/design workspace
isolation on Linux X11/Cinnamon. Every GUI provider must open real, headed,
visible windows on the exact virtual desktop of the project/session that
invoked it, without switching the owner's desktop, without stealing the
owner's active window, and without affecting any other desktop/window/project.

**Non-negotiable requirements (verbatim intent):**

1. Visible/headed is the default; providers must never be hidden, minimized,
   iconic or off-screen; never auto-close while the session lives.
2. Never switch the owner's current desktop or active window; never use
   headless/Xvfb/nested/background/remote displays to mask a visibility
   failure. Headless exists ONLY as explicit CI/owner mode, never as a silent
   fallback. If visible placement cannot preserve workspace/focus, the run is
   BLOCKED/NEEDS_USER.
3. "Do not disturb the owner" means no focus stealing and no desktop switching;
   it never means hiding the browser/design UI.
4. Host: Linux, X11 (not Wayland), Cinnamon/Muffin, 5 desktops (0..4). Live
   evidence must be re-checked, never hardcoded.
5. Providers in scope: Playwright MCP (browser.explore), Chrome DevTools MCP
   (browser.debug), Pencil/design MCP (explicit-only). Routing stays:
   browser.verify → Playwright CLI; browser.explore → Playwright MCP;
   browser.debug → Chrome DevTools MCP; Pencil explicit-only (never triggered
   by the words design/UI). Any other interactive GUI provider in the registry
   must receive the same workspace/focus contract.
6. Visibility contract: headed, visible, real window, no hidden/minimized/
   iconic/off-screen, per-project process/profile/session, never the personal
   Chrome profile; `--isolated` means profile/session isolation, NOT workspace
   isolation. Explicit project-scoped user-data-dir/storage-state supported;
   no silent login loss; no cross-project profile sharing. Pencil stays
   explicit-only, no auto-install/route, no /tmp/.mount_Pen.*; visible on the
   project desktop when invoked; if Pencil native requires foreground
   activation it is an explicit disruptive capability needing owner approval;
   never hide Pencil to dodge the problem.
7. Session → workspace binding: per-session AGENT_RULES_SOURCE_WINDOW_ID /
   AGENT_RULES_TARGET_WORKSPACE / AGENT_RULES_MCP_SESSION_ID injected by the
   session wrapper; global config never hardcodes bindings. Multiple
   candidates → never first-window, never current-desktop fallback, never
   shared-PID guess → NEEDS_USER/BLOCKED with --window guidance. Sessions
   still running old configs are stale runtime/config drift: never
   kill/restart silently, only flag that a restart is required.
8. Window placement/focus via real X11/EWMH/Cinnamon: strict attribution to
   the provider process tree; move ONLY the provider window; non-activating
   move; never activate provider; never change current desktop or active
   window; never move/resize/focus/close other project windows; never modify
   global Cinnamon/Muffin focus settings. Forbidden: wmctrl -a/-R/-s, xdotool
   windowactivate, synthetic workspace keys, temporary desktop switches,
   page.bringToFront/CDP activation without owner request. Never claim PASS on
   a wmctrl exit code alone. Post-move proof required: provider window id,
   provider workspace, target workspace, visible/non-iconic state, current
   workspace before/after, active window before/after. If the provider
   self-activates during launch and the workspace change cannot be prevented:
   BLOCKED/NEEDS_USER — never silently switch to headless/minimize/hide.
   Race condition: a headed window may self-focus on map before the guardian
   moves it; the guardian only guards placement AFTER launch — never assume it
   solves this race.
9. Code/config to audit and fix when needed: focus-workspace.ts,
   mcp-guardian.mjs, mcp-config.ts, focus-workspace.test.ts,
   session-binding.mjs, session-launch.mjs, reconcile-opencode-mcp.mjs,
   integrations/registry.json, playwright-mcp/**, chrome-devtools-mcp/**,
   manual/pencil-mcp/**, skills/browser-qa/**, skills/verification-router/**,
   related validators/schemas/fixtures. Canonical adapters: pinned versions,
   never @latest, visible/headed default local mode, --isolated retained, no
   --headless in default visible mode; headless only explicit, never a
   fallback, tests never use it to fake a visible pass.
10. Tests/evals required: missing binding → NEEDS_USER/BLOCKED; multiple
    candidates → no guessing; current desktop never used as target; unattributed
    provider → fail closed; provider workspace ≠ target → never placed; current
    workspace changed → fail; active window changed → fail; provider
    hidden/iconic → fail; all activating commands forbidden; two projects never
    share profile/process/session out of scope; Pencil explicit-only; no
    persisted /tmp/.mount_Pen.*. Live acceptance on X11/Cinnamon when host
    capability allows (two-project scenario with before/after measurements);
    otherwise BLOCKED/NEEDS_USER with exact missing capability and manual
    commands for the owner.
11. Docs must distinguish: visible/headed; isolated (profile); workspace
    binding; guardian (placement/focus guard, not magic); headless explicit
    only. Each GUI MCP launch emits a receipt with session binding, window
    hashes, target/actual workspace, visible/non-iconic proof,
    other-windows-unchanged proof, current/active before-after, placement
    result, rollback path, blocked reason.
12. Verification: npm run build; npm run test:fast; node
    automation/validate-focus-workspace.mjs; node
    automation/reconcile-opencode-mcp.mjs --check; npm run verify:all. No
    weakened verification, no deleted tests, no legacy deletion, no receipt
    edits to make a run green; distinguish patch failure, pre-existing failure
    and host limitation.
13. Final report: plan/pointer/ledger/CAS; files changed and not changed;
    before/after behavior matrix; visibility mode; binding method; how headed
    providers are placed without stealing focus; live evidence before/after;
    tests/validators run; stale runtime/config drift; remaining blockers;
    rollback path; confirmation of no kill, no global user config edits, no
    global installs, no commit/push/deploy. COMPLETE only when the invariant is
    proven: "Browser/design MCP of Project A opens visible on Project A's
    virtual desktop, does not move the owner there, does not change the active
    window, and does not affect any other project/workspace/window."
