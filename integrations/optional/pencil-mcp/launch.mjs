#!/usr/bin/env node
// Stable Pencil MCP launcher for the agent-rules harness.
//
// OpenCode (and every supported host) MUST spawn this file, never a persisted
// AppImage mount path such as /tmp/.mount_Pen.*. AppImage mounts are ephemeral
// and change on every app restart; persisting them produces ENOENT the moment
// the app is relaunched.
//
// Responsibilities (AM-0006 focus/workspace boundary):
//   1. Resolve the live Pencil desktop process and derive the mounted
//      mcp-server-linux-x64 binary from /proc/<pid>/exe. No mount path is ever
//      persisted or hard-coded.
//   2. NEVER auto-launch the AppImage unless PENCIL_MCP_ALLOW_LAUNCH=1. A
//      plain OpenCode startup must not make Pencil appear (explicit-only).
//   3. When launching (explicitly allowed) or connecting, the window stays
//      visible, is never raised/focused, and is placed on the originating
//      session's workspace (AGENT_RULES_TARGET_WORKSPACE) with a NON-activating
//      move only (wmctrl -i -r <win> -t <ws>; never -a/-R/-s, never xdotool).
//   4. Singleton conflict detection: if a live Pencil instance is bound to a
//      different OpenCode session (instance lock), return CONFLICT/NEEDS_USER
//      with the owning session/workspace instead of racing between desktops.
//   5. Preserve the configured args/env verbatim by passing argv through to
//      the mounted server binary.
//   6. Fail closed with BLOCKED/NEEDS_USER diagnostics when Pencil cannot be
//      made available. Never substitute the pen CLI for the desktop MCP.
//   7. Offer a diagnostic dry-run (PENCIL_MCP_LAUNCH_DRY_RUN=1) used by the
//      installer and verification scripts.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PENCIL_INSTALL_URL = 'https://docs.pencil.dev/getting-started/ai-integration';
export const PENCIL_INSTANCE_LOCK = path.join(os.homedir(), '.pencil', 'agent-rules-instance.json');

export function hashWindowId(id) {
  return createHash('sha256').update(String(id)).digest('hex').slice(0, 16);
}

/** Non-activating workspace move; never activates and never switches desktops. */
export function moveWindowToWorkspace(windowId, workspace) {
  const result = spawnSync('wmctrl', ['-i', '-r', windowId, '-t', String(workspace)], { encoding: 'utf8', timeout: 8000 });
  return result.status === 0;
}

export function readInstanceLock() {
  try {
    return JSON.parse(fs.readFileSync(PENCIL_INSTANCE_LOCK, 'utf8'));
  } catch {
    return null;
  }
}

