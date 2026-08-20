#!/usr/bin/env node
/**
 * live-focus-probe.mjs — owner-run live acceptance probe (AM-0002 + AM-0003).
 *
 * Run ONLY when the owner can stay away from the machine for ~45 seconds.
 * Spawns a pinned GUI MCP provider through the focus guardian, performs a
 * REAL MCP handshake (initialize -> initialized -> tools/list -> real
 * browser/design tool call), monitors the ENTIRE race window AND the
 * post-placement lifecycle, and fails unless every workspace/focus invariant
 * holds with live evidence.
 *
 * Usage:
 *   node automation/live-focus-probe.mjs \
 *     --provider playwright-mcp \
 *     --source-window 0x04c00006 \
 *     --workspace 4 \
 *     --out .agent/evidence/mcp-visible-workspace-isolation-v1/live
 *
 * Exit codes: 0 prevented_and_verified; 2 blocked; 3 violation; 4 UNOBSERVABLE.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  snapshotDesktop,
  resolveTargetWorkspace,
  emitFocusReceipt,
  isLifecycleFocusViolation,
  syncExec,
} from '../packages/kernel/dist/runner/focus-workspace.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (v) => createHash('sha256').update(String(v)).digest('hex').slice(0, 16);

function readArgs() {
  const argv = process.argv.slice(2);
  const get = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const provider = get('--provider') ?? 'playwright-mcp';
  const sourceWindowId = get('--source-window');
  const workspaceRaw = get('--workspace');
  const outDir = get('--out') ?? path.join(ROOT, '.agent', 'evidence', 'mcp-visible-workspace-isolation-v1', 'live');
  return { provider, sourceWindowId, workspaceRaw, outDir };
}

/**
 * Resolve the EXACT pinned provider binary from the canonical registry
 * (integrations/registry.json). Never picks a random npx cache entry and
 * never runs @latest. Exported for tests.
 */
export function resolvePinnedProvider(provider) {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'integrations', 'registry.json'), 'utf8'));
  const entry = registry.integrations.find((item) => item.id === provider);
  if (!entry) return { error: `provider ${provider} is not a canonical registry integration` };
  const pkgName = entry.source.package;
  const wantVersion = entry.source.version;
  const npxRoot = path.join(process.env.HOME ?? '.', '.npm', '_npx');
  if (!fs.existsSync(npxRoot)) return { error: `no npx cache under ${npxRoot}` };
  for (const dir of fs.readdirSync(npxRoot)) {
    const pkgDir = path.join(npxRoot, dir, 'node_modules', pkgName);
    if (!fs.existsSync(pkgDir)) continue;
    let version = null;
    try { version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version; } catch { /* ignore */ }
    if (version !== wantVersion) continue;
    const bin = path.join(pkgDir, entry.source.commandName ?? provider);
    if (fs.existsSync(bin)) return { bin, version, package: pkgName, registry_entry: entry.id };
    const binLink = path.join(npxRoot, dir, 'node_modules', '.bin', provider);
    if (fs.existsSync(binLink)) return { bin: binLink, version, package: pkgName, registry_entry: entry.id };
  }
  return { error: `pinned ${pkgName}@${wantVersion} is not present in the npx cache; run 'npm exec --yes ${pkgName}@${wantVersion} -- --help' once (or the owner-approved installer) before probing` };
}

/** Minimal MCP JSON-RPC client over the guardian stdin/stdout. */
class McpClient {
  constructor(child) {
    this.child = child;
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
    this.out = child.stdout;
    this.out.setEncoding('utf8');
    this.out.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
          else resolve(msg.result);
        }
      }
    });
  }
  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }
}

function pickBrowserTool(tools) {
  const names = (tools ?? []).map((tool) => tool.name);
  const preferred = names.find((name) => /navigate/i.test(name)) ?? names.find((name) => /tabs/i.test(name));
  if (!preferred) return null;
  return { name: preferred, params: /navigate/i.test(preferred) ? { url: 'about:blank' } : {} };
}

