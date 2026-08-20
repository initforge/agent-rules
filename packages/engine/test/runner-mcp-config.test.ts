import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { materializeMcpConfig } from '../src/runner/mcp-config.js';
import { buildInvocation } from '../src/runner/headless-executor.js';

describe('materializeMcpConfig', () => {
  // packages/engine/test/runner-mcp-config.test.ts
  //   .. → packages/engine/test
  //   ../.. → packages/engine
  //   ../../.. → repo root
  //   ../../../integrations → canonical integration root
  const REGISTRY = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..',
    'integrations'
  );

  it('writes a claude.mcp.json that merges the requested integrations', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp', 'chrome-devtools-mcp'],
    });
    expect(paths.resolved).toEqual(['playwright-mcp', 'chrome-devtools-mcp']);
    expect(paths.missing).toEqual([]);
    expect(paths.claude).toBeDefined();
    const parsed = JSON.parse(fs.readFileSync(paths.claude!.configPath, 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(parsed.mcpServers.playwright).toBeDefined();
    expect(parsed.mcpServers['chrome-devtools']).toBeDefined();
    expect(parsed.mcpServers.playwright.command).toBe('npx');
  });

  it('writes a codex/config.toml and remembers the env var name', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
    });
    expect(paths.codex).toBeDefined();
    expect(paths.codex!.envVarName).toBe('CODEX_HOME');
    expect(paths.codex!.configDir).toBeTruthy();
    const toml = fs.readFileSync(path.join(paths.codex!.configDir, 'config.toml'), 'utf8');
    expect(toml).toMatch(/\[mcp_servers\.playwright\]/);
  });

  it('writes an opencode.json that the opencode binary reads at startup', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
    });
    expect(paths.opencode).toBeDefined();
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as {
      mcp: Record<string, { type: string; command: string[]; enabled?: boolean }>;
    };
    expect(parsed.mcp.playwright).toBeDefined();
    expect(parsed.mcp.playwright.type).toBe('local');
    expect(parsed.mcp.playwright.command).toEqual(['npx', '-y', '@playwright/mcp@0.0.78', '--headless', '--isolated']);
    expect(parsed.mcp.playwright.enabled).toBe(true);
  });

  it('reports missing integrations in the missing list (does not throw)', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['nonexistent-integration-xyz'],
    });
    expect(paths.resolved).toEqual([]);
    expect(paths.missing).toEqual(['nonexistent-integration-xyz']);
    // No per-agent files were written.
    expect(paths.claude).toBeUndefined();
    expect(paths.codex).toBeUndefined();
    expect(paths.opencode).toBeUndefined();
  });

  it('each task gets its own directory so concurrent runs do not collide', () => {
    const outA = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const outB = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const a = materializeMcpConfig(outA, { registryRoot: REGISTRY, integrationIds: ['playwright-mcp'] });
    const b = materializeMcpConfig(outB, { registryRoot: REGISTRY, integrationIds: ['playwright-mcp'] });
    expect(a.claude!.configPath).not.toBe(b.claude!.configPath);
  });
});

describe('buildInvocation with MCP', () => {
  const REGISTRY = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..',
    'integrations'
  );

  it('claude: appends --mcp-config when set', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-inv-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp', 'chrome-devtools-mcp'],
    });
    const inv = buildInvocation('claude', 'hello', {
      permissionMode: 'acceptEdits',
      mcpConfigPaths: paths,
    });
    expect(inv.executable).toBe('claude');
    const mcpIdx = inv.args.indexOf('--mcp-config');
    expect(mcpIdx).toBeGreaterThan(-1);
    expect(inv.args[mcpIdx + 1]).toBe(paths.claude!.configPath);
  });

  it('codex: does not append --mcp-config (uses CODEX_HOME instead)', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-inv-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
    });
    const inv = buildInvocation('codex', 'hello', {
      permissionMode: 'acceptEdits',
      mcpConfigPaths: paths,
    });
    expect(inv.executable).toBe('codex');
    expect(inv.args).not.toContain('--mcp-config');
  });

  it('opencode: does not misuse -c for config (config is injected via OPENCODE_CONFIG at spawn)', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-inv-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
    });
    const inv = buildInvocation('opencode', 'hello', {
      permissionMode: 'acceptEdits',
      mcpConfigPaths: paths,
    });
    expect(inv.executable).toBe('opencode');
    expect(inv.args).toEqual(['run', 'hello']);
    expect(inv.args).not.toContain('-c');
  });

  it('without mcpConfigPaths, no MCP flags leak into the argv', () => {
    const claude = buildInvocation('claude', 'hello', { permissionMode: 'acceptEdits' });
    expect(claude.args).not.toContain('--mcp-config');
    const codex = buildInvocation('codex', 'hello', { permissionMode: 'acceptEdits' });
    expect(codex.args).toEqual(['exec', 'hello']);
    const opencode = buildInvocation('opencode', 'hello', { permissionMode: 'acceptEdits' });
    expect(opencode.args).toEqual(['run', 'hello']);
  });
});