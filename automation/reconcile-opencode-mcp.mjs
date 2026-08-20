#!/usr/bin/env node
/**
 * reconcile-opencode-mcp.mjs — AM-0006 installed OpenCode MCP reconciliation.
 *
 * Compare the global OpenCode config (~/.config/opencode/opencode.json) against
 * the canonical adapter policy and report drift. With --apply, back up the
 * current config (timestamped), preserve every unrelated key, and rewrite only
 * the managed MCP entries:
 *
 *   - playwright: pinned @playwright/mcp@0.0.78 + --isolated (visible, no
 *     --headless), wrapped by the focus guardian with preserve policy.
 *   - chrome-devtools: pinned chrome-devtools-mcp@1.7.0 + --isolated, same wrap.
 *   - pencil: stable launcher (never a persisted /tmp/.mount_* path), explicit
 *     only (PENCIL_MCP_ALLOW_LAUNCH gated), wrapped by the focus guardian.
 *
 * A before/after SHA-256 digest receipt is written next to the backup. No
 * credentials are logged; unrelated settings are byte-preserved.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = process.env.AGENT_RULES_OPENCODE_CONFIG
  ? path.resolve(process.env.AGENT_RULES_OPENCODE_CONFIG)
  : path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
const BACKUP_DIR = process.env.AGENT_RULES_OPENCODE_BACKUP_DIR
  ? path.resolve(process.env.AGENT_RULES_OPENCODE_BACKUP_DIR)
  : path.join(os.homedir(), '.config', 'opencode', 'agent-rules-backups');
const RECEIPT = path.join(BACKUP_DIR, 'mcp-reconcile-receipt.json');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function guardianPath() {
  return path.join(ROOT, 'packages', 'kernel', 'dist', 'runner', 'mcp-guardian.mjs');
}

export function pencilLauncherPath() {
  return path.join(ROOT, 'integrations', 'optional', 'pencil-mcp', 'launch.mjs');
}

const MANAGED_KEYS = ['playwright', 'chrome-devtools', 'pencil'];

export function expectedEntries() {
  const guardian = guardianPath();
  const pencil = pencilLauncherPath();
  return {
    playwright: {
      type: 'local',
      enabled: true,
      command: ['node', guardian, 'npx', '-y', '@playwright/mcp@0.0.78', '--isolated'],
      environment: {
        AGENT_RULES_MCP_FOCUS_POLICY: 'preserve',
        AGENT_RULES_MCP_VISIBILITY: 'visible',
      },
    },
    'chrome-devtools': {
      type: 'local',
      enabled: true,
      command: ['node', guardian, 'npx', '-y', 'chrome-devtools-mcp@1.7.0', '--isolated'],
      environment: {
        AGENT_RULES_MCP_FOCUS_POLICY: 'preserve',
        AGENT_RULES_MCP_VISIBILITY: 'visible',
      },
    },
    pencil: {
      type: 'local',
      enabled: true,
      command: ['node', guardian, 'node', pencil, '--app', 'desktop', '--agent', 'openCodeCLI'],
      environment: {
        AGENT_RULES_MCP_FOCUS_POLICY: 'preserve',
        AGENT_RULES_MCP_VISIBILITY: 'visible',
        PENCIL_MCP_HOST: 'opencode',
        PENCIL_MCP_AGENT: 'openCodeCLI',
      },
    },
  };
}

export function drift(config) {
  const problems = [];
  const expected = expectedEntries();
  const mcp = config.mcp ?? {};
  for (const key of MANAGED_KEYS) {
    const current = mcp[key];
    if (!current) { problems.push(`${key}: missing`); continue; }
    if (current.type !== 'local') problems.push(`${key}: type=${String(current.type)} (expected local)`);
    const cmd = Array.isArray(current.command) ? current.command.join(' ') : String(current.command ?? '');
    const want = expected[key].command.join(' ');
    if (cmd !== want) problems.push(`${key}: command drift (got "${cmd}" want "${want}")`);
    if (String(key === 'playwright' || key === 'chrome-devtools' ? cmd : cmd).includes('@latest')) problems.push(`${key}: @latest used instead of a pinned version`);
    if (!cmd.includes('--isolated') && key !== 'pencil') problems.push(`${key}: missing --isolated`);
    if (cmd.includes('--headless')) problems.push(`${key}: --headless present in local interactive mode`);
    if (cmd.includes('/tmp/.mount_Pen.')) problems.push(`${key}: persisted ephemeral AppImage mount path`);
    const env = current.environment ?? {};
    if (env.AGENT_RULES_MCP_FOCUS_POLICY !== 'preserve') problems.push(`${key}: focus policy not preserve`);
    if (env.AGENT_RULES_MCP_VISIBILITY !== 'visible') problems.push(`${key}: visibility not visible`);
  }
  return problems;
}

export function applyReconciliation() {
  if (!fs.existsSync(CONFIG)) throw new Error(`global opencode config missing: ${CONFIG}`);
  const raw = fs.readFileSync(CONFIG, 'utf8');
  const before = sha256(raw);
  const config = JSON.parse(raw);
  const problems = drift(config);
  if (problems.length === 0) {
    const receipt = {
      schema: 'agent-rules/opencode-mcp-reconcile',
      version: 1,
      status: 'IN_SYNC',
      before_sha256: before,
      after_sha256: before,
      changed: false,
      applied_at: new Date().toISOString(),
    };
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    return receipt;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `opencode.json.${stamp}.backup`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.copyFileSync(CONFIG, backup);
  config.mcp = { ...config.mcp, ...expectedEntries() };
  const next = `${JSON.stringify(config, null, 2)}\n`;
  const after = sha256(next);
  fs.writeFileSync(CONFIG, next, 'utf8');
  const receipt = {
    schema: 'agent-rules/opencode-mcp-reconcile',
    version: 1,
    status: 'RECONCILED',
    before_sha256: before,
    after_sha256: after,
    changed: true,
    backup: path.relative(path.join(os.homedir(), '.config'), backup),
    managed_entries: MANAGED_KEYS,
    drift_fixed: problems,
    applied_at: new Date().toISOString(),
  };
  fs.writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}

const apply = process.argv.includes('--apply');
const check = process.argv.includes('--check');

/**
 * Live runtime reconciliation (AM-0002): classify running interactive MCP
 * server processes as IN_SYNC (guardian-wrapped, no @latest) or STALE/DRIFTED
 * (pre-guardian config or @latest argv). Read-only; never kills or restarts.
 */
