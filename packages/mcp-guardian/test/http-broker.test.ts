/**
 * R-014 — Streamable HTTP broker: lease-token ACL (non-spoofable), per-session
 * MCP protocol sessions, exclusive default instances, shared-safe multiplexing
 * only for registry-marked providers.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore } from '../src/state/store.js';
import { Broker } from '../src/broker/broker.js';
import { Registry } from '../src/projection/registry.js';
import { McpHttpBroker } from '../src/mcp/http-broker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FAKE_MCP = path.join(__dirname, 'helpers', 'fake-mcp-server.mjs');

const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-http-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

async function rpc(base: string, token: string, sessionId: string | null, msg: Record<string, unknown>, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown; sessionId?: string | null }> {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      ...headers,
    },
    body: JSON.stringify(msg),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, sessionId: res.headers.get('mcp-session-id') };
}

describe('McpHttpBroker', () => {
  it('initialize requires a valid lease token and returns a session id', async () => {
    const broker = makeBroker();
    const registry = Registry.load(REPO_ROOT);
    const httpBroker = new McpHttpBroker({
      broker,
      registry,
      launchCommand: () => ({ command: process.execPath, args: [FAKE_MCP], env: {} }),
    });
    const { port } = await httpBroker.listen();
    const base = `http://127.0.0.1:${port}`;

    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    broker.noteTransition(lease.lease_id, 'CREATED', 'ACQUIRING', 'acquire start');
    broker.noteTransition(lease.lease_id, 'ACQUIRING', 'STARTING', 'launch');
    broker.noteTransition(lease.lease_id, 'STARTING', 'READY', 'ready');

    // wrong token -> 401
    const bad = await rpc(base, 'wrong-token', null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(bad.status).toBe(401);

    // no token -> 401
    const none = await rpc(base, '', null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, { authorization: '' });
    expect(none.status).toBe(401);

    // correct token -> session
    const ok = await rpc(base, lease_token, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(ok.status).toBe(200);
    const result = ok.body as { result?: { serverInfo?: { name?: string } } };
    expect(result.result?.serverInfo?.name).toBe('agent-rules-mcp-http-broker');
    const sessionId = ok.sessionId;
    expect(sessionId).toBeTruthy();

    // tools/list on the session
    const tools = await rpc(base, lease_token, sessionId, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(tools.status).toBe(200);
    const toolsBody = tools.body as { result?: { tools?: Array<{ name: string }> } };
    expect(toolsBody.result?.tools?.map((t) => t.name)).toEqual(['tool_a', 'tool_b']);

    // session cannot be used by another lease's token
    const { lease: leaseB, lease_token: tokenB } = broker.acquireLease({ logical_session_id: 'B', host_kind: 'cli', provider_id: 'fake-mcp' });
    broker.noteTransition(leaseB.lease_id, 'CREATED', 'ACQUIRING', 'acquire start');
    broker.noteTransition(leaseB.lease_id, 'ACQUIRING', 'STARTING', 'launch');
    broker.noteTransition(leaseB.lease_id, 'STARTING', 'READY', 'ready');
    const cross = await rpc(base, tokenB, sessionId, { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
    expect(cross.status).toBe(403);

    await httpBroker.close();
  });

  it('exclusive leases get dedicated provider instances (never shared stdio)', async () => {
    const broker = makeBroker();
    const registry = Registry.load(REPO_ROOT);
    const httpBroker = new McpHttpBroker({
      broker,
      registry,
      launchCommand: () => ({ command: process.execPath, args: [FAKE_MCP], env: {} }),
    });
    const { port } = await httpBroker.listen();
    const base = `http://127.0.0.1:${port}`;

    const mk = async (id: string) => {
      const { lease, lease_token } = broker.acquireLease({ logical_session_id: id, host_kind: 'cli', provider_id: 'fake-mcp' });
      broker.noteTransition(lease.lease_id, 'CREATED', 'ACQUIRING', 'acquire start');
      broker.noteTransition(lease.lease_id, 'ACQUIRING', 'STARTING', 'launch');
      broker.noteTransition(lease.lease_id, 'STARTING', 'READY', 'ready');
      return lease_token;
    };
    const tA = await mk('A');
    const tB = await mk('B');
    const a = await rpc(base, tA, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const b = await rpc(base, tB, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(a.sessionId).not.toBe(b.sessionId);
    // two distinct provider instances (exclusive per session)
    expect(Array.from(httpBroker['instances'].keys()).length).toBeGreaterThanOrEqual(2);

    await httpBroker.close();
  });

  it('health endpoint reports broker state', async () => {
    const broker = makeBroker();
    const registry = Registry.load(REPO_ROOT);
    const httpBroker = new McpHttpBroker({
      broker,
      registry,
      launchCommand: () => ({ command: process.execPath, args: [FAKE_MCP], env: {} }),
    });
    const { port } = await httpBroker.listen();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    await httpBroker.close();
  });
});
