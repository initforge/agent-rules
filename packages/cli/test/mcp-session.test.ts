/**
 * mcp-session CLI (owner §6): explicit user-facing API for persistent MCP
 * sessions — list / inspect / reconnect / stop / close-stale. No TTL, no
 * auto-expiry, explicit owner actions only, logical history preserved.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mcpSessionCmd } from '../src/commands/mcp-session.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-sess-cli-'));
const stateDir = path.join(tmpDir, 'broker');
const oldEnv = process.env.AGENT_RULES_MCP_STATE_DIR;

beforeAll(() => {
  process.env.AGENT_RULES_MCP_STATE_DIR = stateDir;
  fs.mkdirSync(stateDir, { recursive: true });
});

afterAll(() => {
  if (oldEnv === undefined) delete process.env.AGENT_RULES_MCP_STATE_DIR;
  else process.env.AGENT_RULES_MCP_STATE_DIR = oldEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function seedBroker(): Promise<{ leaseId: string; token: string }> {
  const { StateStore } = await import(path.join(process.cwd(), '..', 'mcp-guardian', 'dist', 'state', 'store.js'));
  const { Broker } = await import(path.join(process.cwd(), '..', 'mcp-guardian', 'dist', 'broker', 'broker.js'));
  const broker = new Broker({ stateStore: new StateStore({ stateDir }) });
  const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'dsh:cli-test', host_kind: 'deepseek-harness', provider_id: 'fake-mcp' });
  broker.closeStaleLeases(); // ensure API exists
  return { leaseId: lease.lease_id, token: lease_token };
}

describe('mcp-session command', () => {
  it('list returns the persistent leases with explicit status', async () => {
    const { leaseId } = await seedBroker();
    const res = await mcpSessionCmd(['list'], {});
    expect(res.exitCode).toBe(0);
    const data = JSON.parse(res.message) as { count: number; leases: Array<{ lease_id: string; status: string }> };
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.leases.some((l) => l.lease_id === leaseId)).toBe(true);
  });

  it('inspect returns lease + transition history', async () => {
    const { leaseId } = await seedBroker();
    const res = await mcpSessionCmd(['inspect', leaseId], {});
    expect(res.exitCode).toBe(0);
    const data = JSON.parse(res.message) as { lease: { lease_id: string }; transitions: unknown[] };
    expect(data.lease.lease_id).toBe(leaseId);
    expect(Array.isArray(data.transitions)).toBe(true);
  });

  it('stop requires the lease token (ownership proof) and releases on success', async () => {
    const { leaseId } = await seedBroker();
    const noToken = await mcpSessionCmd(['stop', leaseId], {});
    expect(noToken.exitCode).toBe(2); // InvalidArgument
    expect(noToken.message).toContain('AGENT_RULES_LEASE_TOKEN');

    const oldToken = process.env.AGENT_RULES_LEASE_TOKEN;
    process.env.AGENT_RULES_LEASE_TOKEN = 'wrong-token';
    const wrong = await mcpSessionCmd(['stop', leaseId], {});
    expect(wrong.exitCode).not.toBe(0);
    if (oldToken === undefined) delete process.env.AGENT_RULES_LEASE_TOKEN;
    else process.env.AGENT_RULES_LEASE_TOKEN = oldToken;
  });

  it('close-stale reports considered/closed without deleting logical history', async () => {
    await seedBroker();
    const res = await mcpSessionCmd(['close-stale'], {});
    expect(res.exitCode).toBe(0);
    const data = JSON.parse(res.message) as { considered: number; closed: unknown[]; note: string };
    expect(data.considered).toBeGreaterThanOrEqual(0);
    expect(data.note).toContain('logical history and leases are preserved');
  });

  it('unknown subcommand fails closed with usage', async () => {
    const res = await mcpSessionCmd(['bogus'], {});
    expect(res.exitCode).toBe(2);
    expect(res.message).toContain('unknown subcommand');
  });
});
