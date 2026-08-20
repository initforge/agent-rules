#!/usr/bin/env node
/**
 * session-binding.mjs — AM-0006 OpenCode session source-workspace binding.
 *
 * Interactive OpenCode sessions must carry a trustworthy source binding so
 * GUI MCP launches land on the session's own workspace. This helper resolves
 * the current terminal's window for the calling process tree:
 *
 *   - exactly one candidate window  -> prints export line (resolved)
 *   - several candidate windows     -> prints hashed candidate ids + NEEDS_USER
 *   - no DISPLAY / no X tools       -> prints BLOCKED
 *
 * Usage:
 *   node automation/session-binding.mjs                 # resolve current shell
 *   node automation/session-binding.mjs --window 0x…    # explicit binding check
 *   eval "$(node automation/session-binding.mjs --export)"  # export at session start
 *
 * Window titles are never printed; only hashed ids and workspace indexes.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 16);

export { hash as hashWindowId };

function exec(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 8000 });
  return { stdout: String(result.stdout ?? ''), status: result.status };
}

function snapshot() {
  const windows = [];
  const listing = exec('wmctrl', ['-l', '-p']);
  if (listing.status !== 0) return { windows, capability: false };
  for (const line of listing.stdout.split('\n')) {
    const match = /^\s*(0x[0-9a-fA-F]+)\s+(-?\d+)\s+(\d+)\s+\S+\s+(.*)$/.exec(line);
    if (!match) continue;
    windows.push({ id: match[1].toLowerCase(), workspace: Number(match[2]), pid: match[3], titleHash: hash(match[4]), title: match[4] });
  }
  return { windows, capability: true };
}

/** Walk the calling process ancestry to the owning OpenCode process CWD. */
function resolveProjectRootFromAncestry() {
  let pid = process.ppid;
  for (let depth = 0; depth < 10 && pid > 1; depth++) {
    try {
      const comm = exec('ps', ['-o', 'comm=', '-p', String(pid)]);
      if (comm.stdout.trim() === 'opencode') {
        const cwd = exec('readlink', ['/proc/' + String(pid) + '/cwd']);
        if (cwd.status === 0 && cwd.stdout.trim()) return cwd.stdout.trim();
      }
    } catch { /* exited */ }
    const stat = exec('ps', ['-o', 'ppid=', '-p', String(pid)]);
    const ppid = Number(stat.stdout.trim());
    if (!Number.isFinite(ppid) || ppid <= 0) break;
    pid = ppid;
  }
  return null;
}

/** Walk the calling process ancestry to the terminal server window owner. */
function terminalServerPid() {
  let pid = process.ppid;
  for (let depth = 0; depth < 12 && pid > 1; depth++) {
    const stat = exec('ps', ['-o', 'ppid=,comm=', '-p', String(pid)]);
    const parts = stat.stdout.trim().split(/\s+/, 2);
    const ppid = Number(parts[0]);
    const comm = parts[1] ?? '';
    if (/gnome-terminal-server|konsole|xfce4-terminal|alacritty|kitty/.test(comm)) return pid;
    if (!Number.isFinite(ppid) || ppid <= 0) break;
    pid = ppid;
  }
  return null;
}

export function resolveBinding({ window: explicit, env = process.env } = {}) {
  const { windows, capability } = snapshot();
  if (!capability) {
    return { status: 'blocked', reason: 'wmctrl unavailable; cannot resolve the source OpenCode window' };
  }
  if (explicit) {
    const id = explicit.toLowerCase().startsWith('0x') ? explicit.toLowerCase() : `0x${Number(explicit).toString(16)}`;
    const window = windows.find((entry) => entry.id === id);
    if (!window) return { status: 'blocked', reason: `source window ${hash(id)} not found on this display`, windowId: id };
    return { status: 'resolved', windowId: window.id, windowHash: hash(window.id), workspace: window.workspace };
  }
  const OC_PREFIX = 'OC |';
  const isOc = (entry) => typeof entry.title === 'string' && entry.title.startsWith(OC_PREFIX);
  // Group ONLY OpenCode session windows (child/browser/MCP/owner windows are
  // never source candidates), then narrow by project root (title contains the
  // basename of the owning OpenCode process CWD).
  let oc = windows.filter((entry) => isOc(entry) && entry.workspace >= 0);
  const serverPid = terminalServerPid();
  if (serverPid) oc = oc.filter((entry) => entry.pid === String(serverPid));
  let narrowedByProject = false;
  const projectRoot = resolveProjectRootFromAncestry();
  if (projectRoot && oc.length > 1) {
    const base = projectRoot.split('/').filter(Boolean).pop() ?? '';
    const matched = oc.filter((entry) => entry.title.includes(base));
    if (matched.length === 1) { oc = matched; narrowedByProject = true; }
  }
  const candidates = oc;
  if (candidates.length === 0) {
    return { status: 'needs-user', reason: 'no OpenCode session window resolvable; run with --window <id> or export the binding at session start' };
  }
  if (candidates.length > 1) {
    return {
      status: 'needs-user',
      reason: `multiple OpenCode session windows (${candidates.length})${narrowedByProject ? '' : '; project-root narrowing did not decide'}; pass --window <id> for the exact session window`,
      candidates: candidates.map((entry) => ({ windowHash: hash(entry.id), workspace: entry.workspace })),
    };
  }
  return { status: 'resolved', windowId: candidates[0].id, windowHash: hash(candidates[0].id), workspace: candidates[0].workspace };
}

export function main(argv = process.argv) {
  const explicit = argv.indexOf('--window') >= 0 ? argv[argv.indexOf('--window') + 1] : undefined;
  const result = resolveBinding({ window: explicit });
  if (argv.includes('--export')) {
    if (result.status === 'resolved') {
      console.log(`export AGENT_RULES_SOURCE_WINDOW_ID=${result.windowId}`);
      console.log(`export AGENT_RULES_TARGET_WORKSPACE=${result.workspace}`);
      process.exit(0);
    }
    console.error(`session-binding NEEDS_USER: ${result.reason}`);
    process.exit(2);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'resolved' ? 0 : result.status === 'blocked' ? 2 : 3);
}

if (process.argv[1] && import.meta.url === new URL(pathToFileURL(process.argv[1]).href).href) {
  main();
}
