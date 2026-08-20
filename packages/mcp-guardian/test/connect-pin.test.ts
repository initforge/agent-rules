/**
 * connect bridge provider-bin resolution: the projected MCP command must
 * resolve the registry-pinned binary from the exact-version npx cache —
 * never @latest, never a random cache selection, never an unapproved install.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePinnedBin } from '../src/bin/connect.js';

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function fakeNpxCache(entries: Array<{ hash: string; binName: string; pkgName: string; version: string }>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npx-cache-'));
  tmpDirs.push(root);
  for (const e of entries) {
    const dir = path.join(root, '.npm', '_npx', e.hash, 'node_modules');
    fs.mkdirSync(path.join(dir, '.bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.bin', e.binName), '#!/usr/bin/env node\n');
    fs.mkdirSync(path.join(dir, ...e.pkgName.split('/')), { recursive: true });
    fs.writeFileSync(path.join(dir, ...e.pkgName.split('/'), 'package.json'), JSON.stringify({ name: e.pkgName, version: e.version }));
  }
  return root;
}

describe('resolvePinnedBin', () => {
  it('resolves the exact-version npx cache entry for a scoped package (@playwright/mcp)', () => {
    const root = fakeNpxCache([
      { hash: 'aaa', binName: 'playwright-mcp', pkgName: '@playwright/mcp', version: '0.0.78' },
    ]);
    const old = process.env.HOME;
    process.env.HOME = root.replace(/\/$/, '');
    try {
      const bin = resolvePinnedBin({ package: '@playwright/mcp', version: '0.0.78', commandName: 'playwright-mcp' });
      expect(bin).toBe(path.join(root, '.npm', '_npx', 'aaa', 'node_modules', '.bin', 'playwright-mcp'));
    } finally {
      if (old === undefined) delete process.env.HOME;
      else process.env.HOME = old;
    }
  });

  it('rejects a version mismatch in the cache (never a random cache selection)', () => {
    const root = fakeNpxCache([
      { hash: 'bbb', binName: 'context7', pkgName: '@upstash/context7-mcp', version: '3.2.5' },
    ]);
    const old = process.env.HOME;
    process.env.HOME = root;
    try {
      const bin = resolvePinnedBin({ package: '@upstash/context7-mcp', version: '9.9.9', commandName: 'context7' });
      expect(bin).toBeNull();
    } finally {
      if (old === undefined) delete process.env.HOME;
      else process.env.HOME = old;
    }
  });

  it('returns null when no pinned version is present (no @latest fallback)', () => {
    expect(resolvePinnedBin({ package: 'x', version: null, commandName: 'x' })).toBeNull();
    expect(resolvePinnedBin({ package: 'x', version: 'latest', commandName: 'x' })).toBeNull();
  });
});
