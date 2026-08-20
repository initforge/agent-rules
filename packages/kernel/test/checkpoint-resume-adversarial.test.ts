import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createPortableCheckpoint,
  verifyAndRestoreCheckpoint,
  type PortableCheckpoint,
} from '../src/state/checkpoint-resume.js';
import { ActivationLock } from '../src/secure-fs.js';
import { resolveGitPath } from '../src/runner/platform.js';

describe('adversarial checkpoint-resume checks', () => {
  const testDir = path.join(os.tmpdir(), `ckpt-adv-test-${Date.now()}`).replace(/\\/g, '/');
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

  const getCursor = () => ({
    planId: 'plan-001',
    runId: 'run-001',
    epoch: 0,
    taskId: 'task-001',
    attemptCount: 1,
    completedTaskIds: [],
    failedTaskIds: [],
    skippedTaskIds: [],
  });

  const getCapsule = () => ({
    planId: 'plan-001',
    runId: 'run-001',
    epoch: 0,
    decisions: [],
    pendingClaims: ['task-001'],
    pendingEvidence: [],
    activeWorkers: [],
    mode: 'max-repair-depth=3',
  });

  it('fails closed on manifest tamper', () => {
    if (!git) return;
    const portable = createPortableCheckpoint('manual', getCursor(), getCapsule(), testDir, []);
    
    // Modify manifest data to simulate tamper
    const tampered = {
      ...portable,
      gitHead: 'abcdef0123456789abcdef0123456789abcdef01',
    };

    const res = verifyAndRestoreCheckpoint(tampered, testDir);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Checkpoint manifest hash mismatch');
  });

  it('fails closed on directory traversal path in untracked files', () => {
    if (!git) return;
    const portable = createPortableCheckpoint('manual', getCursor(), getCapsule(), testDir, []);
    
    // Inject path traversal entry
    const untracked = { ...portable.untrackedFiles };
    untracked['../escaped.txt'] = Buffer.from('hello').toString('base64');
    
    const hashes = { ...portable.payloadHashes };
    hashes['../escaped.txt'] = 'fakehash';

    const tampered: PortableCheckpoint = {
      ...portable,
      untrackedFiles: untracked,
      payloadHashes: hashes,
      checkpointSha256: '', // recalculate
    };

    // Recalculate signature
    const verifyObj = {
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
    const sha = createHash('sha256').update(JSON.stringify(verifyObj)).digest('hex');
    const finalCp = { ...tampered, checkpointSha256: sha };

    const res = verifyAndRestoreCheckpoint(finalCp, testDir);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Directory traversal or absolute path escape');
  });

  it('fails closed on secret inside untracked .agent files', () => {
    if (!git) return;
    // Create an API key in a .agent file
    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, 'config.json'), 'const API_KEY = "abcdef1234567890abcdef1234567890";\n');

    expect(() => {
      createPortableCheckpoint('manual', getCursor(), getCapsule(), testDir, []);
    }).toThrow(/Secret leakage detected/);
  });

  it('rolls back completely if diff application fails during restore', () => {
    if (!git) return;

    // Create a checkpoint of clean repo
    const portable = createPortableCheckpoint('manual', getCursor(), getCapsule(), testDir, []);

    // Create dirty modification to simulate uncommitted change that conflicts
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Conflicting Modification\n');

    // Create a tampered checkpoint that has diff conflicting with dirty file, and check that restore rolls back
    const tamperedDiff = 'diff --git a/README.md b/README.md\nindex 0000000..1111111 100644\n--- a/README.md\n+++ b/README.md\n@@ -1,2 +1,2 @@\n-# Non-existent Line\n+# Line\n';
    
    const tampered = {
      ...portable,
      gitDiff: tamperedDiff,
    };

    const verifyObj = {
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
    const sha = createHash('sha256').update(JSON.stringify(verifyObj)).digest('hex');
    const finalCp = { ...tampered, checkpointSha256: sha };

    // Restore should fail because the diff cannot be applied, and should rollback (conflicting README.md remains)
    const res = verifyAndRestoreCheckpoint(finalCp, testDir);
    expect(res.success).toBe(false);
    expect(fs.readFileSync(path.join(testDir, 'README.md'), 'utf8')).toBe('# Conflicting Modification\n');
  });

  it('rolls back payload and queue/journal mutations when the receipt commit fails', () => {
    if (!git) return;

    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.mkdirSync(path.join(planDir, 'queue', 'active'), { recursive: true });
    fs.writeFileSync(path.join(planDir, 'queue', 'active', 'task-001.json'), JSON.stringify({ id: 'task-001', status: 'active' }) + '\n');
    fs.writeFileSync(path.join(planDir, 'journal.jsonl'), JSON.stringify({ host: 'old-host', type: 'RUN_START' }) + '\n');

    // A tracked regular file at the receipt parent makes the final receipt
    // commit fail after payload/journal/queue mutation has already started.
    const receiptParent = path.join(testDir, '.agent', 'checkpoint-receipts');
    fs.writeFileSync(receiptParent, 'tracked-file-not-directory\n');
    spawnSync(git, ['add', '-f', '.agent/checkpoint-receipts'], { cwd: testDir });
    spawnSync(git, ['commit', '-m', 'track invalid receipt parent fixture'], { cwd: testDir });

    const portable = createPortableCheckpoint('manual', getCursor(), getCapsule(), testDir, []);
    const freshDir = path.join(os.tmpdir(), `ckpt-adv-post-rollback-${Date.now()}`).replace(/\\/g, '/');
    fs.mkdirSync(freshDir, { recursive: true });
    spawnSync(git, ['clone', testDir, '.'], { cwd: freshDir });

    const result = verifyAndRestoreCheckpoint(portable, freshDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Restore post-state transaction aborted and rolled back');
    expect(fs.readFileSync(path.join(freshDir, '.agent', 'checkpoint-receipts'), 'utf8').replace(/\r\n/g, '\n')).toBe('tracked-file-not-directory\n');
    expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001'))).toBe(false);
    expect(fs.existsSync(path.join(freshDir, '.agent', 'checkpoint-receipts', `${portable.checkpointId}.json`))).toBe(false);

    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it('survives tracked .agent files during restore', () => {
    if (!git) return;

    // Put some tracked .agent files
    const planDir = path.join(testDir, '.agent', 'plans', 'plan-001');
    fs.mkdirSync(path.join(planDir, 'queue', 'ready'), { recursive: true });
    
    const mockTask = {
      id: 'task-001',
      prompt: 'Verify code',
      verification: ['npm test'],
      ownedPaths: [],
      repairDepth: 0,
      createdAt: new Date().toISOString(),
      status: 'ready',
    };
    fs.writeFileSync(path.join(planDir, 'queue', 'ready', 'task-001.json'), JSON.stringify(mockTask, null, 2) + '\n');

    const portable = createPortableCheckpoint('manual', getCursor(), getCapsule(), testDir, []);

    // Clean restore dir to simulate new machine setup
    const freshDir = path.join(os.tmpdir(), `ckpt-adv-fresh-${Date.now()}`).replace(/\\/g, '/');
    fs.mkdirSync(freshDir, { recursive: true });
    spawnSync(git, ['clone', testDir, '.'], { cwd: freshDir });

    const res = verifyAndRestoreCheckpoint(portable, freshDir);
    expect(res.success).toBe(true);

    // Verify task-001 was correctly restored (survived)
    expect(fs.existsSync(path.join(freshDir, '.agent', 'plans', 'plan-001', 'queue', 'ready', 'task-001.json'))).toBe(true);
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it('fails closed on directory junction escape (reparse point exploit)', () => {
    if (!git) return;
    if (process.platform !== 'win32') return; // Only runs on Windows where junctions are native

    // Create target dir outside workspace
    const outsideDir = path.join(os.tmpdir(), `ckpt-outside-${Date.now()}`).replace(/\\/g, '/');
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(outsideDir, 'bad.txt'), 'clean');

    // Create a junction inside workspace pointing outside
    const junctionLink = path.join(testDir, 'escaped-junction');
    fs.symlinkSync(outsideDir, junctionLink, 'junction');

    // Create portable checkpoint that attempts to write through this junction
    const portable = createPortableCheckpoint('manual', getCursor(), getCapsule(), testDir, ['README.md']);

    // Tamper the checkpoint to add a file inside the junction link
    const untracked = { ...portable.untrackedFiles };
    untracked['escaped-junction/bad.txt'] = Buffer.from('exploited').toString('base64');

    const hashes = { ...portable.payloadHashes };
    hashes['escaped-junction/bad.txt'] = createHash('sha256').update(untracked['escaped-junction/bad.txt']).digest('hex');

    const tampered = {
      ...portable,
      untrackedFiles: untracked,
      payloadHashes: hashes,
    };

    const verifyObj = {
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
    const sha = createHash('sha256').update(JSON.stringify(verifyObj)).digest('hex');
    const finalCp = { ...tampered, checkpointSha256: sha };

    // Restore must fail closed because of junction escape validation
    const res = verifyAndRestoreCheckpoint(finalCp, testDir);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Junction/Reparse point escape detected');
    
    // Verify outside file was NOT overwritten
    expect(fs.readFileSync(path.join(outsideDir, 'bad.txt'), 'utf8')).toBe('clean');

    // Clean outside dir and junction link
    fs.rmSync(outsideDir, { recursive: true, force: true });
    fs.rmSync(junctionLink, { force: true });
  });

  it('fails closed when another process owns the checkpoint restore lock', () => {
    if (!git) return;
    const portable = createPortableCheckpoint('manual', getCursor(), getCapsule(), testDir, []);
    const lock = new ActivationLock(path.join(testDir, '.agent', 'locks'));
    const token = lock.acquire('checkpoint-restore').token;
    try {
      const result = verifyAndRestoreCheckpoint(portable, testDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Concurrent checkpoint restore');
    } finally {
      lock.release(token);
    }
  });
});
