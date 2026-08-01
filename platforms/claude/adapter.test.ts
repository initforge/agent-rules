import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, chmod, mkdir } from 'node:fs/promises';
import {
  claudeAdapter,
  HOST_UNOBSERVABLE,
  parseModelEvidence,
  assertPathInsideRoot,
} from './adapter.js';

const execFileAsync = promisify(execFile);

let fakeBinDir: string;
let emptyPathDir: string;
let homeDir: string;
let repoDir: string;
let savedPath: string | undefined;
let savedHome: string | undefined;

async function fakeBinary(failDoctor: boolean): Promise<void> {
  const script = `#!/usr/bin/env bash
LOG="\${FAKE_CLAUDE_LOG:-}"
if [ -n "$LOG" ]; then printf '%s\\n' "$*" >> "$LOG"; fi
case "$1" in
  --version) echo "2.1.220 (Claude Code)"; exit 0;;
  doctor)
    if [ "\${FAKE_DOCTOR_FAIL:-0}" = "1" ]; then
      echo "Claude Code doctor"
      echo "Found installation issues: broken config"
      exit 1
    fi
    echo "Claude Code doctor"
    echo "No installation issues found."
    exit 0;;
  install) echo "Installing Claude Code native build: OK"; exit 0;;
  update) echo "Claude Code is up to date."; exit 0;;
  -p)
    echo "{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"session_id\\":\\"sess\\",\\"model\\":\\"\${FAKE_INIT_MODEL}\\"}"
    echo "{\\"type\\":\\"assistant\\",\\"message\\":{\\"id\\":\\"m1\\",\\"model\\":\\"\${FAKE_MSG_MODEL}\\",\\"role\\":\\"assistant\\"},\\"content\\":[{\\"type\\":\\"text\\",\\"text\\":\\"PROBE_OK\\"}]}"
    if [ "\${FAKE_DISPATCH_FAIL:-0}" = "1" ]; then
      echo "{\\"type\\":\\"result\\",\\"is_error\\":true,\\"result\\":\\"failed\\"}"
    else
      echo "{\\"type\\":\\"result\\",\\"is_error\\":false,\\"result\\":\\"PROBE_OK\\"}"
    fi
    exit 0;;
  *) echo "unexpected args: $*" >&2; exit 2;;
esac
`;
  await writeFile(path.join(fakeBinDir, 'claude'), script, { mode: 0o755 });
  await chmod(path.join(fakeBinDir, 'claude'), 0o755);
}

async function initGitRepo(dir: string): Promise<void> {
  await execFileAsync('git', ['init', '-q'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'c8-test@example.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'C8 Test'], { cwd: dir });
  await writeFile(path.join(dir, 'README.md'), '# fixture\n');
  await execFileAsync('git', ['add', '.'], { cwd: dir });
  await execFileAsync('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir });
}

async function repoHead(): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
  return stdout.trim();
}

beforeEach(async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'c8-claude-test-'));
  fakeBinDir = path.join(base, 'bin');
  emptyPathDir = path.join(base, 'empty');
  homeDir = path.join(base, 'home');
  repoDir = path.join(base, 'repo');
  await mkdir(fakeBinDir);
  await mkdir(emptyPathDir);
  await mkdir(homeDir);
  await mkdir(repoDir);
  await fakeBinary(false);
  await initGitRepo(repoDir);
  savedPath = process.env.PATH;
  savedHome = process.env.CLAUDE_CONFIG_DIR;
  process.env.PATH = `${fakeBinDir}${path.delimiter}${savedPath}`;
  process.env.CLAUDE_CONFIG_DIR = homeDir;
  process.env.FAKE_CLAUDE_LOG = path.join(base, 'args.log');
});

afterEach(() => {
  if (savedPath !== undefined) process.env.PATH = savedPath;
  else delete process.env.PATH;
  if (savedHome !== undefined) process.env.CLAUDE_CONFIG_DIR = savedHome;
  else delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.FAKE_CLAUDE_LOG;
  delete process.env.FAKE_DOCTOR_FAIL;
  delete process.env.FAKE_DISPATCH_FAIL;
  delete process.env.FAKE_INIT_MODEL;
  delete process.env.FAKE_MSG_MODEL;
});

function argsLog(): string[] {
  const log = process.env.FAKE_CLAUDE_LOG!;
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean) : [];
}

describe('claude adapter — detect', () => {
  it('1. detect reports MISSING honestly when claude absent and home absent', async () => {
    process.env.PATH = emptyPathDir;
    process.env.CLAUDE_CONFIG_DIR = path.join(emptyPathDir, 'nohome');
    const result = await claudeAdapter.detect();
    expect(result.installed).toBe(false);
    expect(result.version).toBeUndefined();
  });

  it('2. detect finds fake claude binary with parsed version', async () => {
    const result = await claudeAdapter.detect();
    expect(result.installed).toBe(true);
    expect(result.version).toContain('2.1.220');
    expect(result.path).toBe(path.join(fakeBinDir, 'claude'));
  });

  it('3. version() returns the claude version string', async () => {
    const version = await claudeAdapter.version();
    expect(version).toContain('2.1.220');
  });
});

