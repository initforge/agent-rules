/**
 * R-011 / R-012 — DeepSeek Harness adapter: exact detection + pin attestation,
 * headless projection, and DSH Web multi-session binding via the native
 * ~/.dsh/sessions/<project>/session-<uuid> identity — never Web PID or
 * workspace names; honest granularity when no session identity is available.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../src/state/store.js';
import { Broker } from '../src/broker/broker.js';
import { Registry } from '../src/projection/registry.js';
import { Projector, gitHead } from '../src/projection/projector.js';
import { DeepseekHarnessAdapter, encodeProjectSlug, decodeProjectSlug, resolveDshBinary } from '../src/hosts/deepseek-harness.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-dsh-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
function makeDshHome(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function makeAdapter(broker: Broker, dshHome: string, projectRoot?: string): DeepseekHarnessAdapter {
  const registry = Registry.load(REPO_ROOT);
  const projector = new Projector(registry, {
    repoRoot: REPO_ROOT,
    gitHead: gitHead(REPO_ROOT),
    guardianBridgeCommand: '/abs/path/connect.js',
  });
  return new DeepseekHarnessAdapter({ broker, projector, binary: 'definitely-missing-dsh-binary', dshHome, projectRoot });
}

describe('DeepseekHarnessAdapter', () => {
  it('detect() attests honestly: no binary -> version null, install_authority=false, pinned=false', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker, makeDshHome());
    const att = await adapter.detect();
    expect(att.host_kind).toBe('deepseek-harness');
    expect(att.install_authority).toBe(false);
    expect(att.version).toBeNull();
    expect(att.pinned).toBe(false); // nothing pinned because nothing installed
  });

  it('resolveDshBinary resolves an exact binary path (npx cache pin or PATH fallback)', () => {
    const bin = resolveDshBinary();
    expect(bin).toBeTruthy();
    expect(bin).not.toContain('@latest');
  });

  it('binds a DSH Web session by native uuid with chat granularity', async () => {
    const broker = makeBroker();
    const home = makeDshHome();
    const project = '/home/user/Projects/agent-rules';
    const slug = encodeProjectSlug(project);
    const sessionDir = path.join(home, 'sessions', slug, 'session-11111111-2222-4333-8444-555555555555');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'session.jsonl.zstd'), 'x');

    const adapter = makeAdapter(broker, home, project);
    const b = await adapter.registerSession({ hostSessionId: '11111111-2222-4333-8444-555555555555' });
    expect(b.granularity).toBe('chat');
    expect(b.logical_session_id).toBe('dsh:11111111-2222-4333-8444-555555555555');
    expect(b.observed).toContain('native DSH session');
  });

  it('single active session for a project resolves to chat; multiple sessions degrade honestly', async () => {
    const broker = makeBroker();
    const home = makeDshHome();
    const project = '/home/user/Projects/one';
    const slug = encodeProjectSlug(project);
    fs.mkdirSync(path.join(home, 'sessions', slug, 'session-aaaaaaaa-1111-4111-8111-111111111111'), { recursive: true });
    fs.mkdirSync(path.join(home, 'sessions', slug, 'session-bbbbbbbb-2222-4222-8222-222222222222'), { recursive: true });

    const adapter = makeAdapter(broker, home, project);
    // two sessions, no hostSessionId -> must NOT claim chat
    const b = await adapter.registerSession({});
    expect(b.granularity).toBe('host-process');
    expect(b.fallback_reason).toContain('cannot claim per-chat binding');

    // one session -> chat
    const home2 = makeDshHome();
    const project2 = '/home/user/Projects/two';
    fs.mkdirSync(path.join(home2, 'sessions', encodeProjectSlug(project2), 'session-cccccccc-3333-4333-8333-333333333333'), { recursive: true });
    const adapter2 = makeAdapter(broker, home2, project2);
    const b2 = await adapter2.registerSession({});
    expect(b2.granularity).toBe('chat');
  });

  it('never uses Web process PID or workspace names as identity', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker, makeDshHome());
    const b = await adapter.registerSession({ hostInstanceId: 'dsh-web-12345', projectRoot: '/tmp/nonexistent-project' });
    // logical id is project-hashed, never the PID
    expect(b.logical_session_id).not.toContain('12345');
    expect(b.granularity).toBe('project');
  });

  it('projectMcp emits a DSH profile projection with guardian-wrapped entries', async () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker, makeDshHome());
    const { lease } = broker.acquireLease({ logical_session_id: 'dsh:sess', host_kind: 'deepseek-harness', provider_id: 'codebase-memory-mcp' });
    const proj = await adapter.projectMcp('dsh:sess', lease);
    expect(proj.format).toBe('dsh-profile');
    const content = proj.content as { 'x-agent-rules': Record<string, unknown>; plugins: Record<string, unknown> };
    expect(content['x-agent-rules'].guardian_wrapped).toBe(true);
    expect(content['x-agent-rules'].direct_provider_bypass).toBe(false);
    expect(proj.registry_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('project slug round-trips for the common home-* layout', () => {
    expect(encodeProjectSlug('/home/user/Projects/x')).toBe('--home-user-Projects-x--');
    expect(decodeProjectSlug('--home-user-Projects-x--')).toBe('/home/user/Projects/x');
  });

  it('one Web process with two agent sessions -> two leases by native uuid', async () => {
    const broker = makeBroker();
    const home = makeDshHome();
    const project = '/home/user/Projects/agent-rules';
    const slug = encodeProjectSlug(project);
    fs.mkdirSync(path.join(home, 'sessions', slug, 'session-11111111-2222-4333-8444-555555555555'), { recursive: true });
    fs.writeFileSync(path.join(home, 'sessions', slug, 'session-11111111-2222-4333-8444-555555555555', 'session.jsonl.zstd'), 'x');
    fs.mkdirSync(path.join(home, 'sessions', slug, 'session-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'), { recursive: true });
    fs.writeFileSync(path.join(home, 'sessions', slug, 'session-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'session.jsonl.zstd'), 'x');

    const adapter = makeAdapter(broker, home, project);
    const b1 = await adapter.registerSession({ hostSessionId: '11111111-2222-4333-8444-555555555555' });
    const b2 = await adapter.registerSession({ hostSessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    expect(b1.granularity).toBe('chat');
    expect(b2.granularity).toBe('chat');

    const l1 = broker.acquireLease({ logical_session_id: b1.logical_session_id, host_kind: 'deepseek-harness', provider_id: 'fake-mcp' });
    const l2 = broker.acquireLease({ logical_session_id: b2.logical_session_id, host_kind: 'deepseek-harness', provider_id: 'fake-mcp' });
    expect(l1.lease.lease_id).not.toBe(l2.lease.lease_id);
    expect(broker.getHostSession(b1.logical_session_id)?.host_session_id).toBe('11111111-2222-4333-8444-555555555555');
    expect(broker.getHostSession(b2.logical_session_id)?.host_session_id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });

  it('attachDshProfileProjection writes the cordis patch + receipt with backup (dry-run and real)', () => {
    const broker = makeBroker();
    const home = makeDshHome();
    fs.mkdirSync(path.join(home, 'profiles', 'web'), { recursive: true });
    fs.writeFileSync(path.join(home, 'profiles', 'web', 'cordis.patch.yml'), '[]\n');
    const adapter = makeAdapter(broker, home);
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'dsh:sess', host_kind: 'deepseek-harness', provider_id: 'codebase-memory-mcp' });
    const entry = adapter['projector'].project('codebase-memory-mcp', lease, lease.sharing_mode, lease.visibility_mode);

    // dry-run: no write
    const dry = adapter.attachDshProfileProjection([{ lease, projection: entry }], { profileName: 'web', dryRun: true });
    expect(dry.ok).toBe(true);
    expect(fs.readFileSync(path.join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')).toBe('[]\n');

    // real write: patch + receipt + backup of the previous patch
    const res = adapter.attachDshProfileProjection([{ lease, projection: entry }], { profileName: 'web' });
    expect(res.ok).toBe(true);
    expect(res.patchPath).toBe(path.join(home, 'profiles', 'web', 'cordis.patch.yml'));
    expect(res.receiptPath).toBe(path.join(home, 'profiles', 'web', 'agent-rules-projection.json'));
    const patch = fs.readFileSync(res.patchPath!, 'utf8');
    expect(patch).toContain('@deepseek-ai/dsh-mcp-client');
    expect(patch).toContain('serverName: codebase-memory-mcp');
    expect(patch).toContain('process.env.AGENT_RULES_LEASE_TOKEN');
    expect(patch).not.toContain('secret');
    const backup = fs.readFileSync(res.backupPath!, 'utf8');
    expect(backup).toBe('[]\n');
    const receipt = JSON.parse(fs.readFileSync(res.receiptPath!, 'utf8'));
    expect(receipt.schema).toBe('agent-rules/mcp-dsh-projection-receipt/v1');
    expect(receipt.lease_ids).toContain(lease.lease_id);
    expect(receipt.entries[0].guardian_wrapped ?? receipt.guardian_wrapped).toBe(true);
  });

  it('attachDshProfileProjection fails closed when the profile does not exist', () => {
    const broker = makeBroker();
    const adapter = makeAdapter(broker, makeDshHome());
    const { lease } = broker.acquireLease({ logical_session_id: 'dsh:sess', host_kind: 'deepseek-harness', provider_id: 'codebase-memory-mcp' });
    const entry = adapter['projector'].project('codebase-memory-mcp', lease, lease.sharing_mode, lease.visibility_mode);
    const res = adapter.attachDshProfileProjection([{ lease, projection: entry }], { profileName: 'missing-profile' });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('does not exist');
  });
});
