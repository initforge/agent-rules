/**
 * R-015 — projection generator: registry-driven configs (OpenCode JSON, Codex
 * TOML, DSH profile, guardian launch config) with pinned versions, command
 * digests, registry/policy hashes and rollback references; never @latest,
 * never secrets, never a direct provider bypass.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Registry } from '../src/projection/registry.js';
import { Projector, gitHead } from '../src/projection/projector.js';
import { docHash, commandDigest } from '../src/util/hashes.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const tmpDirs: string[] = [];
function makeProjector(): Projector {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proj-'));
  tmpDirs.push(d);
  return new Projector(Registry.load(REPO_ROOT), {
    repoRoot: REPO_ROOT,
    gitHead: gitHead(REPO_ROOT),
    policyHash: docHash({ policy: 'owner-policy-v1' }),
    guardianBridgeCommand: '/abs/path/connect.js',
  });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('Projector', () => {
  it('loads the canonical registry with capability metadata', () => {
    const registry = Registry.load(REPO_ROOT);
    expect(registry.providerCount).toBeGreaterThan(3);
    const pw = registry.provider('playwright-mcp');
    expect(pw).not.toBeNull();
    expect(pw!.supports_stdio).toBe(true);
    expect(pw!.default_sharing_mode).toBe('exclusive');
    const cd = registry.provider('chrome-devtools-mcp');
    expect(cd!.resource_scope).toBe('browser-cdp');
    expect(cd!.gui).toBe(true);
  });

  it('rejects providers without a pinned version (never @latest)', () => {
    const projector = makeProjector();
    const registry = Registry.load(REPO_ROOT);
    // fabricate an unpinned registry entry
    const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'integrations', 'registry.json'), 'utf8'));
    raw.integrations.push({
      id: 'floating-provider',
      displayName: 'Floating',
      kind: 'mcp',
      source: { type: 'npm', package: 'x', version: 'latest', versionPolicy: 'latest' },
    });
    const floating = new Registry(raw).provider('floating-provider')!;
    const projector2 = new Projector(floating ? (new Registry(raw) as Registry) : registry, {
      repoRoot: REPO_ROOT,
      guardianBridgeCommand: '/abs/path/connect.js',
    });
    expect(() =>
      projector2.project('floating-provider', { lease_id: 'l1', logical_session_id: 's1' }, 'exclusive', 'visible-local'),
    ).toThrowError(/not pinned/);
  });

  it('projects a guardian-wrapped entry with digest + hashes + rollback', () => {
    const projector = makeProjector();
    const entry = projector.project('playwright-mcp', { lease_id: 'l1', logical_session_id: 's1' }, 'exclusive', 'visible-local');
    expect(entry.guardian_wrapped).toBe(true);
    // command is an executable (node), the bridge script rides in args — the
    // shape MCP hosts actually spawn (shell:false)
    expect(entry.command).toBe(process.execPath);
    expect(entry.args[0]).toBe('/abs/path/connect.js');
    expect(entry.args).toContain('--lease');
    expect(entry.args).toContain('l1');
    expect(entry.args).toContain('--provider');
    expect(entry.args).toContain('playwright-mcp');
    expect(entry.command_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.registry_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.policy_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.rollback_reference).toBeTruthy();
    expect(entry.source.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(entry.source.pinned).toBe(true);
    // the digest must be deterministic
    const again = projector.project('playwright-mcp', { lease_id: 'l1', logical_session_id: 's1' }, 'exclusive', 'visible-local');
    expect(again.command_digest).toBe(entry.command_digest);
  });

  it('rejects visible-local for providers that forbid it and sharing for non-shared-safe', () => {
    const projector = makeProjector();
    // pencil-mcp is explicit-only and NOT in the canonical registry
    const reg = projector['registry'] as Registry;
    expect(reg.provider('pencil-mcp')).toBeNull();
    const pw = reg.provider('playwright-mcp')!;
    expect(() =>
      projector.project('playwright-mcp', { lease_id: 'l1', logical_session_id: 's1' }, 'shared-readonly', 'visible-local'),
    ).toThrowError(/not shared-safe/);
  });

  it('emits OpenCode JSON / Codex TOML / DSH profile with no secrets and no bypass', () => {
    const projector = makeProjector();
    const e1 = projector.project('chrome-devtools-mcp', { lease_id: 'l1', logical_session_id: 's1' }, 'exclusive', 'visible-local');
    const json = JSON.stringify(projector.toOpenCodeJson([e1]));
    expect(json).not.toContain('AGENT_RULES_LEASE_TOKEN');
    expect(json).not.toContain('api_key');
    expect(json).not.toContain('secret');
    const toml = projector.toCodexToml([e1]);
    expect(toml).toContain('[mcp_servers.');
    expect(toml).not.toContain('token=');
    const profile = JSON.stringify(projector.toDshProfile([e1]));
    expect(profile).toContain('guardian_wrapped');
    expect(profile).not.toContain('secret');
  });

  it('emits the DSH cordis patch as a top-level array of insert blocks with dsh-mcp-client instances (guardian-wrapped, token via !!js env reference)', () => {
    const projector = makeProjector();
    const e1 = projector.project('codebase-memory-mcp', { lease_id: 'l1', logical_session_id: 's1' }, 'exclusive', 'visible-local');
    const patch = projector.toDshCordisPatch([e1]);
    // top-level YAML array (cordis PatchOptions), one insert block
    expect(Array.isArray(patch)).toBe(true);
    const insert = (patch[0] as { insert: Array<Record<string, unknown>> }).insert;
    expect(insert.length).toBe(1);
    const entry = insert[0] as { id: string; name: string; config: Record<string, unknown> };
    expect(entry.id).toBe('mcp-codebase-memory-mcp');
    expect(entry.name).toBe('@deepseek-ai/dsh-mcp-client');
    const cfg = entry.config as { serverName: string; transport: string; command: string; args: string[]; env: Record<string, string> };
    expect(cfg.serverName).toBe('codebase-memory-mcp');
    expect(cfg.transport).toBe('stdio');
    // spawnable shape: command is the executable, bridge script + flags in args
    expect(cfg.command).toBe(process.execPath);
    expect(cfg.args[0]).toBe('/abs/path/connect.js');
    expect(cfg.args).toContain('--lease');
    expect(cfg.args).toContain('l1');
    expect(cfg.args).toContain('--provider');
    expect(cfg.args).toContain('codebase-memory-mcp');
    // token is referenced from host env, never embedded
    expect(cfg.env.AGENT_RULES_LEASE_TOKEN).toContain('process.env.AGENT_RULES_LEASE_TOKEN');
    expect(JSON.stringify(patch)).not.toContain('secret');
    expect(JSON.stringify(patch)).not.toContain('api_key');
  });

  it('emits a DSH projection receipt with registry/policy hash, rollback reference and no secrets', () => {
    const projector = makeProjector();
    const e1 = projector.project('codebase-memory-mcp', { lease_id: 'l1', logical_session_id: 's1' }, 'exclusive', 'visible-local');
    const receipt = projector.toDshProjectionReceipt([e1], { profile: 'web' });
    expect(receipt.schema).toBe('agent-rules/mcp-dsh-projection-receipt/v1');
    expect(receipt.registry_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.policy_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rollback_reference).toBeTruthy();
    expect(receipt.guardian_wrapped).toBe(true);
    expect(receipt.direct_provider_bypass).toBe(false);
    expect(receipt.profile).toBe('web');
    expect(receipt.entries[0].command_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(receipt)).not.toContain('secret');
  });

  it('toLaunchConfig pins the registry command and includes capability flags', () => {
    const projector = makeProjector();
    const registry = Registry.load(REPO_ROOT);
    const entry = registry.provider('codebase-memory-mcp')!;
    const cfg = projector.toLaunchConfig(entry, { lease_id: 'l1', provider_id: 'codebase-memory-mcp' });
    expect(cfg.command_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(cfg.registry_hash).toBe(registry.registryHash);
    expect(cfg.gui).toBe(false);
    expect(cfg.headless_allowed).toBe(true);
    expect(commandDigest(cfg.command as string, cfg.args as string[])).toBe(cfg.command_digest);
  });
});
