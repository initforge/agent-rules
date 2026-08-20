#!/usr/bin/env node
/**
 * mcp-guardian.mjs — focus-safe MCP server guardian (AM-0006 + AM-0002 + AM-0003).
 *
 * OpenCode (or the runner) spawns interactive GUI MCP servers (Playwright,
 * Chrome DevTools, Pencil) through this guardian. The guardian:
 *
 *   1. Reads the session binding from the environment:
 *        AGENT_RULES_SOURCE_WINDOW_ID   explicit source OpenCode window
 *        AGENT_RULES_TARGET_WORKSPACE   explicit owner-provided workspace
 *        AGENT_RULES_MCP_FOCUS_POLICY   preserve | allow-activate
 *        AGENT_RULES_MCP_VISIBILITY     visible | headless
 *        AGENT_RULES_MCP_SESSION_ID     opencode session id when known
 *   2. Snapshots current desktop + active window.
 *   3. Resolves the target workspace (explicit binding or fail closed —
 *      BLOCKED_BEFORE_LAUNCH; the provider is NOT launched).
 *   4. Launches the real server command (argv passthrough) with stdio bridged.
 *   5. EARLY EWMH MOVE (AM-0004): monitors at 50ms during the launch race
 *      window. The instant a new window is strictly attributed to the
 *      provider process tree (exact pid, then /proc descendants; never
 *      "first new window"), the _NET_WM_DESKTOP client message (wmctrl -t,
 *      EWMH-compliant) is issued with a NON-activating move. Direct
 *      property writes are NOT used or claimed (WM-managed property may be
 *      ignored); acceptance always comes from readback.
 *   6. LIFECYCLE MONITORING (AM-0003): monitoring NEVER stops after
 *      placement. For the whole server lifetime the guardian checks
 *      isLifecycleFocusViolation: if the provider window becomes the active
 *      window while the current workspace is not the provider's workspace
 *      (impossible for the owner to do by clicking), the session is no longer
 *      focus-safe: the server process tree is terminated, the receipt is
 *      `detected_after_violation` and the guardian exits NON-ZERO.
 *   7. RE-SNAPSHOTS after the move and verifies providerWorkspace ===
 *      targetWorkspace, visible/non-iconic (WM_STATE), no other window moved,
 *      and owner desktop/active unchanged. Only then is the outcome
 *      `prevented_and_verified`.
 *   8. Emits a privacy-safe focus receipt (window ids hashed, no titles).
 *
 * Forbidden: wmctrl -a/-R/-s, xdotool windowactivate, synthetic keys,
 * minimize/hide, temporary desktop switches, headless fallback.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  snapshotDesktop,
  resolveTargetWorkspace,
  findNewWindow,
  placeAndVerify,
  emitFocusReceipt,
  isLifecycleFocusViolation,
  terminateProcessTree,
  syncExec,
} from './focus-workspace.js';

const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);
const RECEIPT_DIR = process.env.AGENT_RULES_MCP_RECEIPT_DIR || null;

function writeReceipt(partial) {
  if (!RECEIPT_DIR) return;
  const file = path.join(RECEIPT_DIR, `mcp-focus-${Date.now()}.json`);
  emitFocusReceipt(partial, file);
}

function fail(reason, placement = 'blocked_before_launch', exitCode = 2) {
  console.error(`MCP guardian BLOCKED/NEEDS_USER: ${reason}`);
  writeReceipt({
    schema: 'agent-rules/mcp-focus-receipt',
    version: 1,
    session_id: process.env.AGENT_RULES_MCP_SESSION_ID,
    targetWorkspace: null,
    before: null,
    after: null,
    placement,
    visibility: process.env.AGENT_RULES_MCP_VISIBILITY || 'visible',
    focusPolicy: process.env.AGENT_RULES_MCP_FOCUS_POLICY || 'preserve',
    isolated: true,
    capability: null,
    errors: [reason],
    created_at: new Date().toISOString(),
  });
  process.exit(exitCode);
}

/** Lightweight desktop+active read for the race monitor (xprop only). */
/**
 * Walk the calling process ancestry to the owning OpenCode process and read
 * its CWD as the project root (identity step 2). Best-effort: null when the
 * ancestry is not resolvable.
 */
