import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeMcpConfig } from '../src/runner/mcp-config.js';
import { toMcpCommandArgv, posixJoin, isWindows } from '../src/runner/platform.js';

const REGISTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'integrations');
const VISIBLE_ENV = { DISPLAY: ':99' } as NodeJS.ProcessEnv;

/**
 * Canonical MCP path (post broker removal): standard/read-only providers are
 * host native MCP -> pinned provider command -> stdio. No broker, no SQLite,
 * no lease, no HTTP multiplexing, no default httpEndpoint.
 */
describe('canonical simplified MCP path', () => {
  it('materializes standard read-only providers DIRECTLY without any guardian wrapper', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-direct-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['codebase-memory-mcp', 'context7'],
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { sourceWindowId: '0x04c00006' },
    });
    expect(paths.resolved).toEqual(expect.arrayContaining(['codebase-memory-mcp', 'context7']));
    expect(paths.interactiveIntegrations).toEqual([]);
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[] }> };
    for (const entry of Object.values(parsed.mcp)) {
      const joined = entry.command.join(' ');
      expect(joined).not.toContain('mcp-guardian.mjs');
      expect(joined).not.toContain('http');
    }
  });

  it('keeps pinned provider versions in the materialized command (never @latest)', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-pin-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp', 'context7'],
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { sourceWindowId: '0x04c00006' },
    });
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[] }> };
    expect(parsed.mcp.playwright.command.join(' ')).toContain('@playwright/mcp@0.0.78');
    expect(parsed.mcp.context7.command.join(' ')).toContain('@upstash/context7-mcp@3.2.5');
    for (const entry of Object.values(parsed.mcp)) {
      expect(entry.command.join(' ')).not.toContain('@latest');
    }
  });

  it('registry defines NO default httpEndpoint for playwright (pinned stdio is the default)', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(REGISTRY, 'registry.json'), 'utf8')) as { integrations: Array<{ id: string; httpEndpoint?: string }> };
    for (const entry of registry.integrations) {
      expect(entry.httpEndpoint).toBeUndefined();
    }
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-no-http-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
      visibilityMode: 'headless',
      visibilityEnv: { CI: '1' },
      visibilityPlatform: 'linux',
      focusBinding: { allowUnbound: true },
    });
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[] }> };
    const joined = parsed.mcp.playwright.command.join(' ');
    expect(joined).not.toMatch(/127\.0\.0\.1:4712/);
    expect(joined).not.toContain('--port');
  });

  it('GUI interactive providers are still guardian-wrapped in the guarded path', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-guard-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp', 'chrome-devtools-mcp'],
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { sourceWindowId: '0x04c00006' },
    });
    expect(paths.interactiveIntegrations).toEqual(expect.arrayContaining(['playwright-mcp', 'chrome-devtools-mcp']));
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[]; environment?: Record<string, string> }> };
    for (const key of ['playwright', 'chrome-devtools']) {
      expect(parsed.mcp[key].command.join(' ')).toContain('mcp-guardian.mjs');
      expect(parsed.mcp[key].environment?.AGENT_RULES_MCP_VISIBILITY).toBe('visible');
    }
  });

  it('materialized config contains no plaintext tokens or API keys', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-nosecret-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['codebase-memory-mcp', 'context7', 'playwright-mcp'],
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { sourceWindowId: '0x04c00006' },
    });
    for (const file of fs.readdirSync(out, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const text = fs.readFileSync(path.join(out, file.name), 'utf8');
      expect(text).not.toMatch(/sk-(?:ant|proj)-[A-Za-z0-9_-]{10,}/);
      expect(text).not.toMatch(/AGENT_RULES_LEASE_TOKEN\s*:\s*["'][A-Za-z0-9-]{20,}/);
    }
  });
});

describe('Windows .cmd command wrapping (platform.ts)', () => {
  it('wraps literal .cmd/.bat/.ps1 shim paths with cmd.exe on win32 and passes through on posix', () => {
    const wrapped = toMcpCommandArgv(['C:\\Users\\me\\AppData\\Roaming\\npm\\npx.cmd', '-y', '@upstash/context7-mcp@3.2.5']);
    if (isWindows()) {
      expect(wrapped[0]).toBe('cmd.exe');
      expect(wrapped).toEqual(expect.arrayContaining(['/d', '/s', '/c', 'C:\\Users\\me\\AppData\\Roaming\\npm\\npx.cmd', '-y', '@upstash/context7-mcp@3.2.5']));
    } else {
      expect(wrapped).toEqual(['C:\\Users\\me\\AppData\\Roaming\\npm\\npx.cmd', '-y', '@upstash/context7-mcp@3.2.5']);
    }
  });

  it('passes bare command names (npx) through unchanged; hosts resolve their own shims', () => {
    // The kernel writes configs for hosts (claude/codex/opencode) that resolve
    // shim names natively; only literal .cmd/.bat/.ps1 paths are wrapped.
    expect(toMcpCommandArgv(['npx', '-y', '@upstash/context7-mcp@3.2.5'])).toEqual(['npx', '-y', '@upstash/context7-mcp@3.2.5']);
  });

  it('leaves native executables unwrapped even on win32', () => {
    const wrapped = toMcpCommandArgv(['C:\\Users\\me\\codebase-memory-mcp.exe', '--flag']);
    expect(wrapped[0]).toBe('C:\\Users\\me\\codebase-memory-mcp.exe');
  });

  it('normalizes serialized config paths to forward slashes', () => {
    expect(posixJoin('P:\\agent-rules', 'integrations\\x\\y.json')).toBe('P:/agent-rules/integrations/x/y.json');
    expect(posixJoin('C:\\a\\b', 'c.json')).toBe('C:/a/b/c.json');
  });
});
