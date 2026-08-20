/**
 * R-013 — Codex CLI + desktop adapters: per-invocation leases, project-scoped
 * config projection (trusted scope only), honest desktop granularity — shared
 * config is never claimed as per-chat identity; ChatGPT web is never claimed.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../src/state/store.js';
import { Broker } from '../src/broker/broker.js';
import { Registry } from '../src/projection/registry.js';
import { Projector, gitHead } from '../src/projection/projector.js';
import { CodexCliAdapter, assessCodexDesktop, codexDesktopDetect } from '../src/hosts/codex.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-codex-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
function makeTmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tmp-'));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function makeAdapter(broker: Broker, projectRoot?: string): CodexCliAdapter {
  const registry = Registry.load(REPO_ROOT);
  const projector = new Projector(registry, {
    repoRoot: REPO_ROOT,
    gitHead: gitHead(REPO_ROOT),
    guardianBridgeCommand: '/abs/path/connect.js',
  });
  return new CodexCliAdapter({ broker, projector, projectRoot });
}

describe('CodexCliAdapter', () => {
  it('detect() attests the installed CLI binary version', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker);
    const att = await adapter.detect();
    // On this machine codex-cli is installed; on others the attestation is NOT_DETECTED — both honest.
    expect(att.host_kind).toBe('codex');
    if (att.running) {
      expect(att.version).toMatch(/\d+\.\d+\.\d+/);
    }
  });

  it('per-invocation session: project granularity when no native chat id exists (honest)', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker, '/tmp/codex-proj');
    const b = await adapter.registerSession({ hostSessionId: null, projectRoot: '/tmp/codex-proj' });
    expect(b.granularity).toBe('project');
    expect(b.fallback_reason).toContain('no native codex chat/session id');
    expect(b.logical_session_id).toMatch(/^codex:cli:/);
  });

  it('an explicit invocation session id binds at host-session granularity', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker);
    const b = await adapter.registerSession({ hostSessionId: 'invoc-42', projectRoot: '/tmp/codex-proj' });
    expect(b.granularity).toBe('host-session');
    expect(b.logical_session_id).toBe('codex:invoc-42');
  });

  it('projectMcp emits a Codex TOML projection with pinned digest and guardian wrap', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker);
    const { lease } = broker.acquireLease({ logical_session_id: 'codex:cli:abc', host_kind: 'codex', provider_id: 'codebase-memory-mcp' });
    const proj = await adapter.projectMcp('codex:cli:abc', lease);
    expect(proj.format).toBe('codex-toml');
    const toml = proj.content as string;
    expect(toml).toContain('[mcp_servers.');
    expect(toml).toContain('guardian_wrapped = true');
    expect(toml).toContain('direct_provider_bypass = false');
    expect(toml).toContain('registry_hash = ');
  });

  it('writeProjectConfig only writes in trusted project scope and backs up', () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker);
    const project = makeTmp();
    const denied = adapter.writeProjectConfig(project, '[mcp_servers.x]\n', { trusted: false });
    expect(denied.path).toBeNull();
    expect(denied.reason).toContain('not trusted');

    fs.mkdirSync(path.join(project, '.codex'));
    fs.writeFileSync(path.join(project, '.codex', 'config.toml'), 'original');
    const written = adapter.writeProjectConfig(project, '[mcp_servers.y]\n', { trusted: true });
    expect(written.path).toBe(path.join(project, '.codex', 'config.toml'));
    expect(fs.readFileSync(path.join(project, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.y]');
    expect(fs.readFileSync(path.join(project, '.codex', 'config.toml.agent-rules-backup'), 'utf8')).toBe('original');
  });
});

describe('Codex desktop / IDE honest boundary', () => {
  it('shared config without a chat hook is host-window granularity, never chat', async () => {
    const home = makeTmp();
    fs.writeFileSync(path.join(home, 'config.toml'), '[mcp_servers.chrome]\ncommand = "x"\n');
    const cap = await assessCodexDesktop(home);
    expect(cap.granularity).toBe('host-window');
    expect(cap.chat_identity_observed).toBe(false);
    expect(cap.restart_required_for_mcp).toBe(true);
    expect(cap.chained.join(' ')).toContain('not per-chat identity');
    expect(cap.chained.join(' ')).toContain('ChatGPT web');
  });

  it('a real session hook env lifts granularity to chat', async () => {
    const home = makeTmp();
    const old = process.env.CODEX_CHAT_ID;
    process.env.CODEX_CHAT_ID = 'chat-1';
    try {
      const cap = await assessCodexDesktop(home);
      expect(cap.granularity).toBe('chat');
      expect(cap.chat_identity_observed).toBe(true);
    } finally {
      if (old === undefined) delete process.env.CODEX_CHAT_ID;
      else process.env.CODEX_CHAT_ID = old;
    }
  });

  it('desktop detection is honest when no desktop binary exists', () => {
    const res = codexDesktopDetect();
    // Either a real desktop binary was found (with evidence) or an explicit reason
    if (res.found) {
      expect(res.binary).toBeTruthy();
    } else {
      expect(res.reason).toContain('no codex desktop binary');
    }
  });
});
