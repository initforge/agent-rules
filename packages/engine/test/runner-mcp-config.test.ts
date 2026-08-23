import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkVisibleMcpHost, materializeMcpConfig } from '../src/runner/mcp-config.js';
import { buildInvocation } from '../src/runner/headless-executor.js';

const VISIBLE_ENV = { DISPLAY: ':99' } as NodeJS.ProcessEnv;
const ADAPTER_HOSTS = ['antigravity', 'claude', 'codex', 'cursor', 'grok', 'opencode'] as const;

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
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { allowUnbound: true },
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
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { allowUnbound: true },
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
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { allowUnbound: true },
    });
    expect(paths.opencode).toBeDefined();
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as {
      mcp: Record<string, { type: string; command: string[]; enabled?: boolean }>;
    };
    expect(parsed.mcp.playwright).toBeDefined();
    expect(parsed.mcp.playwright.type).toBe('local');
    expect(parsed.mcp.playwright.command).toEqual(['npx', '-y', '@playwright/mcp@0.0.78', '--isolated']);
    expect(parsed.mcp.playwright.enabled).toBe(true);
    expect(paths.visibilityMode).toBe('foreground');
    expect(paths.visibilityReceiptPath).toBeDefined();
  });

  it('copies the exact native Pencil entry for every runner host', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pencil-native-home-'));
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
      fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
    fs.writeFileSync(path.join(home, '.codex', 'config.toml'), [
      '[mcp_servers.pencil]',
      "command = '/tmp/pen-codex-server'",
      "args = ['--app', 'desktop', '--agent', 'codexCLI']",
      '',
      '[mcp_servers.pencil.env]',
      "PENCIL_TOKEN = 'codex-token'",
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { pencil: { command: '/tmp/pen-claude-server', args: ['--app', 'desktop', '--agent', 'claudeCodeCLI'], env: { PENCIL_TOKEN: 'claude-token' } } } }));
    fs.writeFileSync(path.join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify({ mcp: { pencil: { command: ['/tmp/pen-opencode-server', '--app', 'desktop', '--agent', 'openCodeCLI'], environment: { PENCIL_TOKEN: 'opencode-token' } } } }));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-pencil-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['pencil-mcp'],
      activeAgent: 'codex',
      focusBinding: { allowUnbound: true },
      visibilityEnv: VISIBLE_ENV,
      visibilityPlatform: 'linux',
      pencilNativeEnv: { ...VISIBLE_ENV, PENCIL_MCP_TEST_ASSUME_APP: '1' },
      pencilNativeHome: home,
    });
    expect(paths.resolved).toEqual(['pencil-mcp']);
    expect(paths.missing).toEqual([]);
    const toml = fs.readFileSync(path.join(paths.codex!.configDir, 'config.toml'), 'utf8');
    expect(toml).toMatch(/\[mcp_servers\.pencil\]/);
    expect(toml).toContain("command = '/tmp/pen-codex-server'");
    expect(toml).toContain("'--agent', 'codexCLI'");
    expect(toml).toContain("PENCIL_TOKEN = 'codex-token'");
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as {
      mcp: Record<string, { command: string[]; environment?: Record<string, string> }>;
    };
    expect(parsed.mcp.pencil.command).toEqual(['/tmp/pen-opencode-server', '--app', 'desktop', '--agent', 'openCodeCLI']);
    expect(parsed.mcp.pencil.environment?.PENCIL_TOKEN).toBe('opencode-token');
  });

  it('blocks foreground MCP when the operator desktop is unavailable', () => {
    expect(() => materializeMcpConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-blocked-')), {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
      visibilityEnv: {},
      visibilityPlatform: 'linux',
    })).toThrow(/visible MCP preflight blocked/);
  });

  it('permits headless MCP only in an explicit CI profile and records that mode', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-ci-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
      visibilityMode: 'headless',
      visibilityEnv: { CI: '1' },
      visibilityPlatform: 'linux',
      focusBinding: { allowUnbound: true },
    });
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[] }> };
    expect(parsed.mcp.playwright.command).toContain('--headless');
    expect(JSON.parse(fs.readFileSync(paths.visibilityReceiptPath!, 'utf8'))).toMatchObject({ mode: 'headless', status: 'PASS' });
    expect(() => materializeMcpConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-local-headless-')), {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
      visibilityMode: 'headless',
      visibilityEnv: { DISPLAY: ':99' },
    })).toThrow(/CI-only/);
  });

  it('detects a foreground desktop consistently across host modes', () => {
    expect(checkVisibleMcpHost({ DISPLAY: ':99' }, 'linux').available).toBe(true);
    expect(checkVisibleMcpHost({}, 'linux').available).toBe(false);
    expect(checkVisibleMcpHost({ CI: '1', DISPLAY: ':99' }, 'linux').available).toBe(false);
  });

  it('keeps every browser adapter headed by default across declared hosts', () => {
    for (const integrationId of ['playwright-mcp', 'chrome-devtools-mcp']) {
      const adapterDir = path.join(REGISTRY, 'recommended', integrationId, 'adapters');
      for (const host of ADAPTER_HOSTS) {
        const extension = host === 'codex' ? 'toml' : 'json';
        const file = path.join(adapterDir, `${host}.${extension}`);
        expect(fs.existsSync(file), `${integrationId}/${host} adapter`).toBe(true);
        expect(fs.readFileSync(file, 'utf8'), `${integrationId}/${host} must not hide the browser`).not.toContain('--headless');
      }
    }
  });

  it('routes each static Pencil adapter through native host discovery without guessing vendor args', () => {
    const adapterDir = path.join(REGISTRY, 'optional', 'pencil-mcp', 'adapters');
    for (const host of ADAPTER_HOSTS) {
      const extension = host === 'codex' ? 'toml' : 'json';
      const file = path.join(adapterDir, `${host}.${extension}`);
      expect(fs.existsSync(file), `pencil/${host} adapter`).toBe(true);
      const adapter = fs.readFileSync(file, 'utf8');
      expect(adapter).toContain('__AGENT_RULES_PENCIL_LAUNCHER__');
      expect(adapter).toContain(`PENCIL_MCP_HOST`);
      expect(adapter).toContain(host);
    }
    const launcher = fs.readFileSync(path.join(REGISTRY, 'optional', 'pencil-mcp', 'launch.mjs'), 'utf8');
    expect(launcher).not.toContain("'--app'");
    expect(launcher).not.toContain('"--app"');
    expect(launcher).toContain('configCandidates(host)');
    expect(launcher).toContain("PENCIL_MCP_LAUNCH_DRY_RUN === '1'");
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
    const a = materializeMcpConfig(outA, { registryRoot: REGISTRY, integrationIds: ['playwright-mcp'], visibilityEnv: VISIBLE_ENV, focusBinding: { allowUnbound: true } });
    const b = materializeMcpConfig(outB, { registryRoot: REGISTRY, integrationIds: ['playwright-mcp'], visibilityEnv: VISIBLE_ENV, focusBinding: { allowUnbound: true } });
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
      integrationIds: ['playwright-mcp', 'chrome-devtools-mcp'], visibilityEnv: VISIBLE_ENV, focusBinding: { allowUnbound: true },
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
      integrationIds: ['playwright-mcp'], visibilityEnv: VISIBLE_ENV, focusBinding: { allowUnbound: true },
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
      integrationIds: ['playwright-mcp'], visibilityEnv: VISIBLE_ENV, focusBinding: { allowUnbound: true },
    });
    const inv = buildInvocation('opencode', 'hello', {
      permissionMode: 'acceptEdits',
      mcpConfigPaths: paths,
    });
    expect(inv.executable).toBe('opencode');
    expect(inv.args).toEqual(['run', '--auto', 'hello']);
    expect(inv.args).not.toContain('-c');
  });

  it('without mcpConfigPaths, no MCP flags leak into the argv', () => {
    const claude = buildInvocation('claude', 'hello', { permissionMode: 'acceptEdits' });
    expect(claude.args).not.toContain('--mcp-config');
    const codex = buildInvocation('codex', 'hello', { permissionMode: 'acceptEdits' });
    expect(codex.args).toEqual(['exec', '--sandbox', 'workspace-write', '--ask-for-approval', 'never', 'hello']);
    const opencode = buildInvocation('opencode', 'hello', { permissionMode: 'acceptEdits' });
    expect(opencode.args).toEqual(['run', '--auto', 'hello']);
  });
});
