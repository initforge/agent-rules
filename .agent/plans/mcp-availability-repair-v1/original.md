# mcp-availability-repair-v1 — owner-authorized phase plan (original intent)

Owner brief (2026-08-15, "OWNER EXECUTE AUTHORIZATION — FIX MCP AVAILABILITY
WITHOUT BYPASSING SAFETY") condensed:

Goal: fix OpenCode being unable to register Playwright MCP / Chrome DevTools
MCP because mcp-guardian reports "cannot place GUI without a trustworthy
source binding: multiple OpenCode candidate windows (9)". MCP must work
normally while keeping: visible/headed; correct project/session virtual
desktop; no focus stealing; no other-window moves; no hide/minimize/Xvfb/
headless fallback; no mcp-guardian bypass; no impact on other OpenCode/
projects/desktops.

Scope (only): (1) repair OpenCode MCP session-binding and candidate
resolution; (2) make Playwright MCP + Chrome DevTools MCP appear again in the
current session; (3) keep the guardian mandatory; (4) do NOT implement a
DeepSeek Harness adapter in this phase — record the compatibility boundary
and a follow-up task.

Forbidden: no project-level opencode.json running @playwright/mcp or
chrome-devtools-mcp directly (bypassing the guardian); revert any such direct
override created by this attempt after diff check; never delete/disable
mcp-guardian; never relax the candidate resolver by picking the first
candidate; never count every child/browser/MCP window as an OpenCode source
window; never @latest; never kill/restart processes the owner is using;
never touch global Cinnamon or switch desktops temporarily; never claim PASS
on unit tests or config-valid alone; never claim DSH integration.

Root cause to fix: the guardian sees 9 candidates because the resolver
matches too broadly or does not group correctly (OpenCode host window, child
processes, MCP window, browser window, several windows of the same
process/session). Fix the resolver with strong identity in this order:
1. exact OpenCode session/process identity;
2. process ancestry and project root/CWD;
3. stable session ID passed by the launcher;
4. window PID/WM_CLASS/title only to confirm, never alone;
5. group windows belonging to one OpenCode session; never treat each child
   window as a separate candidate.

New sessions: the session launcher must pass a stable binding (project root,
session ID, source process/window identity, target workspace); MCP config
still runs through mcp-guardian; no manual window choice when the host can
resolve uniquely.

Current session: resolve the correct OpenCode process by project root/CWD and
process ancestry; identify the real source window, excluding browser/MCP
child windows; create a session binding receipt; relaunch MCP through the
guardian; perform a real MCP initialize/tools-list; never treat config
existence as evidence MCP works.

If several real source sessions remain indistinguishable: return NEEDS_USER
with candidates grouped per session and exactly one concrete bind command;
never bypass the guardian; never pick randomly. But before concluding
NEEDS_USER, fix candidate grouping and attempt process/session/project
identity resolution.

Workspace safety unchanged: visible/headed default; provider window
non-iconic; provider workspace == target; owner current desktop and active
window before/after unchanged; all other windows unchanged; EWMH move
rejected or race focus -> fail closed, terminate only the provider tree this
session spawned, never owner processes.

Config contract: canonical source remains integrations/registry.json and the
existing host adapter; generated project config must reference the guardian
wrapper; no provider command hardcoded outside the registry; pin exact
versions; no secrets in the repo; do not touch DSH config in this phase.

Verification: npm run build; npm run test:fast; relevant validators; runtime
config validation; reconcile OpenCode MCP runtime; live MCP handshake
(initialize -> initialized -> tools/list) with Playwright and Chrome DevTools
tools visible in a real session.

Live acceptance: proof on the current project without occupying other
desktops. Receipt: source session identity, source window ID, project root,
current desktop before/after, active window before/after, target workspace,
provider window ID, provider workspace, provider non-iconic, other windows
unchanged, guardian_wrapped=true, MCP handshake/tools-list success.

Final report: files changed; whether direct bypass was removed; why 9
candidates were miscounted; whether MCP tools reappeared; whether providers
run through the guardian; live receipt and test results; what is truly
BLOCKED; DeepSeek Harness NOT adapted in this phase.
