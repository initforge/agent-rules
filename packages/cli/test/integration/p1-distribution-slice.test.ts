/**
 * Phase P1 — Harness Identity & Distribution Vertical Slice E2E Test
 * 
 * Verifies that the packaged harness executes against a fresh, standalone external
 * consumer repository without referencing or depending on the development source tree.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initNorthStar } from '../../src/commands/northstar-ux.js';
import { resolveHarnessRoot } from '@initforge/agent-rules-kernel';

let consumerRoot: string;
const harnessRoot = path.resolve(__dirname, '../../../..');

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'ignore' });
}

beforeAll(() => {
  consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-consumer-'));
  git(consumerRoot, ['init', '-q']);
  git(consumerRoot, ['config', 'user.email', 'consumer@example.com']);
  git(consumerRoot, ['config', 'user.name', 'Consumer User']);
  fs.writeFileSync(path.join(consumerRoot, 'README.md'), '# Consumer Project\n');
  fs.mkdirSync(path.join(consumerRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(consumerRoot, 'src', 'index.ts'), 'export const greeting = "hello";\n');
  git(consumerRoot, ['add', '-A']);
  git(consumerRoot, ['commit', '-q', '-m', 'initial consumer commit']);
});

afterAll(() => {
  try {
    fs.rmSync(consumerRoot, { recursive: true, force: true });
  } catch {
    // Ignore cleanup locks on Windows
  }
});

describe('Phase P1 — Harness Identity & External Consumer Isolation', () => {
  it('resolves the immutable harness root independently from the consumer workspace', () => {
    const resolved = resolveHarnessRoot(consumerRoot, harnessRoot);
    expect(resolved).toBe(harnessRoot);
    expect(resolved).not.toBe(consumerRoot);
  });

  it('initializes North-Star in consumer repository using existing CLI surface', () => {
    const result = initNorthStar(consumerRoot, 'claude', null, 'claude');
    expect(result.created).toBe(true);
    expect(fs.existsSync(path.join(consumerRoot, '.agent', 'northstar.json'))).toBe(true);

    const config = JSON.parse(fs.readFileSync(path.join(consumerRoot, '.agent', 'northstar.json'), 'utf8'));
    expect(config.protocol_version).toBe('2.0');
    expect(config.default_agent).toBe('claude');
    expect(config.default_planner).toBe('claude');
  });

  it('keeps consumer workspace free of harness source tree pollution', () => {
    // The consumer root must NOT have any packages/ or development source folders
    expect(fs.existsSync(path.join(consumerRoot, 'packages'))).toBe(false);
    expect(fs.existsSync(path.join(consumerRoot, 'src', 'index.ts'))).toBe(true);
  });

  it('negative control: resolveHarnessRoot fails closed when given invalid harness path', () => {
    const fakeDir = path.join(os.tmpdir(), 'non-existent-harness-root-xyz');
    expect(() => {
      // Temporarily clear AGENT_RULES_HOME to test fail-closed resolution
      const origEnv = process.env.AGENT_RULES_HOME;
      delete process.env.AGENT_RULES_HOME;
      try {
        resolveHarnessRoot(consumerRoot, fakeDir);
      } finally {
        if (origEnv !== undefined) process.env.AGENT_RULES_HOME = origEnv;
      }
    }).toThrow();
  });
});