describe('claude adapter — lifecycle', () => {
  it('4. doctor passes on healthy native output and fails on installation issues', async () => {
    const ok = await claudeAdapter.doctor();
    expect(ok.ok).toBe(true);
    expect(ok.detail).toContain('No installation issues found.');

    process.env.FAKE_DOCTOR_FAIL = '1';
    const bad = await claudeAdapter.doctor();
    expect(bad.ok).toBe(false);
  });

  it('5. install and update call the real native commands', async () => {
    const installed = await claudeAdapter.install();
    expect(installed.ok).toBe(true);
    const updated = await claudeAdapter.update();
    expect(updated.ok).toBe(true);
  });

  it('6. render/stage/activate manage runtime capsule under CLAUDE_CONFIG_DIR', async () => {
    const rendered = await claudeAdapter.render({ hello: 'world' });
    expect(rendered).toBe(path.join(homeDir, 'rules', 'agent-rules-context.md'));
    expect(fs.existsSync(rendered)).toBe(true);
    expect(JSON.parse(fs.readFileSync(rendered, 'utf-8'))).toEqual({ hello: 'world' });

    const staged = await claudeAdapter.stage({ task: 'c8' });
    expect(fs.existsSync(staged)).toBe(true);
    await claudeAdapter.activate();
    expect(fs.existsSync(path.join(homeDir, 'active-capsule.json'))).toBe(true);
    expect(fs.existsSync(staged)).toBe(false);
  });

  it('7. probe returns version detail from the native binary', async () => {
    const result = await claudeAdapter.probe();
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('2.1.220');
  });
});

describe('claude adapter — worktree isolation (fail closed)', () => {
  it('8. dispatch with cwd escaping allowedRoot rejects', async () => {
    await expect(
      claudeAdapter.nativeDispatch({ prompt: 'x', cwd: '/etc', allowedRoot: repoDir }),
    ).rejects.toThrow(/isolation rejection/);
  });

  it('9. dispatch with symlink escape rejects', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'c8-outside-'));
    const link = path.join(repoDir, 'escape-link');
    fs.symlinkSync(outside, link);
    await expect(
      claudeAdapter.nativeDispatch({ prompt: 'x', cwd: link, allowedRoot: repoDir }),
    ).rejects.toThrow(/isolation rejection/);
  });

  it('10. unsafe worktree names reject before spawn', async () => {
    await expect(
      claudeAdapter.nativeDispatch({ prompt: 'x', cwd: repoDir, allowedRoot: repoDir, worktree: '../../evil' }),
    ).rejects.toThrow(/unsafe worktree name/);
    await expect(
      claudeAdapter.nativeDispatch({ prompt: 'x', cwd: repoDir, allowedRoot: repoDir, worktree: '-flag' }),
    ).rejects.toThrow(/unsafe worktree name/);
    // Only the version probe may have run; the unsafe worktree must never reach the child.
    expect(argsLog().some((line) => line.includes('--worktree'))).toBe(false);
  });

  it('11. safe dispatch inside root passes --worktree to the native child', async () => {
    const receipt = await claudeAdapter.nativeDispatch({
      prompt: 'do the thing',
      cwd: repoDir,
      allowedRoot: repoDir,
      worktree: 'c8-isolated',
      model: 'sonnet',
    });
    expect(receipt.ok).toBe(true);
    expect(receipt.worktree).toEqual({ isolated: true, name: 'c8-isolated' });
    const args = argsLog();
    expect(args.some((line) => line.includes('--worktree') && line.includes('c8-isolated'))).toBe(true);
    expect(args.some((line) => line.includes('--model') && line.includes('sonnet'))).toBe(true);
  });
});

