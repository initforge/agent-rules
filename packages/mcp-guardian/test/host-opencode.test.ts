/**
 * R-010 — OpenCode adapter: host session registration before GUI MCP launch,
 * native session id binding (never CWD alone), per-session MCP projection
 * through the guardian, no direct project-level bypass.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../src/state/store.js';
import { Broker } from '../src/broker/broker.js';
import { Registry } from '../src/projection/registry.js';
import { Projector, gitHead } from '../src/projection/projector.js';
import { OpencodeAdapter } from '../src/hosts/opencode.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-oc-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('OpencodeAdapter', () => {
  let server: http.Server;
  let baseUrl: string;
  const nativeSessions = new Map<string, { id: string; dir: string }>();

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (url.pathname === '/app') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ pid: 12345 }));
        return;
      }
      if (url.pathname === '/session') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([...nativeSessions.values()]));
        return;
      }
      const m = /^\/session\/([^/]+)$/.exec(url.pathname);
      if (m) {
        const s = nativeSessions.get(decodeURIComponent(m[1]));
        if (s) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(s));
          return;
        }
        res.writeHead(404);
        res.end('{}');
        return;
      }
      res.writeHead(404);
      res.end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeAdapter(broker: Broker): OpencodeAdapter {
    const registry = Registry.load(REPO_ROOT);
    const projector = new Projector(registry, {
      repoRoot: REPO_ROOT,
      gitHead: gitHead(REPO_ROOT),
      guardianBridgeCommand: '/abs/path/connect.js',
    });
    return new OpencodeAdapter({ broker, projector, baseUrl, binary: 'definitely-missing-binary' });
  }

  it('detect() attests the running server without fabricating a version', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker);
    const att = await adapter.detect();
    expect(att.running).toBe(true);
    expect(att.host_kind).toBe('opencode');
    expect(att.host_instance_id).toContain('opencode-server');
  });

  it('binds by native session id when the session is observable (chat granularity)', async () => {
    const broker = makeBroker();
    nativeSessions.set('sess-1', { id: 'sess-1', dir: '/tmp/proj' });
    const adapter = makeAdapter(broker);
    const b = await adapter.registerSession({ hostSessionId: 'sess-1', projectRoot: '/tmp/proj' });
    expect(b.granularity).toBe('chat');
    expect(b.logical_session_id).toBe('opencode:sess-1');
    expect(b.attestation_status).toBe('ATTESTED');
    const stored = broker.getHostSession('opencode:sess-1');
    expect(stored?.host_session_id).toBe('sess-1');
  });

  it('never infers chat identity from CWD alone (project granularity, honest fallback)', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker);
    const b = await adapter.registerSession({ projectRoot: '/some/project' });
    expect(b.granularity).toBe('project');
    expect(b.fallback_reason).toContain('project granularity');
    expect(b.logical_session_id).not.toBe('opencode:/some/project'); // never raw cwd
  });

  it('projectMcp emits a guardian-wrapped OpenCode JSON projection with pinned digest', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker);
    const { lease } = broker.acquireLease({ logical_session_id: 'opencode:sess-1', host_kind: 'opencode', provider_id: 'chrome-devtools-mcp' });
    const proj = await adapter.projectMcp('opencode:sess-1', lease);
    expect(proj.format).toBe('opencode-json');
    const content = proj.content as { mcp: Record<string, unknown>; 'x-agent-rules': Record<string, unknown> };
    expect(Object.keys(content.mcp).length).toBe(1);
    const entry = content.mcp[Object.keys(content.mcp)[0]] as { command: string; args: string[] };
    // spawnable shape: executable command, guardian bridge script + flags in args
    expect(entry.command).toBe(process.execPath);
    expect(entry.args[0]).toContain('connect.js'); // guardian bridge, never the raw provider
    expect(entry.args).toContain('--lease');
    const meta = content['x-agent-rules'];
    expect(meta.guardian_wrapped).toBe(true);
    expect(meta.direct_provider_bypass).toBe(false);
    expect(proj.entries[0].guardian_wrapped).toBe(true);
    expect(proj.entries[0].command_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('no direct bypass: the projection never contains the raw provider command', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker);
    const { lease } = broker.acquireLease({ logical_session_id: 'opencode:sess-2', host_kind: 'opencode', provider_id: 'chrome-devtools-mcp' });
    const proj = await adapter.projectMcp('opencode:sess-2', lease);
    const raw = JSON.stringify(proj.content);
    expect(raw).not.toContain('"command": "chrome-devtools-mcp"');
  });
});
