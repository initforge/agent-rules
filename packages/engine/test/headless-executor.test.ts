import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildInvocation, HeadlessExecutor, detectAgent } from '../src/runner/headless-executor.js';
import { captureDiff, isDocOnly } from '../src/runner/diff.js';
import { findOrphanNodePids, killProcessTree } from './spawn-tree-kill.js';

describe('buildInvocation', () => {
  // R-002: the old adapter's fatal flaw was that nothing asserted what it ran, so
  // `console.log('Worker starting for', id)` passed for a decade of ceremony. These
  // assertions pin the actual argv.
  it('builds a non-interactive claude invocation', () => {
    const { executable, args } = buildInvocation('claude', 'fix the bug', {});

    expect(executable).toBe('claude');
    expect(args).toContain('-p');
    expect(args).toContain('fix the bug');
    expect(args).toEqual(expect.arrayContaining(['--output-format', 'stream-json']));
    expect(args).toEqual(expect.arrayContaining(['--permission-mode', 'acceptEdits']));
  });

  it('honours an explicit permission mode', () => {
    const { args } = buildInvocation('claude', 'x', { permissionMode: 'bypassPermissions' });
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('bypassPermissions');
  });

  it('builds codex, opencode, and mimocode invocations', () => {
    expect(buildInvocation('codex', 'task', {})).toEqual({ executable: 'codex', args: ['exec', 'task'] });
    expect(buildInvocation('opencode', 'task', {})).toEqual({ executable: 'opencode', args: ['run', 'task'] });
    expect(buildInvocation('mimocode', 'task', {})).toEqual({ executable: 'mimo', args: ['run', '--dangerously-skip-permissions', 'task'] });
  });

  it('passes the prompt as one argv entry, never through a shell', () => {
    const { args } = buildInvocation('claude', 'rm -rf / ; echo pwned', {});
    expect(args).toContain('rm -rf / ; echo pwned');
  });
});

describe('detectAgent', () => {
  it('reports an absent CLI as unavailable rather than throwing', async () => {
    const result = await detectAgent('definitely-not-a-real-cli' as never);
    expect(result).toEqual({ available: false });
  });
});