function resolveProjectRootFromAncestry() {
  let pid = process.ppid;
  for (let depth = 0; depth < 10 && pid > 1; depth++) {
    let comm = null;
    try { comm = fs.readFileSync('/proc/' + pid + '/comm', 'utf8').trim(); } catch { /* exited */ }
    if (comm === 'opencode') {
      try { return fs.readlinkSync('/proc/' + pid + '/cwd'); } catch { return null; }
    }
    try {
      const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
      const end = stat.lastIndexOf(')');
      const parts = stat.slice(end + 2).split(' ');
      pid = Number(parts[0]);
    } catch { return null; }
  }
  return null;
}

function readFocusState(exec) {
  let currentWorkspace = null;
  let activeWindowId = null;
  try {
    const current = exec('xprop', ['-root', '_NET_CURRENT_DESKTOP']);
    const match = /_NET_CURRENT_DESKTOP\(CARDINAL\)\s*=\s*(\d+)/.exec(current.stdout);
    if (match) currentWorkspace = Number(match[1]);
  } catch { /* capability gap */ }
  try {
    const active = exec('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
    const match = /_NET_ACTIVE_WINDOW\(WINDOW\):\s*window id #\s*(0x[0-9a-fA-F]+)/.exec(active.stdout);
    if (match) activeWindowId = match[1].toLowerCase();
  } catch { /* capability gap */ }
  return { currentWorkspace, activeWindowId };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) fail('guardian requires the real MCP server command as argv');

  const visibility = process.env.AGENT_RULES_MCP_VISIBILITY || 'visible';
  if (visibility === 'headless') {
    const server = spawn(args[0], args.slice(1), { stdio: 'inherit', env: process.env });
    server.on('error', (error) => { console.error(`MCP guardian: server failed: ${error.message}`); process.exit(1); });
    server.on('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exit(code ?? 0); });
    return;
  }
  const focusPolicy = process.env.AGENT_RULES_MCP_FOCUS_POLICY || 'preserve';
  if (focusPolicy !== 'preserve' && focusPolicy !== 'allow-activate') {
    fail(`invalid AGENT_RULES_MCP_FOCUS_POLICY=${focusPolicy}; expected preserve or allow-activate`);
  }
  if (process.platform !== 'linux') {
    fail(`focus-safe GUI placement not implemented on ${process.platform}; explicit owner binding or CI headless required`);
  }
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    fail('no DISPLAY/WAYLAND_DISPLAY: a visible interactive MCP requires a desktop session');
  }

  const explicitWorkspace = process.env.AGENT_RULES_TARGET_WORKSPACE !== undefined
    ? Number(process.env.AGENT_RULES_TARGET_WORKSPACE)
    : undefined;
  if (explicitWorkspace !== undefined && (!Number.isInteger(explicitWorkspace) || explicitWorkspace < 0)) {
    fail(`invalid AGENT_RULES_TARGET_WORKSPACE=${process.env.AGENT_RULES_TARGET_WORKSPACE}`);
  }

  const before = snapshotDesktop(syncExec);
  const projectRoot = resolveProjectRootFromAncestry();
  const resolution = resolveTargetWorkspace({
    sessionId: process.env.AGENT_RULES_MCP_SESSION_ID,
    sourceWindowId: process.env.AGENT_RULES_SOURCE_WINDOW_ID,
    explicitWorkspace,
    projectRoot: projectRoot ?? undefined,
  }, before);
  if (resolution.status !== 'resolved') {
    // BLOCKED_BEFORE_LAUNCH: headed placement safety was not established, so
    // the provider is never launched.
    fail(`cannot place GUI without a trustworthy source binding: ${resolution.reason}`, 'blocked_before_launch', 2);
  }

  const server = spawn(args[0], args.slice(1), { stdio: 'inherit', env: process.env });
  server.on('error', (error) => {
    console.error(`MCP guardian: server failed: ${error.message}`);
    fail(`MCP server failed to start: ${error.message}`, 'blocked_before_launch', 1);
  });

  const providerPid = server.pid ? Number(server.pid) : undefined;
  const targetWorkspace = resolution.workspace;
  const sessionId = process.env.AGENT_RULES_MCP_SESSION_ID;

  let verified = false;
  let providerWindowId = null;
  let lastSnapshot = before;
  let placementReceipt = null;

  const terminateProvider = () => {
    // AM-0004: kill only the provider process tree (leaves first via /proc),
    // never the caller's process group (the guardian shares it with the
    // spawning shell/OpenCode).
    if (providerPid) terminateProcessTree(providerPid);
    try { server.kill('SIGTERM'); } catch { /* already gone */ }
  };

  const monitorTick = () => {
    const now = snapshotDesktop(syncExec);
    // --- Lifecycle monitoring (AM-0003): never stops after placement. ---
    if (verified && providerWindowId && placementReceipt) {
      const focus = readFocusState(syncExec);
      if (isLifecycleFocusViolation({
        currentWorkspace: focus.currentWorkspace,
        providerWorkspace: placementReceipt.providerWorkspace ?? null,
        activeWindowId: focus.activeWindowId,
        providerWindowId,
      })) {
        placementReceipt.placement = 'detected_after_violation';
        placementReceipt.errors.push(`lifecycle violation: provider window ${hash(providerWindowId)} stole focus while the current workspace (${focus.currentWorkspace}) is not the provider workspace`);
        console.error(`[mcp-guardian] lifecycle detected_after_violation: ${placementReceipt.errors.join('; ')}`);
        if (RECEIPT_DIR) writeReceipt(placementReceipt);
        terminateProvider();
        console.error(`MCP guardian: session is NOT focus-safe; provider terminated; exiting non-zero`);
        process.exit(3);
      }
      lastSnapshot = now;
      return;
    }
    // --- Race window (pre-placement): prevention at 50ms ticks. ---
    if (verified) return;
    const newWindows = now.windows.filter((entry) => !lastSnapshot.windows.some((old) => old.windowId === entry.windowId));
    if (newWindows.length > 0) {
      const match = findNewWindow(lastSnapshot, now, providerPid);
      if (match.status === 'found' && match.window) {
        const focusBefore = readFocusState(syncExec);
        // EARLY EWMH move: the _NET_WM_DESKTOP client message (wmctrl -t,
        // inside placeAndVerify) is issued the instant the window is
        // attributed, before the WM focus policy can act on the current
        // desktop. Acceptance is readback-based, never exit-code-based.
        const result = placeAndVerify({
          sessionId,
          sourceWindowId: process.env.AGENT_RULES_SOURCE_WINDOW_ID,
          explicitWorkspace,
          projectRoot: projectRoot ?? undefined,
          exec: syncExec,
        }, before, now, providerPid, true);
        const afterMove = readFocusState(syncExec);
        const raceViolations = [];
        if (focusBefore.currentWorkspace !== null && focusBefore.currentWorkspace !== before.currentWorkspace) {
          raceViolations.push({ kind: 'current-desktop-changed', detail: `desktop moved to ${focusBefore.currentWorkspace} during provider window map`, atMs: Date.now() });
        }
        if (afterMove.activeWindowId === match.window.windowId) {
          raceViolations.push({ kind: 'active-window-stolen', detail: `provider window ${hash(match.window.windowId)} became the active window`, atMs: Date.now() });
        } else if (afterMove.activeWindowId && afterMove.activeWindowId !== before.activeWindowId) {
          raceViolations.push({ kind: 'owner-interaction-suspected', detail: `active window changed to ${hash(afterMove.activeWindowId)} during the race window`, atMs: Date.now() });
        }
        const receipt = result.receipt;
        receipt.visibility = visibility;
        receipt.focusPolicy = focusPolicy;
        if (raceViolations.length > 0) {
          receipt.placement = raceViolations.some((entry) => entry.kind === 'owner-interaction-suspected') ? 'unobservable' : 'detected_after_violation';
          for (const violation of raceViolations) receipt.errors.push(`race-window violation (${violation.kind}): ${violation.detail}`);
          console.error(`[mcp-guardian] ${receipt.placement}: ${receipt.errors.join('; ')}`);
          if (RECEIPT_DIR) writeReceipt(receipt);
          terminateProvider();
          console.error(`MCP guardian: session is NOT focus-safe; provider terminated; exiting non-zero`);
          process.exit(3);
        }
        verified = true;
        providerWindowId = match.window.windowId;
        placementReceipt = receipt;
        if (RECEIPT_DIR) writeReceipt(receipt);
        else console.error(`[mcp-guardian] placement=${receipt.placement} targetWorkspace=${receipt.targetWorkspace} providerWorkspace=${receipt.providerWorkspace} errors=${receipt.errors.join('; ') || 'none'}`);
        return;
      }
    }
    lastSnapshot = now;
  };

  // 50ms during the race window (prevention), 250ms after placement
  // (lifecycle safety-net). Monitoring NEVER stops while the server lives.
  let intervalMs = 50;
  let timer = null;
  const loop = () => {
    if (verified) intervalMs = 250;
    monitorTick();
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(loop, intervalMs);
  };
  loop();
  server.on('exit', (code, signal) => {
    if (timer !== null) clearTimeout(timer);
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

main();
