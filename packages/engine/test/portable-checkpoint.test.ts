import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createPortableCheckpoint,
  verifyAndRestoreCheckpoint,
  type PortableCheckpoint,
} from '../src/checkpoint-resume.js';
import { TaskQueue } from '../src/runner/queue.js';
import { resolveGitPath } from '../src/runner/platform.js';

describe('portable-checkpoint integration tests', () => {
  const testDir = path.join(os.tmpdir(), `checkpoint-test-${Date.now()}`).replace(/\\/g, '/');
  const git = resolveGitPath();

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    if (git) {
      spawnSync(git, ['init'], { cwd: testDir });
      spawnSync(git, ['config', 'user.name', 'Test'], { cwd: testDir });
      spawnSync(git, ['config', 'user.email', 'test@test.com'], { cwd: testDir });
      fs.writeFileSync(path.join(testDir, '.gitattributes'), '* text eol=lf\n');
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Test Repo\n');
      spawnSync(git, ['add', '.gitattributes', 'README.md'], { cwd: testDir });
      spawnSync(git, ['commit', '-m', 'initial commit'], { cwd: testDir });
    }
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates and restores a portable checkpoint successfully', () => {
    if (!git) return; // Skip if git is not available

    // Initialize mock .agent plan folder, queue and journal
    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.mkdirSync(path.join(planDir, 'queue', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'queue', 'active'), { recursive: true });
    
    // Add active running task
    const mockTask = {
      id: 'task-001',
      prompt: 'Verify code',
      verification: ['npm test'],
      ownedPaths: ['src/'],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    fs.writeFileSync(path.join(planDir, 'queue', 'active', 'task-001.json'), JSON.stringify(mockTask, null, 2) + '\n');
    
    // Write mock journal
    fs.writeFileSync(path.join(planDir, 'journal.jsonl'), JSON.stringify({ host: 'old-host', type: 'RUN_START' }) + '\n');

    // Create untracked file in ownedPaths
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'index.js'), 'console.log("hello");\n');

    const cursor = {
      planId: 'plan-001',
      runId: 'run-001',
      epoch: 0,
      taskId: 'task-001',
      attemptCount: 1,
      completedTaskIds: [],
      failedTaskIds: [],
      skippedTaskIds: [],
    };

    const capsule = {
      planId: 'plan-001',
      runId: 'run-001',
      epoch: 0,
      decisions: [],
      pendingClaims: ['task-001'],
      pendingEvidence: [],
      activeWorkers: [],
      mode: 'max-repair-depth=3',
    };

    const portable = createPortableCheckpoint('manual', cursor, capsule, testDir, ['src/']);

    expect(portable.schema).toBe('harness/portable-checkpoint');
    expect(portable.gitHead).toBeTruthy();
    expect(portable.untrackedFiles['src/index.js']).toBeDefined();
    expect(portable.untrackedFiles['.agent/plans/plan-001/queue/active/task-001.json']).toBeDefined();

    // Now test verify and restore on a simulated "fresh machine" (clean test directory)
    const freshDir = path.join(os.tmpdir(), `checkpoint-fresh-${Date.now()}`).replace(/\\/g, '/');
    fs.mkdirSync(freshDir, { recursive: true });
    spawnSync(git, ['clone', testDir, '.'], { cwd: freshDir });

    const restoreResult = verifyAndRestoreCheckpoint(portable, freshDir);
    expect(restoreResult.success, restoreResult.error).toBe(true);
    expect(restoreResult.interruptedTaskCount).toBe(1);

    // Verify orphaned active task was converted to interrupted
    const restoredTaskFile = path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'interrupted', 'task-001.json');
    expect(fs.existsSync(restoredTaskFile)).toBe(true);
    const restoredTask = JSON.parse(fs.readFileSync(restoredTaskFile, 'utf8'));
    expect(restoredTask.reason).toBe('INTERRUPTED');

    // Verify machine-bound host was invalidated in journal
    const restoredJournalFile = path.join(freshDir, '.agent', 'plans', 'plan-001', 'journal.jsonl');
    const journalContent = fs.readFileSync(restoredJournalFile, 'utf8');
    expect(journalContent).toContain('invalidated-cross-machine-host');

    // Verify untracked files are correctly restored
    const restoredIndex = path.join(freshDir, 'src', 'index.js');
    expect(fs.existsSync(restoredIndex)).toBe(true);
    expect(fs.readFileSync(restoredIndex, 'utf8')).toBe('console.log("hello");\n');

    // A retry after the acknowledgement boundary must be idempotent. The
    // receipt binds the exact checkpoint hash to the observable post-restore
    // state, so the active task is not resurrected and no second interruption
    // is reported.
    const retryResult = verifyAndRestoreCheckpoint(portable, freshDir);
    expect(retryResult.success, retryResult.error).toBe(true);
    expect(retryResult.interruptedTaskCount).toBe(0);
    expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'active', 'task-001.json'))).toBe(false);
    expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'interrupted', 'task-001.json'))).toBe(true);
    expect(fs.existsSync(path.join(freshDir, '.agent', 'checkpoint-receipts', `${portable.checkpointId}.json`))).toBe(true);

    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it('does not duplicate tracked .agent files that are already represented by git diff', () => {
    if (!git) return;

    const trackedAgentFile = path.join(testDir, '.agent', 'tracked-state.json');
    const untrackedAgentFile = path.join(testDir, '.agent', 'untracked-state.json');
    fs.mkdirSync(path.dirname(trackedAgentFile), { recursive: true });
    fs.writeFileSync(trackedAgentFile, '{"revision":1}\n');
    spawnSync(git, ['add', '-f', '.agent/tracked-state.json'], { cwd: testDir });
    spawnSync(git, ['commit', '-m', 'track agent state'], { cwd: testDir });
    fs.writeFileSync(trackedAgentFile, '{"revision":2}\n');
    fs.writeFileSync(untrackedAgentFile, '{"pending":true}\n');

    const cursor = { planId: 'plan-001', runId: 'run-001', epoch: 0, taskId: 'task-001', attemptCount: 1, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] };
    const capsule = { planId: 'plan-001', runId: 'run-001', epoch: 0, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'test' };
    const portable = createPortableCheckpoint('manual', cursor, capsule, testDir, []);

    expect(portable.untrackedFiles['.agent/tracked-state.json']).toBeUndefined();
    expect(portable.untrackedFiles['.agent/untracked-state.json']).toBeDefined();

    const freshDir = path.join(os.tmpdir(), `checkpoint-tracked-agent-fresh-${Date.now()}`).replace(/\\/g, '/');
    fs.mkdirSync(freshDir, { recursive: true });
    spawnSync(git, ['clone', testDir, '.'], { cwd: freshDir });
    const restoreResult = verifyAndRestoreCheckpoint(portable, freshDir);
    expect(restoreResult.success, restoreResult.error).toBe(true);
    expect(fs.readFileSync(path.join(freshDir, '.agent', 'tracked-state.json'), 'utf8').replace(/\r\n/g, '\n')).toBe('{"revision":2}\n');
    expect(fs.readFileSync(path.join(freshDir, '.agent', 'untracked-state.json'), 'utf8')).toBe('{"pending":true}\n');
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it('fails closed on secret inclusion during creation', () => {
    if (!git) return;

    const cursor = { planId: 'plan-001', runId: 'run-001', epoch: 0, taskId: 'task-001', attemptCount: 1, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] };
    const capsule = { planId: 'plan-001', runId: 'run-001', epoch: 0, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'test' };

    // Create untracked file with API key
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'key.js'), 'const API_KEY = "abcdef1234567890abcdef1234567890";\n');

    expect(() => {
      createPortableCheckpoint('manual', cursor, capsule, testDir, ['src/']);
    }).toThrow(/Secret leakage detected/);
  });

  it('fails closed on wrong base git commit during restore', () => {
    if (!git) return;

    const cursor = { planId: 'plan-001', runId: 'run-001', epoch: 0, taskId: 'task-001', attemptCount: 1, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] };
    const capsule = { planId: 'plan-001', runId: 'run-001', epoch: 0, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'test' };

    const portable = createPortableCheckpoint('manual', cursor, capsule, testDir, []);

    // Create another commit on the local workspace to mismatch HEAD
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Modified Repo\n');
    spawnSync(git, ['add', 'README.md'], { cwd: testDir });
    spawnSync(git, ['commit', '-m', 'another commit'], { cwd: testDir });

    const restoreResult = verifyAndRestoreCheckpoint(portable, testDir);
    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('Wrong base commit');
  });

  it('fails closed on ambiguous dirty files during restore', () => {
    if (!git) return;

    const cursor = { planId: 'plan-001', runId: 'run-001', epoch: 0, taskId: 'task-001', attemptCount: 1, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] };
    const capsule = { planId: 'plan-001', runId: 'run-001', epoch: 0, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'test' };

    const portable = createPortableCheckpoint('manual', cursor, capsule, testDir, []);

    // Introduce local dirty file in the target workspace that is NOT in the checkpoint
    fs.writeFileSync(path.join(testDir, 'dirty.js'), 'console.log("dirty");\n');

    const restoreResult = verifyAndRestoreCheckpoint(portable, testDir);
    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('Ambiguous dirty files');
  });

  it('fails closed when the resume toolchain changed', () => {
    if (!git) return;

    const cursor = { planId: 'plan-001', runId: 'run-001', epoch: 0, taskId: 'task-001', attemptCount: 1, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] };
    const capsule = { planId: 'plan-001', runId: 'run-001', epoch: 0, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'test' };
    const portable = createPortableCheckpoint('manual', cursor, capsule, testDir, []);
    const tampered = {
      ...portable,
      environmentFingerprint: {
        ...portable.environmentFingerprint,
        nodeVersion: 'v99.0.0',
      },
    };
    const manifest = {
      schema: tampered.schema,
      version: tampered.version,
      checkpointId: tampered.checkpointId,
      trigger: tampered.trigger,
      cursor: tampered.cursor,
      capsule: tampered.capsule,
      gitHead: tampered.gitHead,
      gitDiff: tampered.gitDiff,
      untrackedFiles: tampered.untrackedFiles,
      environmentFingerprint: tampered.environmentFingerprint,
      payloadHashes: tampered.payloadHashes,
    };
    const finalCheckpoint: PortableCheckpoint = {
      ...tampered,
      checkpointSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    };

    const restoreResult = verifyAndRestoreCheckpoint(finalCheckpoint, testDir);
    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('Changed toolchain');
  });

  it('fails closed when a payload hash has no file', () => {
    if (!git) return;

    const cursor = { planId: 'plan-001', runId: 'run-001', epoch: 0, taskId: 'task-001', attemptCount: 1, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] };
    const capsule = { planId: 'plan-001', runId: 'run-001', epoch: 0, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'test' };
    const portable = createPortableCheckpoint('manual', cursor, capsule, testDir, []);
    const tampered = {
      ...portable,
      payloadHashes: {
        ...portable.payloadHashes,
        'missing.txt': 'a'.repeat(64),
      },
    };
    const manifest = {
      schema: tampered.schema,
      version: tampered.version,
      checkpointId: tampered.checkpointId,
      trigger: tampered.trigger,
      cursor: tampered.cursor,
      capsule: tampered.capsule,
      gitHead: tampered.gitHead,
      gitDiff: tampered.gitDiff,
      untrackedFiles: tampered.untrackedFiles,
      environmentFingerprint: tampered.environmentFingerprint,
      payloadHashes: tampered.payloadHashes,
    };
    const finalCheckpoint: PortableCheckpoint = {
      ...tampered,
      checkpointSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    };

    const restoreResult = verifyAndRestoreCheckpoint(finalCheckpoint, testDir);
    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('Payload hash has no corresponding file');
  });

  it('restores through an independent process in a second workspace and retries idempotently', () => {
    if (!git) return;

    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.mkdirSync(path.join(planDir, 'queue', 'active'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'queue', 'ready'), { recursive: true });
    fs.writeFileSync(path.join(planDir, 'queue', 'active', 'task-001.json'), JSON.stringify({
      id: 'task-001',
      status: 'active',
      prompt: 'Resume on a fresh workspace',
      verification: ['npm test'],
      ownedPaths: ['src/'],
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(planDir, 'journal.jsonl'), JSON.stringify({
      host: 'source-machine',
      type: 'RUN_START',
      taskId: 'task-001',
    }) + '\n');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'feature.js'), 'export const resumed = true;\n');

    const cursor = {
      planId: 'plan-001',
      runId: 'run-001',
      epoch: 0,
      taskId: 'task-001',
      attemptCount: 1,
      completedTaskIds: [],
      failedTaskIds: [],
      skippedTaskIds: [],
    };
    const capsule = {
      planId: 'plan-001',
      runId: 'run-001',
      epoch: 0,
      decisions: [],
      pendingClaims: ['task-001'],
      pendingEvidence: [],
      activeWorkers: ['worker-001'],
      mode: 'fresh-workspace-transfer',
    };
    const portable = createPortableCheckpoint('crash_recovery', cursor, capsule, testDir, ['src/']);
    const checkpointFile = path.join(os.tmpdir(), `portable-checkpoint-${Date.now()}.json`);
    const freshDir = path.join(os.tmpdir(), `checkpoint-independent-${Date.now()}`).replace(/\\/g, '/');
    fs.writeFileSync(checkpointFile, JSON.stringify(portable) + '\n');
    fs.mkdirSync(freshDir, { recursive: true });
    const clone = spawnSync(git, ['clone', testDir, '.'], { cwd: freshDir, encoding: 'utf8' });
    expect(clone.status, clone.stderr).toBe(0);

    const kernelModule = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../kernel/dist/state/checkpoint-resume.js');
    const childScript = [
      "import fs from 'node:fs';",
      "import { pathToFileURL } from 'node:url';",
      "const [modulePath, checkpointPath, workspace] = process.argv.slice(1);",
      "const { verifyAndRestoreCheckpoint } = await import(pathToFileURL(modulePath).href);",
      "const result = verifyAndRestoreCheckpoint(JSON.parse(fs.readFileSync(checkpointPath, 'utf8')), workspace);",
      "process.stdout.write(JSON.stringify(result));",
      "if (!result.success) process.exit(1);",
    ].join('\n');
    const runIndependentRestore = () => spawnSync(
      process.execPath,
      ['--input-type=module', '-e', childScript, kernelModule, checkpointFile, freshDir],
      { cwd: freshDir, encoding: 'utf8' },
    );

    try {
      const first = runIndependentRestore();
      expect(first.status, first.stderr).toBe(0);
      const firstResult = JSON.parse(first.stdout) as { success: boolean; interruptedTaskCount: number };
      expect(firstResult).toEqual({ success: true, interruptedTaskCount: 1 });
      expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'active', 'task-001.json'))).toBe(false);
      expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'interrupted', 'task-001.json'))).toBe(true);
      expect(fs.readFileSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'journal.jsonl'), 'utf8')).toContain('invalidated-cross-machine-host');

      const second = runIndependentRestore();
      expect(second.status, second.stderr).toBe(0);
      const secondResult = JSON.parse(second.stdout) as { success: boolean; interruptedTaskCount: number };
      expect(secondResult).toEqual({ success: true, interruptedTaskCount: 0 });
      expect(fs.existsSync(path.join(freshDir, '.agent', 'checkpoint-receipts', `${portable.checkpointId}.json`))).toBe(true);
    } finally {
      fs.rmSync(checkpointFile, { force: true });
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  });

  it('keeps concurrent restore workers single-commit and continuity-safe', async () => {
    if (!git) return;

    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.mkdirSync(path.join(planDir, 'queue', 'active'), { recursive: true });
    fs.writeFileSync(path.join(planDir, 'queue', 'active', 'task-001.json'), JSON.stringify({
      id: 'task-001', status: 'active', prompt: 'concurrent restore worker', verification: ['npm test'], ownedPaths: ['src/'],
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(planDir, 'journal.jsonl'), JSON.stringify({ host: 'source-machine', type: 'RUN_START', taskId: 'task-001' }) + '\n');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'concurrent.js'), 'export const resumed = true;\n');

    const cursor = {
      planId: 'plan-001', runId: 'run-001', epoch: 0, taskId: 'task-001', attemptCount: 1,
      completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [],
    };
    const capsule = {
      planId: 'plan-001', runId: 'run-001', epoch: 0, decisions: [], pendingClaims: ['task-001'],
      pendingEvidence: [], activeWorkers: ['worker-001', 'worker-002'], mode: 'concurrent-restore-drill',
    };
    const portable = createPortableCheckpoint('crash_recovery', cursor, capsule, testDir, ['src/']);
    const checkpointFile = path.join(os.tmpdir(), `portable-checkpoint-concurrent-${Date.now()}.json`);
    const freshDir = path.join(os.tmpdir(), `checkpoint-concurrent-${Date.now()}`).replace(/\\/g, '/');
    fs.writeFileSync(checkpointFile, JSON.stringify(portable) + '\n');
    fs.mkdirSync(freshDir, { recursive: true });
    expect(spawnSync(git, ['clone', testDir, '.'], { cwd: freshDir, encoding: 'utf8' }).status).toBe(0);

    const kernelModule = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../kernel/dist/state/checkpoint-resume.js');
    const childScript = [
      "import fs from 'node:fs';",
      "import { pathToFileURL } from 'node:url';",
      "const [modulePath, checkpointPath, workspace] = process.argv.slice(1);",
      "const { verifyAndRestoreCheckpoint } = await import(pathToFileURL(modulePath).href);",
      "const result = verifyAndRestoreCheckpoint(JSON.parse(fs.readFileSync(checkpointPath, 'utf8')), workspace);",
      "process.stdout.write(JSON.stringify(result));",
      "if (!result.success) process.exit(1);",
    ].join('\n');
    const runRestore = () => new Promise<{ code: number | null; result: { success: boolean; interruptedTaskCount: number } | null; output: string }>((resolve) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', childScript, kernelModule, checkpointFile, freshDir], {
        cwd: freshDir, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk) => { output += chunk.toString(); });
      child.on('close', (code) => {
        let result: { success: boolean; interruptedTaskCount: number } | null = null;
        try { result = JSON.parse(output) as { success: boolean; interruptedTaskCount: number }; } catch { /* assertion below */ }
        resolve({ code, result, output });
      });
    });

    try {
      const outcomes = await Promise.all([runRestore(), runRestore()]);
      expect(outcomes.every((item) => item.result !== null), JSON.stringify(outcomes)).toBe(true);
      expect(outcomes.filter((item) => item.result?.success).length).toBeGreaterThanOrEqual(1);
      expect(outcomes.reduce((sum, item) => sum + (item.result?.interruptedTaskCount ?? 0), 0)).toBe(1);
      const failures = outcomes.filter((item) => item.code !== 0);
      expect(failures.every((item) => item.output.includes('Concurrent checkpoint restore'))).toBe(true);
      expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'active', 'task-001.json'))).toBe(false);
      expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'interrupted', 'task-001.json'))).toBe(true);
      expect(fs.existsSync(path.join(freshDir, '.agent', 'checkpoint-receipts', `${portable.checkpointId}.json`))).toBe(true);
    } finally {
      fs.rmSync(checkpointFile, { force: true });
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  }, 10000);

  it.each([
    'after-prepared',
    'STAGED',
    'BACKUP_COMPLETE',
    'PAYLOAD_APPLIED',
    'PATCH_APPLIED',
    'JOURNAL_APPLIED',
    'QUEUE_APPLIED',
    'after-receipt',
  ])('recovers after process death at durable restore phase %s', (phase) => {
    if (!git) return;

    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.mkdirSync(path.join(planDir, 'queue', 'active'), { recursive: true });
    fs.writeFileSync(path.join(planDir, 'queue', 'active', 'task-001.json'), JSON.stringify({
      id: 'task-001',
      status: 'active',
      prompt: 'Recover an interrupted restore',
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(planDir, 'journal.jsonl'), JSON.stringify({ host: 'source-machine', type: 'RUN_START' }) + '\n');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'feature.js'), 'export const resumed = true;\n');
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Checkpoint tracked delta\n');

    const cursor = {
      planId: 'plan-001',
      runId: 'run-001',
      epoch: 0,
      taskId: 'task-001',
      attemptCount: 1,
      completedTaskIds: [],
      failedTaskIds: [],
      skippedTaskIds: [],
    };
    const capsule = {
      planId: 'plan-001',
      runId: 'run-001',
      epoch: 0,
      decisions: [],
      pendingClaims: ['task-001'],
      pendingEvidence: [],
      activeWorkers: ['worker-001'],
      mode: 'restore-crash-drill',
    };
    const portable = createPortableCheckpoint('crash_recovery', cursor, capsule, testDir, ['src/']);
    const checkpointFile = path.join(os.tmpdir(), `portable-checkpoint-crash-${Date.now()}-${phase}.json`);
    const freshDir = path.join(os.tmpdir(), `checkpoint-crash-recovery-${Date.now()}-${phase}`).replace(/\\/g, '/');
    fs.writeFileSync(checkpointFile, JSON.stringify(portable) + '\n');
    fs.mkdirSync(freshDir, { recursive: true });
    const clone = spawnSync(git, ['clone', testDir, '.'], { cwd: freshDir, encoding: 'utf8' });
    expect(clone.status, clone.stderr).toBe(0);

    const kernelModule = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../kernel/dist/state/checkpoint-resume.js');
    const childScript = [
      "import fs from 'node:fs';",
      "import { pathToFileURL } from 'node:url';",
      "const [modulePath, checkpointPath, workspace] = process.argv.slice(1);",
      "const { verifyAndRestoreCheckpoint } = await import(pathToFileURL(modulePath).href);",
      "const result = verifyAndRestoreCheckpoint(JSON.parse(fs.readFileSync(checkpointPath, 'utf8')), workspace);",
      "process.stdout.write(JSON.stringify(result));",
      "if (!result.success) process.exit(1);",
    ].join('\n');
    const runRestore = (crashPhase?: string) => {
      const env = { ...process.env };
      delete env.AGENT_RULES_TEST_CHECKPOINT_CRASH_PHASE;
      if (crashPhase) env.AGENT_RULES_TEST_CHECKPOINT_CRASH_PHASE = crashPhase;
      env.NODE_ENV = 'test';
      return spawnSync(
        process.execPath,
        ['--input-type=module', '-e', childScript, kernelModule, checkpointFile, freshDir],
        { cwd: freshDir, encoding: 'utf8', env },
      );
    };

    try {
      const crashed = runRestore(phase);
      if (process.platform === 'win32') {
        expect(crashed.status).toBe(137);
        expect(crashed.signal).toBeNull();
      } else {
        expect(crashed.status).toBeNull();
        expect(crashed.signal).toBe('SIGKILL');
      }
      const lockPath = path.join(freshDir, '.agent', 'locks', 'checkpoint-restore.lock');
      if (fs.existsSync(lockPath)) {
        const [pid] = fs.readFileSync(lockPath, 'utf8').trim().split('\n');
        fs.writeFileSync(lockPath, `${pid}\n0`);
      }

      const recovered = runRestore();
      expect(recovered.status, `${recovered.stderr}\n${recovered.stdout}`).toBe(0);
      expect(JSON.parse(recovered.stdout)).toEqual({ success: true, interruptedTaskCount: phase === 'after-receipt' ? 0 : 1 });
      expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'active', 'task-001.json'))).toBe(false);
      expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'interrupted', 'task-001.json'))).toBe(true);
      expect(fs.readFileSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'journal.jsonl'), 'utf8')).toContain('invalidated-cross-machine-host');
      const txDir = path.join(freshDir, '.agent', 'checkpoint-restore-transactions');
      expect(fs.existsSync(txDir)).toBe(false);
      expect(fs.readdirSync(path.join(freshDir, '.agent')).some((name) => name.startsWith('staging-restore-') || name.startsWith('backup-restore-'))).toBe(false);
    } finally {
      fs.rmSync(checkpointFile, { force: true });
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  });
});