describe('claude adapter — model recording', () => {
  it('12. requested/resolved/observed recorded from real stream-json output', async () => {
    process.env.FAKE_INIT_MODEL = 'claude-sonnet-4-6';
    process.env.FAKE_MSG_MODEL = 'claude-sonnet-4-6';
    const receipt = await claudeAdapter.nativeDispatch({
      prompt: 'hi',
      cwd: repoDir,
      allowedRoot: repoDir,
      model: 'sonnet',
    });
    expect(receipt.model.requested).toBe('sonnet');
    expect(receipt.model.resolved).toBe('claude-sonnet-4-6');
    expect(receipt.model.observed).toBe('claude-sonnet-4-6');
    expect(receipt.commitSha).toBe(await repoHead());
    expect(receipt.result).toBe('PROBE_OK');
  });

  it('13. HOST_UNOBSERVABLE used honestly when host exposes no model metadata', async () => {
    process.env.FAKE_INIT_MODEL = '';
    process.env.FAKE_MSG_MODEL = '';
    const receipt = await claudeAdapter.nativeDispatch({
      prompt: 'hi',
      cwd: repoDir,
      allowedRoot: repoDir,
    });
    expect(receipt.model).toEqual({
      requested: HOST_UNOBSERVABLE,
      resolved: HOST_UNOBSERVABLE,
      observed: HOST_UNOBSERVABLE,
    });
  });

  it('14. synthetic "<synthetic>" assistant model is never recorded as observed', async () => {
    process.env.FAKE_INIT_MODEL = '';
    process.env.FAKE_MSG_MODEL = '<synthetic>';
    const receipt = await claudeAdapter.nativeDispatch({
      prompt: 'hi',
      cwd: repoDir,
      allowedRoot: repoDir,
    });
    expect(receipt.model.observed).toBe(HOST_UNOBSERVABLE);
  });

  it('15. failed dispatch records ok:false with honest result', async () => {
    process.env.FAKE_DISPATCH_FAIL = '1';
    const receipt = await claudeAdapter.nativeDispatch({ prompt: 'x', cwd: repoDir, allowedRoot: repoDir });
    expect(receipt.ok).toBe(false);
    expect(receipt.result).toBe('failed');
    expect(receipt.model.observed).toBe(HOST_UNOBSERVABLE);
  });

  it('16. parseModelEvidence keeps HOST_UNOBSERVABLE for empty/non-JSON streams', () => {
    const evidence = parseModelEvidence('not json at all', 'sonnet');
    expect(evidence).toEqual({ requested: 'sonnet', resolved: HOST_UNOBSERVABLE, observed: HOST_UNOBSERVABLE });
  });
});

describe('claude adapter — receipt and attestation binding exact HEAD', () => {
  it('17. nativeAttestation fails closed on HEAD mismatch and on missing repo', async () => {
    const head = await repoHead();
    await expect(
      claudeAdapter.nativeAttestation({ headSha: '0'.repeat(40), cwd: repoDir }),
    ).rejects.toThrow(/HEAD mismatch/);

    const nonRepo = await mkdtemp(path.join(os.tmpdir(), 'c8-nonrepo-'));
    await expect(
      claudeAdapter.nativeAttestation({ headSha: head, cwd: nonRepo }),
    ).rejects.toThrow(/no git HEAD/);
  });

  it('18. nativeAttestation binds the exact HEAD and reflects receipt evidence', async () => {
    process.env.FAKE_INIT_MODEL = 'claude-sonnet-4-6';
    process.env.FAKE_MSG_MODEL = 'claude-sonnet-4-6';
    const head = await repoHead();
    const receipt = await claudeAdapter.nativeDispatch({
      prompt: 'hi',
      cwd: repoDir,
      allowedRoot: repoDir,
      model: 'sonnet',
    });
    const record = await claudeAdapter.nativeAttestation({
      headSha: head,
      cwd: repoDir,
      receipt,
      contractSetSha256: 'abc',
      evidenceRef: 'ev/1',
    });
    expect(record.host).toBe('claude');
    expect(record.commitSha).toBe(head);
    expect(record.capabilityStatus).toBe('OBSERVED');
    expect(record.requestedModel).toBe('sonnet');
    expect(record.observedModel).toBe('claude-sonnet-4-6');
    expect(record.contractSetSha256).toBe('abc');

    const pending = await claudeAdapter.nativeAttestation({ headSha: head, cwd: repoDir });
    expect(pending.capabilityStatus).toBe('WAITING_EXTERNAL');
    expect(pending.observedModel).toBe(HOST_UNOBSERVABLE);
  });

  it('19. assertPathInsideRoot rejects traversal but accepts subpaths', () => {
    expect(() => assertPathInsideRoot('/etc/passwd', repoDir)).toThrow();
    expect(() => assertPathInsideRoot(path.join(repoDir, '..', 'x'), repoDir)).toThrow();
    expect(() => assertPathInsideRoot(path.join(repoDir, 'sub'), repoDir)).toBeTruthy();
  });
});

describe('claude adapter — stop/checkpoint/resume', () => {
  it('20. stop on unknown session reports no active child', async () => {
    const result = await claudeAdapter.stop('00000000-0000-4000-8000-000000000000');
    expect(result.ok).toBe(false);
  });

  it('21. checkpoints list persisted sessions under CLAUDE_CONFIG_DIR/projects', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    const slugDir = path.join(homeDir, 'projects', 'my-slug');
    await mkdir(slugDir, { recursive: true });
    await writeFile(path.join(slugDir, `${sessionId}.jsonl`), '{"x":1}\n');
    const checkpoints = await claudeAdapter.checkpoints();
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
    expect(checkpoints[0].sessionId).toBe(sessionId);
    expect(checkpoints[0].path).toContain('my-slug');
  });

  it('22. resume passes --resume with the persisted session id', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000002';
    const receipt = await claudeAdapter.resume({ sessionId, prompt: 'continue', cwd: repoDir });
    expect(receipt.ok).toBe(true);
    expect(receipt.sessionId).toBe(sessionId);
    expect(argsLog().some((line) => line.includes('--resume') && line.includes(sessionId))).toBe(true);
  });
});
