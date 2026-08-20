/**
 * evals/mcp-integration.test.ts — Deterministic static tests for accepted
 * MCP integration candidate 057880a5+a91ceb8.
 *
 * Covers: registry entries, adapter parse (JSON + TOML), uninstall
 * scripts contain no global npm cache clean.
 *
 * No network, no deps beyond stdlib + vitest.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(ROOT, 'integrations', 'registry.json');
const INTEGRATIONS_DIR = path.join(ROOT, 'integrations', 'required');

const TARGET_IDS = ['playwright-mcp', 'chrome-devtools-mcp'] as const;
type TargetId = typeof TARGET_IDS[number];

function readJson<T = unknown>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

function readText(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

/** Minimal TOML parser for flat key = "value" / key = [array] lines. */
function parseToml(raw: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1);
      result[key] = inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
    } else {
      result[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return result;
}

describe('MCP integration candidate 057880a5+a91ceb8 — static tests', () => {
  let registry: { integrations: Array<{ id: string }> };

  beforeAll(() => {
    registry = readJson(REGISTRY) as { integrations: Array<{ id: string }> };
  });

  for (const id of TARGET_IDS) {
    describe(`registry entry: ${id}`, () => {
      it('exists in registry.json', () => {
        const entries = registry.integrations;
        expect(entries).toBeDefined();
        expect(entries.some((e) => e.id === id)).toBe(true);
      });

      it('has kind "mcp" and policy "required"', () => {
        const entry = registry.integrations.find((e) => e.id === id);
        expect(entry).toBeDefined();
        // cast to access dynamic keys since registry is loosely typed
        const entryAny = entry as Record<string, unknown>;
        expect(entryAny.kind).toBe('mcp');
        expect(entryAny.policy).toBe('required');
      });

      it('has install/uninstall/verify script paths that resolve to real files', () => {
        const entry = registry.integrations.find((e) => e.id === id);
        expect(entry).toBeDefined();
        const entryAny = entry as Record<string, { install?: { script?: string; verify?: string; uninstall?: string } }>;
        const install = entryAny.install;
        expect(install).toBeDefined();
        for (const key of ['script', 'verify', 'uninstall']) {
          const scriptPath = install?.[key as keyof typeof install];
          expect(scriptPath).toBeDefined();
          expect(fs.existsSync(path.join(ROOT, scriptPath as string))).toBe(true);
        }
      });
    });

    describe(`adapter parse: ${id}`, () => {
      const adapterDir = path.join(INTEGRATIONS_DIR, id, 'adapters');

      it('has adapters directory', () => {
        expect(fs.existsSync(adapterDir)).toBe(true);
      });

      it('every adapter file parses without error', () => {
        const files = fs.readdirSync(adapterDir);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
          const fullPath = path.join(adapterDir, file);
          const content = readText(fullPath);
          if (file.endsWith('.json')) {
            expect(() => JSON.parse(content)).not.toThrow();
            const parsed = JSON.parse(content) as Record<string, unknown>;
            expect(parsed.mcpServers).toBeDefined();
          } else if (file.endsWith('.toml')) {
            const parsed = parseToml(content);
            expect(Object.keys(parsed).length).toBeGreaterThan(0);
            // at minimum, must have a command key
            expect(parsed.command).toBeDefined();
          }
        }
      });

      it('all JSON adapters have mcpServers with non-empty args', () => {
        const files = fs.readdirSync(adapterDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const parsed = readJson<{ mcpServers: Record<string, { command: string; args: string[] }> }>(
            path.join(adapterDir, file),
          );
          for (const [, server] of Object.entries(parsed.mcpServers)) {
            expect(server.command).toBeDefined();
            expect(Array.isArray(server.args)).toBe(true);
            expect(server.args.length).toBeGreaterThan(0);
          }
        }
      });
    });

    describe(`uninstall no global cache clean: ${id}`, () => {
      const uninstallPath = path.join(INTEGRATIONS_DIR, id, 'uninstall.ps1');

      it('uninstall.ps1 exists', () => {
        expect(fs.existsSync(uninstallPath)).toBe(true);
      });

      it('uninstall.ps1 does not contain npm cache clean', () => {
        const content = readText(uninstallPath);
        expect(content).not.toContain('npm cache clean');
      });

      it('uninstall.ps1 does not contain global cache removal', () => {
        const content = readText(uninstallPath);
        expect(content).not.toContain('cache clean --force');
      });
    });
  }
});