describe('HeadlessExecutor', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-test-'));
  });
  afterEach(async () => {
    // The previous `force: true` hid a real Windows failure: a child that
    // still holds a file handle makes `rmSync` return EPERM, and force=true
    // silently swallows it. Enumerate any node children the test left
    // running and kill them, then retry the rm.
    const orphans = findOrphanNodePids();
    for (const pid of orphans) {
      await killProcessTree(pid);
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  });

  it('spills stdout and stderr to files instead of returning content', async () => {
    // `node` stands in for an agent CLI: the contract under test is process
    // lifecycle and log spilling, not any particular vendor.
    const executor = new HeadlessExecutor({
      kind: 'claude',
      cwd: dir,
      timeoutMs: 30_000,
      logDir: path.join(dir, 'logs'),
      invocationOverride: () => ({
        executable: process.execPath,
        args: ['-e', 'console.log("agent output"); console.error("agent warning");'],
      }),
    });
    const result = await executor.execute({
      id: 'task-log',
      prompt: 'unused',
      verification: [],
      ownedPaths: [],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    // Content lives on disk, not in the return value: an agent transcript can be
    // megabytes, and returning it upward is what tool-output-broker exists to prevent.
    expect(fs.readFileSync(result.stdoutPath, 'utf8')).toContain('agent output');
    expect(fs.readFileSync(result.stderrPath, 'utf8')).toContain('agent warning');
    expect(result).not.toHaveProperty('stdout');
    expect(result.stdoutSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports a non-zero exit code from the agent', async () => {
    const executor = new HeadlessExecutor({
      kind: 'claude',
      cwd: dir,
      timeoutMs: 30_000,
      logDir: path.join(dir, 'logs'),
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', 'process.exit(3)'] }),
    });
    const result = await executor.execute({
      id: 'task-fail',
      prompt: 'unused',
      verification: [],
      ownedPaths: [],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
    });

    expect(result.exitCode).toBe(3);
  });

  it('injects per-task Codex and OpenCode MCP config through environment variables', async () => {
    const executor = new HeadlessExecutor({
      kind: 'opencode',
      cwd: dir,
      timeoutMs: 30_000,
      logDir: path.join(dir, 'logs'),
      invocationOverride: () => ({
        executable: process.execPath,
        args: ['-e', 'console.log(process.env.OPENCODE_CONFIG, process.env.CODEX_HOME)'],
      }),
    });
    const result = await executor.execute({
      id: 'task-mcp-env',
      prompt: 'unused',
      verification: [],
      ownedPaths: [],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
    }, {
      dir: path.join(dir, 'mcp'),
      resolved: ['playwright-mcp'],
      missing: [],
      opencode: { configPath: path.join(dir, 'mcp', 'opencode.json') },
      codex: { configDir: path.join(dir, 'mcp', 'codex'), envVarName: 'CODEX_HOME' },
    });

    expect(fs.readFileSync(result.stdoutPath, 'utf8').trim()).toBe(`${path.join(dir, 'mcp', 'opencode.json')} ${path.join(dir, 'mcp', 'codex')}`);
  });

  it('passes the task id to the child so a transcript can be traced back', async () => {
    const executor = new HeadlessExecutor({
      kind: 'claude',
      cwd: dir,
      timeoutMs: 30_000,
      logDir: path.join(dir, 'logs'),
      invocationOverride: () => ({
        executable: process.execPath,
        args: ['-e', 'console.log(process.env.AGENT_RULES_TASK_ID, process.env.AGENT_RULES_HEADLESS)'],
      }),
    });
    const result = await executor.execute({
      id: 'task-env',
      prompt: 'unused',
      verification: [],
      ownedPaths: [],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
    });

    expect(fs.readFileSync(result.stdoutPath, 'utf8').trim()).toBe('task-env 1');
  });

  // A hung agent must never look like success and stall an overnight queue.
  it('kills an agent that exceeds the deadline and reports 124', async () => {
    const executor = new HeadlessExecutor({
      kind: 'claude',
      cwd: dir,
      timeoutMs: 300,
      logDir: path.join(dir, 'logs'),
      invocationOverride: () => ({
        executable: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 60000)'],
      }),
    });
    const result = await executor.execute({
      id: 'task-timeout',
      prompt: 'unused',
      verification: [],
      ownedPaths: [],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
    });

    expect(result.exitCode).toBe(124);
    expect(result.timedOut).toBe(true);
  });
});

describe('captureDiff', () => {
  let repo: string;

  const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-test-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'initial');
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  // R-006: this is what makes "verification passed but nothing changed" detectable.
  it('returns null for a clean tree', () => {
    expect(captureDiff(repo, [])).toMatchObject({ diffSha256: null, filesChanged: [] });
  });

  it('fingerprints a modification and names the file', () => {
    fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 2;\n');
    const result = captureDiff(repo, []);

    expect(result.diffSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.filesChanged).toEqual(['a.ts']);
  });

  // The old fingerprint hashed whole-file content, so a modify-then-revert produced a
  // different value than the original even though nothing had changed.
  it('returns to null after a change is reverted', () => {
    fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 2;\n');
    expect(captureDiff(repo, []).diffSha256).not.toBeNull();

    fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
    expect(captureDiff(repo, []).diffSha256).toBeNull();
  });

  it('counts an untracked new file as work', () => {
    fs.writeFileSync(path.join(repo, 'b.ts'), 'export const b = 1;\n');
    const result = captureDiff(repo, []);

    expect(result.diffSha256).not.toBeNull();
    expect(result.filesChanged).toContain('b.ts');
  });

  it('scopes the diff to owned paths', () => {
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'owned.ts'), 'export const o = 1;\n');
    fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 99;\n');

    const scoped = captureDiff(repo, ['src']);
    expect(scoped.filesChanged).toEqual(['src/owned.ts']);
    expect(scoped.filesChanged).not.toContain('a.ts');
  });

  it('produces a stable fingerprint for identical content', () => {
    fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 2;\n');
    expect(captureDiff(repo, []).diffSha256).toBe(captureDiff(repo, []).diffSha256);
  });
});

describe('isDocOnly', () => {
  it('is true when every change is documentation', () => {
    expect(isDocOnly(['README.md', 'docs/guide.txt'])).toBe(true);
  });

  it('is false when any source file changed', () => {
    expect(isDocOnly(['README.md', 'src/index.ts'])).toBe(false);
  });

  it('is false for an empty change set (that is "no diff", not "doc only")', () => {
    expect(isDocOnly([])).toBe(false);
  });
});