export function writeInstanceLock(binding) {
  try {
    fs.mkdirSync(path.dirname(PENCIL_INSTANCE_LOCK), { recursive: true });
    const tmp = `${PENCIL_INSTANCE_LOCK}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(binding, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, PENCIL_INSTANCE_LOCK);
  } catch {
    /* advisory lock; never fail the serve path on lock IO */
  }
}

export function clearInstanceLock() {
  try {
    fs.unlinkSync(PENCIL_INSTANCE_LOCK);
  } catch {
    /* ignore */
  }
}

/** Singleton conflict check: a live instance locked to another session. */
export function instanceConflict(sessionId) {
  const lock = readInstanceLock();
  if (!lock || !lock.session_id) return null;
  if (sessionId && lock.session_id === sessionId) return null;
  return lock;
}

/**
 * Focus-safe placement of a freshly appeared provider window. Reads
 * AGENT_RULES_TARGET_WORKSPACE; when set, moves the window there without
 * activating. Never calls wmctrl -a/-R/-s or xdotool.
 */
export function placeWindowOnSessionWorkspace(windowId, workspace) {
  const target = workspace !== undefined ? Number(workspace) : undefined;
  if (target === undefined || !Number.isInteger(target) || target < 0) {
    return { status: 'needs-user', reason: 'no trustworthy AGENT_RULES_TARGET_WORKSPACE binding; refusing to guess a desktop' };
  }
  const ok = moveWindowToWorkspace(windowId, target);
  return ok
    ? { status: 'placed', workspace: target }
    : { status: 'blocked', reason: `workspace move failed for ${hashWindowId(windowId)}` };
}

export function withoutJsonComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export function envRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string'));
}

export function parseJsonServer(file) {
  try {
    const parsed = JSON.parse(withoutJsonComments(fs.readFileSync(file, 'utf8')));
    const entry = parsed?.mcpServers?.pencil ?? parsed?.mcp?.pencil;
    const command = Array.isArray(entry?.command) ? entry.command[0] : entry?.command;
    if (typeof command !== 'string' || !command) return null;
    return {
      command,
      args: Array.isArray(entry.command) ? strings(entry.command.slice(1)) : strings(entry.args),
      env: envRecord(entry.env ?? entry.environment),
      source: file,
    };
  } catch {
    return null;
  }
}

export function quotedValues(value) {
  const result = [];
  const pattern = /'([^']*)'|"((?:\\.|[^"\\])*)"/g;
  for (const match of value.matchAll(pattern)) result.push(match[1] ?? (match[2] ?? '').replace(/\\"/g, '"'));
  return result;
}

export function parseTomlServer(file) {
  try {
    const source = fs.readFileSync(file, 'utf8');
    const section = (name) => {
      const header = new RegExp(`^\\[${name.replace(/[.]/g, '\\.')}\\]\\s*$`, 'm').exec(source);
      if (!header || header.index === undefined) return '';
      const rest = source.slice(header.index + header[0].length);
      const next = rest.search(/^\[/m);
      return (next < 0 ? rest : rest.slice(0, next)).trim();
    };
    const main = section('mcp_servers.pencil');
    const command = /^command\s*=\s*['"]([^'"]+)['"]\s*$/m.exec(main)?.[1];
    if (!command) return null;
    const argsSource = /^args\s*=\s*\[([^\]]*)\]\s*$/m.exec(main)?.[1] ?? '';
    const env = {};
    for (const match of section('mcp_servers.pencil.env').matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*['"]([^'"]*)['"]\s*$/gm)) env[match[1]] = match[2];
    return { command, args: quotedValues(argsSource), env, source: file };
  } catch {
    return null;
  }
}

export function hostFromAgent(agent) {
  const normalized = String(agent ?? '').toLowerCase();
  if (normalized.includes('claude')) return 'claude';
  if (normalized.includes('codex')) return 'codex';
  if (normalized.includes('open')) return 'opencode';
  if (normalized.includes('antigravity') || normalized.includes('gemini')) return 'antigravity';
  if (normalized.includes('cursor')) return 'cursor';
  if (normalized.includes('grok')) return 'grok';
  if (normalized.includes('deepseek') || normalized.includes('dsh')) return 'deepseek-harness';
  if (normalized.includes('command') || normalized.includes('cmdc')) return 'command-code';
  return normalized;
}

export function configCandidates(host) {
  const home = os.homedir();
  const candidates = [];
  const add = (file) => { if (file && !candidates.includes(file)) candidates.push(file); };
  add(process.env.PENCIL_MCP_NATIVE_CONFIG);
  switch (host) {
    case 'codex':
      add(process.env.PENCIL_MCP_CODEX_CONFIG);
      add(process.env.CODEX_HOME && path.join(process.env.CODEX_HOME, 'config.toml'));
      add(path.join(home, '.codex', 'config.toml'));
      break;
    case 'claude':
      add(process.env.PENCIL_MCP_CLAUDE_CONFIG);
      add(process.env.CLAUDE_CONFIG_DIR && path.join(process.env.CLAUDE_CONFIG_DIR, 'mcp.json'));
      add(path.join(home, '.claude.json'));
      break;
    case 'grok':
      add(process.env.PENCIL_MCP_GROK_CONFIG);
      add(process.env.GROK_HOME && path.join(process.env.GROK_HOME, 'mcp.json'));
      add(path.join(home, '.grok', 'mcp.json'));
      break;
    case 'antigravity':
      add(process.env.PENCIL_MCP_ANTIGRAVITY_CONFIG);
      add(process.env.ANTIGRAVITY_HOME && path.join(process.env.ANTIGRAVITY_HOME, 'mcp_config.json'));
      add(path.join(home, '.gemini', 'antigravity', 'mcp_config.json'));
      add(path.join(home, '.gemini', 'config', 'mcp_config.json'));
      add(path.join(home, '.gemini', 'settings.json'));
      break;
    case 'cursor':
      add(process.env.PENCIL_MCP_CURSOR_CONFIG);
      add(process.env.CURSOR_HOME && path.join(process.env.CURSOR_HOME, 'mcp.json'));
      add(path.join(home, '.cursor', 'mcp.json'));
      break;
    case 'opencode':
      add(process.env.PENCIL_MCP_OPENCODE_CONFIG);
      add(process.env.OPENCODE_CONFIG);
      add(process.env.OPENCODE_HOME && path.join(process.env.OPENCODE_HOME, 'opencode.json'));
      add(path.join(home, '.config', 'opencode', 'opencode.json'));
      break;
    default:
      break;
  }
  return candidates;
}

export function configuredEntry(host) {
  const launcher = process.argv[1] ? fs.realpathSync(process.argv[1]) : null;
  if (!launcher) return null;
  for (const config of configCandidates(host)) {
    if (!fs.existsSync(config)) continue;
    const candidate = config.endsWith('.toml') ? parseTomlServer(config) : parseJsonServer(config);
    if (!candidate) continue;
    // Never follow an entry that points back at this launcher (recursion guard).
    if (path.resolve(candidate.command) === launcher) continue;
    if (Array.isArray(candidate.args) && candidate.args.some((arg) => path.resolve(arg) === launcher)) continue;
    return candidate;
  }
  return null;
}

const MOUNT_MARKER = '.mount_Pen.';
const SERVER_RELATIVE = path.join('resources', 'app.asar.unpacked', 'out', 'mcp-server-linux-x64');
const DESKTOP_SOCKET = path.join(os.homedir(), '.pencil', 'socket', 'pencil-desktop.sock');

export function appImageCandidates() {
  const home = os.homedir();
  // PENCIL_APPIMAGE takes precedence: when set it is authoritative, so a wrong
  // value is reported instead of silently falling back to the default paths.
  if (process.env.PENCIL_APPIMAGE) return [process.env.PENCIL_APPIMAGE];
  return [path.join(home, 'Applications', 'Pen.AppImage'), path.join(home, 'Applications', 'Pencil.AppImage')];
}

/**
 * Derive live AppImage mounts from running processes. Mounts are read from
 * /proc/<pid>/exe of live processes only; stale directories left by killed
 * instances are ignored because their process is gone.
 */
export function liveMounts() {
  const listing = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).stdout ?? '';
  const mounts = new Set();
  for (const line of listing.split('\n')) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!match) continue;
    if (!match[2].includes('Pen.AppImage') && !match[2].includes(MOUNT_MARKER)) continue;
    let exe = null;
    try {
      exe = fs.realpathSync(`/proc/${match[1]}/exe`);
    } catch {
      continue;
    }
    const idx = exe.indexOf(MOUNT_MARKER);
    if (idx < 0) continue;
    const mount = exe.slice(0, idx + MOUNT_MARKER.length + 8);
    if (fs.existsSync(mount)) mounts.add(mount);
  }
  return [...mounts];
}

export function serverInMount(mount) {
  const candidate = path.join(mount, SERVER_RELATIVE);
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

export function windowVisible() {
  try {
    const out = spawnSync('wmctrl', ['-l'], { encoding: 'utf8', timeout: 5000 }).stdout ?? '';
    if (!out) return null;
    return /New File|\.pen|Pencil|Pen\.AppImage/i.test(out);
  } catch {
    return null;
  }
}

export function desktopSocketReady() {
  return fs.existsSync(DESKTOP_SOCKET);
}

/**
 * The app's transport socket file must exist for the MCP server to connect.
 * The Pencil app unlinks it whenever another app instance starts and quits,
 * leaving the app running but unreachable: that state is reported as a
 * BLOCKED/NEEDS_USER condition (restart the Pencil app) instead of hanging.
 */
export function socketDiagnostic() {
  if (!desktopSocketReady()) {
    return {
      status: 'blocked',
      reason: `Pencil app is running but its MCP transport socket ${DESKTOP_SOCKET} is missing. The app removes this socket when a second instance starts and quits. Quit and relaunch the Pencil app, then retry.`,
    };
  }
  return { status: 'ok' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveServer(startupTimeoutMs) {
  const deadline = Date.now() + startupTimeoutMs;
  const resolve = () => {
    for (const mount of liveMounts()) {
      const server = serverInMount(mount);
      if (server) return { status: 'ok', mount, server, launched: false, reason: 'live mount' };
    }
    return null;
  };
  const running = resolve();
  if (running) {
    // App was already running: the transport socket must already exist, since
    // the app only creates it during its own startup. Missing socket here is a
    // broken-transport state that needs a restart, not something we can wait out.
    const socket = socketDiagnostic();
    if (socket.status !== 'ok') return { status: 'blocked', reason: socket.reason };
    return running;
  }
  if (!process.env.DISPLAY && process.platform === 'linux') {
    return { status: 'blocked', reason: `no DISPLAY: a foreground-visible Pencil desktop is required; set DISPLAY or start Pencil manually (${PENCIL_INSTALL_URL})` };
  }
  // AM-0006: explicit-only launch gate. A plain OpenCode startup (MCP server
  // started because the server is enabled) must never make Pencil appear.
  // Launch additionally requires a trustworthy workspace binding so the new
  // window can be placed on the originating session's desktop, never guessed.
  if (process.env.PENCIL_MCP_ALLOW_LAUNCH !== '1') {
    return {
      status: 'blocked',
      reason: 'Pencil desktop is not running and auto-launch is not authorized. Pencil is explicit-only (AM-0006): start the Pencil app yourself or set PENCIL_MCP_ALLOW_LAUNCH=1 only for an explicit Pencil request with a trustworthy workspace binding.',
    };
  }
  const targetWorkspace = process.env.AGENT_RULES_TARGET_WORKSPACE !== undefined ? Number(process.env.AGENT_RULES_TARGET_WORKSPACE) : undefined;
  if (targetWorkspace === undefined || !Number.isInteger(targetWorkspace) || targetWorkspace < 0) {
    return {
      status: 'blocked',
      reason: 'Pencil launch requires a trustworthy AGENT_RULES_TARGET_WORKSPACE binding (AM-0006); refusing to open the window on a guessed desktop.',
    };
  }
  const appImage = appImageCandidates().find((candidate) => fs.existsSync(candidate));
  if (!appImage) {
    return { status: 'blocked', reason: `Pencil desktop not installed; expected ${appImageCandidates().join(' or ')}. Install from ${PENCIL_INSTALL_URL} or set PENCIL_APPIMAGE.` };
  }
  const child = spawn(appImage, [], { detached: true, stdio: 'ignore' });
  child.unref();
  // AM-0006: place the freshly launched app window on the session workspace
  // with a NON-activating move; never raise/focus, never switch desktops.
  const appPid = String(child.pid ?? '');
  let placed = false;
  const placeDeadline = Date.now() + 15000;
  const placePoll = () => {
    const listing = spawnSync('wmctrl', ['-l', '-p'], { encoding: 'utf8', timeout: 8000 }).stdout ?? '';
    for (const line of listing.split('\n')) {
      const match = /^\s*(0x[0-9a-fA-F]+)\s+(-?\d+)\s+(\d+)\s+\S+\s+/.exec(line);
      if (!match || match[3] !== appPid) continue;
      const ok = moveWindowToWorkspace(match[1].toLowerCase(), targetWorkspace);
      placed = true;
      return ok
        ? console.error(`[pencil-launch] placed window ${hashWindowId(match[1])} on workspace ${targetWorkspace} (non-activating)`)
        : console.error(`[pencil-launch] workspace move failed for ${hashWindowId(match[1])}`);
    }
    if (!placed && Date.now() < placeDeadline) setTimeout(placePoll, 250);
  };
  placePoll();
  // After launching we wait for BOTH the mounted server binary AND the app's
  // transport socket; the mount appears before the socket during startup.
  let sawMount = false;
  while (Date.now() < deadline) {
    const found = resolve();
    if (found && desktopSocketReady()) {
      return { ...found, launched: true, reason: 'launched AppImage' };
    }
    if (found) sawMount = true;
    sleep(250);
  }
  return {
    status: 'blocked',
    reason: sawMount
      ? `launched ${appImage} but its MCP transport socket (${DESKTOP_SOCKET}) did not appear within ${startupTimeoutMs}ms (bounded startup timeout; PENCIL_MCP_STARTUP_TIMEOUT_MS to adjust)`
      : `launched ${appImage} but its MCP server did not appear within ${startupTimeoutMs}ms (bounded startup timeout; PENCIL_MCP_STARTUP_TIMEOUT_MS to adjust)`,
  };
}

async function main() {
  const host = process.env.PENCIL_MCP_HOST || hostFromAgent(process.env.PENCIL_MCP_AGENT);
  const startupTimeoutMs = Number.isFinite(Number(process.env.PENCIL_MCP_STARTUP_TIMEOUT_MS))
    ? Number(process.env.PENCIL_MCP_STARTUP_TIMEOUT_MS)
    : 30000;
  const diag = process.env.PENCIL_MCP_LAUNCH_DRY_RUN === '1';
  const sessionId = process.env.AGENT_RULES_MCP_SESSION_ID;
  const targetWorkspace = process.env.AGENT_RULES_TARGET_WORKSPACE;
  const entry = configuredEntry(host);
  const report = {
    status: null,
    host,
    appRunning: liveMounts().length > 0,
    socket: desktopSocketReady(),
    windowVisible: windowVisible(),
    configuredEntry: entry ? { command: entry.command, args: entry.args, source: entry.source } : null,
    startupTimeoutMs,
  };

  if (diag) {
    const conflict = instanceConflict(sessionId);
    if (conflict) {
      report.status = 'conflict';
      report.conflict = {
        owner_session_id: conflict.session_id,
        owner_workspace: conflict.workspace ?? null,
        owner_window_hash: conflict.windowIdHash ?? null,
      };
      report.needsUser = true;
      console.log(JSON.stringify(report, null, 2));
      process.exit(3);
    }
    const resolved = resolveServer(startupTimeoutMs);
    report.status = resolved.status;
    if (resolved.mount) report.mount = resolved.mount;
    if (resolved.server) report.server = resolved.server;
    if (resolved.launched) report.launchedAppImage = true;
    if (resolved.reason) report.reason = resolved.reason;
    if (resolved.status === 'blocked') report.needsUser = true;
    console.log(JSON.stringify(report, null, 2));
    process.exit(resolved.status === 'ok' ? 0 : 2);
  }

  const conflict = instanceConflict(sessionId);
  if (conflict) {
    console.error(`Pencil MCP CONFLICT/NEEDS_USER: Pencil is already owned by OpenCode session ${conflict.session_id} on workspace ${conflict.workspace ?? 'unknown'} (window ${conflict.windowIdHash ?? 'unknown'}). Do not drag the singleton between desktops. Switch to that session or close the other Pencil use first.`);
    process.exit(3);
  }

  const resolved = resolveServer(startupTimeoutMs);
  if (resolved.status !== 'ok') {
    runStandbyServer(resolved.reason);
    return;
  }

  // AM-0006: bind this serve session in the advisory instance lock so a
  // second OpenCode session cannot drag the singleton between desktops.
  if (sessionId) {
    writeInstanceLock({
      session_id: sessionId,
      workspace: targetWorkspace !== undefined ? Number(targetWorkspace) : undefined,
      windowIdHash: null,
      updated_at: new Date().toISOString(),
    });
  }

  const args = process.argv.slice(2);
  const child = spawn(resolved.server, args, { stdio: 'inherit', env: process.env });
  child.on('error', (error) => {
    console.error(`Pencil MCP failed to start ${resolved.server}: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (sessionId) clearInstanceLock();
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}


function runStandbyServer(reason) {
  import('node:readline').then(({ createInterface }) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        if (msg.method === 'initialize') {
          const response = {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'pencil-mcp', version: '1.0.0' }
            }
          };
          process.stdout.write(JSON.stringify(response) + '\n');
        } else if (msg.method === 'notifications/initialized') {
          // ack
        } else if (msg.method === 'tools/list') {
          const response = {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              tools: [
                {
                  name: 'pencil_status',
                  description: 'Pencil design canvas status. Launch the Pencil desktop application (pen.dev) to enable interactive canvas inspection and editing.',
                  inputSchema: { type: 'object', properties: {} }
                }
              ]
            }
          };
          process.stdout.write(JSON.stringify(response) + '\n');
        } else if (msg.method === 'tools/call') {
          const response = {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Pencil desktop is currently in standby (${reason}). Please open the Pencil application to interact with your design canvas directly.`
                }
              ]
            }
          };
          process.stdout.write(JSON.stringify(response) + '\n');
        } else if (msg.id !== undefined) {
          const response = {
            jsonrpc: '2.0',
            id: msg.id,
            result: {}
          };
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (e) {}
    });
  });
}
main();