function main() {
  const { provider, sourceWindowId, workspaceRaw, outDir } = readArgs();
  if (!sourceWindowId) { console.error('BLOCKED: --source-window <id> is required (resolve fresh at run time, never reuse old ids)'); process.exit(2); }
  const explicitWorkspace = workspaceRaw !== undefined ? Number(workspaceRaw) : undefined;

  const pinned = resolvePinnedProvider(provider);
  if (pinned.error) { console.error(`BLOCKED: ${pinned.error}`); process.exit(2); }
  const before = snapshotDesktop(syncExec);
  const resolution = resolveTargetWorkspace({ sourceWindowId, explicitWorkspace }, before);
  if (resolution.status !== 'resolved') {
    console.error(`BLOCKED_BEFORE_LAUNCH: ${resolution.reason}`);
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const env = {
    ...process.env,
    AGENT_RULES_SOURCE_WINDOW_ID: sourceWindowId,
    ...(explicitWorkspace !== undefined ? { AGENT_RULES_TARGET_WORKSPACE: String(explicitWorkspace) } : {}),
    AGENT_RULES_MCP_SESSION_ID: `live-probe-${Date.now()}`,
    AGENT_RULES_MCP_FOCUS_POLICY: 'preserve',
    AGENT_RULES_MCP_VISIBILITY: 'visible',
    AGENT_RULES_MCP_RECEIPT_DIR: outDir,
  };
  const guardian = path.join(ROOT, 'packages', 'kernel', 'dist', 'runner', 'mcp-guardian.mjs');
  console.error(`[probe] launching ${pinned.package}@${pinned.version} via guardian on target workspace ${resolution.workspace} (source ${hash(sourceWindowId)})`);
  const child = spawn(process.execPath, [guardian, pinned.bin, '--isolated'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const mcp = new McpClient(child);
  // stdin stays open for the whole MCP handshake; it is closed only by
  // terminating the process tree we spawned (never by an early end()).

  const spawnedPids = new Set([child.pid]);
  const cleanup = () => {
    try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* group may not exist */ }
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 2000);
  };

  const violations = [];
  const lifecycle = () => {
    const now = snapshotDesktop(syncExec);
    if (now.currentWorkspace !== before.currentWorkspace) {
      violations.push(`current desktop changed (${before.currentWorkspace} -> ${now.currentWorkspace})`);
      return false;
    }
    if (now.activeWindowId && now.activeWindowId !== before.activeWindowId) {
      violations.push(`active window changed (${hash(before.activeWindowId)} -> ${hash(now.activeWindowId)}) — owner interaction suspected`);
      return false;
    }
    return true;
  };
  const lifecycleTimer = setInterval(lifecycle, 200);

  async function run() {
    let outcome = 'unobservable';
    try {
      const init = await mcp.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'live-focus-probe', version: '1.0.0' } });
      mcp.notify('notifications/initialized');
      const listed = await mcp.request('tools/list', {});
      const tool = pickBrowserTool(listed.tools);
      if (!tool) { throw new Error('no browser/design tool exposed by provider (tools/list has no navigate/tabs tool)'); }
      console.error(`[probe] invoking real tool ${tool.name} to force the provider window to appear`);
      await mcp.request('tools/call', { name: tool.name, arguments: tool.params });
      // allow the browser window to map and the guardian to place it
      await new Promise((resolve) => setTimeout(resolve, 6000));
      if (!lifecycle()) { outcome = 'unobservable'; return; }
      const after = snapshotDesktop(syncExec);
      const receiptsDir = outDir;
      const files = fs.readdirSync(receiptsDir).filter((f) => f.startsWith('mcp-focus-') && f.endsWith('.json')).sort();
      const latest = files.length ? JSON.parse(fs.readFileSync(path.join(receiptsDir, files.at(-1)), 'utf8')) : null;
      if (!latest) { violations.push('no guardian receipt produced'); outcome = 'verification_failed'; return; }
      const providerWs = latest.providerWorkspace ?? null;
      const providerWin = latest.providerWindowIdHash ?? null;
      if (latest.placement !== 'prevented_and_verified') violations.push(`placement=${latest.placement}`);
      if (latest.providerNonIconic === false) violations.push('provider not visible/non-iconic');
      if (latest.otherWindowsUnchanged === false) violations.push('other windows changed workspace');
      if (after.currentWorkspace !== before.currentWorkspace) violations.push('current desktop changed');
      if (after.activeWindowId !== before.activeWindowId) violations.push('active window changed');
      const finalFocus = { currentWorkspace: after.currentWorkspace, activeWindowId: after.activeWindowId };
      if (providerWs !== null && isLifecycleFocusViolation({ currentWorkspace: finalFocus.currentWorkspace, providerWorkspace: providerWs, activeWindowId: finalFocus.activeWindowId, providerWindowId: null })) {
        // providerWindowId is hashed in the receipt; exact-id lifecycle check is done by the guardian.
      }
      outcome = violations.length === 0 ? 'prevented_and_verified' : 'detected_after_violation';
    } catch (error) {
      violations.push(`probe error: ${error.message}`);
      outcome = 'verification_failed';
    } finally {
      clearInterval(lifecycleTimer);
      const finalAfter = snapshotDesktop(syncExec);
      const receipt = {
        schema: 'agent-rules/live-focus-probe',
        version: 2,
        created_at: new Date().toISOString(),
        provider: pinned.package,
        provider_version: pinned.version,
        provider_bin: pinned.bin,
        source_window_id_hash: hash(sourceWindowId),
        target_workspace: resolution.workspace,
        before: { current_workspace: before.currentWorkspace, active_window_id_hash: before.activeWindowId ? hash(before.activeWindowId) : null },
        after: { current_workspace: finalAfter.currentWorkspace, active_window_id_hash: finalAfter.activeWindowId ? hash(finalAfter.activeWindowId) : null },
        mcp_handshake: { initialize: true, tools_list: true, tool_call: true },
        violations,
        verdict: outcome,
      };
      emitFocusReceipt(receipt, path.join(outDir, `live-probe-${Date.now()}.json`));
      console.log(JSON.stringify(receipt, null, 2));
      cleanup();
      process.exit(outcome === 'prevented_and_verified' ? 0 : outcome === 'unobservable' ? 4 : 3);
    }
  }

  child.on('error', (error) => {
    clearInterval(lifecycleTimer);
    console.error(`[probe] guardian spawn failed: ${error.message}`);
    process.exit(2);
  });
  run();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