export function liveDrift() {
  const processes = [];
  try {
    const ps = spawnSync('ps', ['-eo', 'pid,ppid,args'], { encoding: 'utf8' });
    const lines = String(ps.stdout ?? '').split('\n').slice(1);
    const byPid = new Map(lines.map((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      return m ? [Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }] : null;
    }).filter(Boolean));
    const isDescendantOf = (pid, marker, depth = 0) => {
      if (depth > 4 || pid === undefined || pid === null) return false;
      const entry = byPid.get(Number(pid));
      if (!entry) return false;
      if (entry.args.includes(marker)) return true;
      return isDescendantOf(entry.ppid, marker, depth + 1);
    };
    let windows = [];
    try {
      const listing = spawnSync('wmctrl', ['-l', '-p'], { encoding: 'utf8' });
      windows = String(listing.stdout ?? '').split('\n')
        .map((line) => /^\s*(0x[0-9a-fA-F]+)\s+(-?\d+)\s+(\d+)/.exec(line))
        .filter((match) => match)
        .map((match) => ({ windowId: match[1].toLowerCase(), workspace: Number(match[2]), pid: match[3] }));
    } catch { /* wmctrl unavailable: window workspace unknown */ }
    const known = ['playwright-mcp', 'chrome-devtools-mcp', 'serena', 'pencil-mcp'];
    for (const entry of byPid.values()) {
      const provider = known.find((name) => entry.args.includes(name));
      if (!provider) continue;
      const isGuardian = isDescendantOf(entry.ppid, 'mcp-guardian.mjs');
      const usesLatest = /@latest|\blatest\b/.test(entry.args);
      const window = windows.find((w) => String(w.pid) === String(entry.pid));
      processes.push({
        pid: entry.pid,
        ppid: entry.ppid,
        provider,
        guardian_wrapped: isGuardian,
        uses_latest: usesLatest,
        window_workspace: window?.workspace ?? null,
        status: isGuardian && !usesLatest ? 'IN_SYNC' : 'STALE',
        restart_command: isGuardian && !usesLatest
          ? null
          : `close and reopen the owning OpenCode session (process chain root: pid ${entry.ppid}) to launch the MCP through the guardian; the on-disk config is already IN_SYNC so NO reconcile --apply is needed; after restart confirm with 'node automation/reconcile-opencode-mcp.mjs --check' that guardian_wrapped=true for pid <new-pid>`,
      });
    }
  } catch { /* ps unavailable: live reconciliation unsupported on this host */ }
  const stale = processes.filter((entry) => entry.status === 'STALE');
  return { status: processes.length === 0 ? 'NO_LIVE_MCP_PROCESSES' : stale.length === 0 ? 'IN_SYNC' : 'STALE', processes, stale_count: stale.length };
}

/**
 * Scan project-level OpenCode configs for DIRECT provider entries that bypass
 * the focus guardian (playwright / chrome-devtools MCP without the
 * mcp-guardian.mjs wrapper). Read-only; reported, never fixed automatically.
 */
export function scanMcpBypass(projectRoot = ROOT) {
  const candidates = [
    path.join(projectRoot, 'opencode.json'),
    path.join(projectRoot, 'opencode.jsonc'),
    path.join(projectRoot, '.opencode', 'opencode.json'),
    path.join(projectRoot, '.opencode', 'opencode.jsonc'),
  ];
  const bypasses = [];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    let config;
    try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const mcp = config.mcp ?? {};
    for (const [key, entry] of Object.entries(mcp)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const cmd = Array.isArray(entry.command) ? entry.command.join(' ') : String(entry.command ?? '');
      const isProvider = cmd.includes('playwright-mcp') || cmd.includes('@playwright/mcp') || cmd.includes('chrome-devtools-mcp');
      if (!isProvider) continue;
      if (!cmd.includes('mcp-guardian.mjs')) {
        bypasses.push({ file, key, command: cmd.slice(0, 120) });
      }
    }
  }
  return bypasses;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain) {
  // importable for tests (scanMcpBypass, liveDrift)
} else if (apply) {
  try {
    const receipt = applyReconciliation();
    console.log(JSON.stringify(receipt, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
} else {
  if (!fs.existsSync(CONFIG)) {
    console.log(JSON.stringify({ status: 'MISSING', config: CONFIG }));
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const problems = drift(config);
  const digest = sha256(fs.readFileSync(CONFIG));
  const live = liveDrift();
  const bypasses = scanMcpBypass();
  const configStatus = problems.length === 0 ? 'IN_SYNC' : 'DRIFT';
  const bypass = bypasses.length > 0;
  const overall = configStatus === 'IN_SYNC' && live.status === 'IN_SYNC' && !bypass ? 'IN_SYNC'
    : bypass ? 'BYPASS'
      : configStatus === 'DRIFT' || live.status === 'STALE' ? 'STALE'
        : live.status;
  console.log(JSON.stringify({
    status: overall,
    config: { status: configStatus, sha256: digest, problems },
    live: live,
    bypass: bypasses,
    note: overall === 'STALE' ? 'stale live processes run the pre-guardian config; restart those sessions to pick up the guardian wrapper (never killed automatically)' : overall === 'BYPASS' ? 'direct provider config found that bypasses mcp-guardian; remove or wrap it (never delete the guardian)' : undefined,
  }, null, 2));
  process.exit(overall === 'IN_SYNC' ? 0 : 1);
}
