import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  recognizePlans,
  adoptRecognizedPlan,
  detectPlanFromFile,
  type RecognizedPlan,
} from '../src/plan-recognizer.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-rec-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(p: string, content: string): string {
  const abs = path.resolve(p);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return abs;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('recognizePlans', () => {
  it('returns empty result when no .agent/plans directory exists', () => {
    const dir = tmpDir();
    const result = recognizePlans(dir);
    expect(result.recognizedPlans).toHaveLength(0);
    expect(result.totalPlans).toBe(0);
    expect(result.latestAdoptedPlan).toBeNull();
  });

  it('recognizes a single markdown plan with ledger', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-001/original.md'), '# My Plan\n\n## Section\nDo work.\n');
    writeFile(path.join(dir, '.agent/plans/p-001/ledger.json'), '{}');

    const result = recognizePlans(dir);
    expect(result.totalPlans).toBe(1);
    expect(result.recognizedPlans[0].planId).toBe('p-001');
    expect(result.recognizedPlans[0].kind).toBe('markdown_plan');
    expect(result.recognizedPlans[0].hasLedger).toBe(true);
    expect(result.recognizedPlans[0].isAdopted).toBe(true);
    expect(result.recognizedPlans[0].isResumable).toBe(true);
  });

  it('recognizes a markdown plan without ledger as DRAFT', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-002/original.md'), '# Draft Plan\n\nContent');

    const result = recognizePlans(dir);
    expect(result.totalPlans).toBe(1);
    expect(result.recognizedPlans[0].status).toBe('DRAFT');
    expect(result.recognizedPlans[0].isAdopted).toBe(false);
    expect(result.recognizedPlans[0].isResumable).toBe(false);
  });

  it('recognizes plans with amendments', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-003/original.md'), '# Plan\nContent');
    writeFile(path.join(dir, '.agent/plans/p-003/amendments/am1.md'), '# Amendment 1');
    writeFile(path.join(dir, '.agent/plans/p-003/amendments/am2.md'), '# Amendment 2');

    const result = recognizePlans(dir);
    expect(result.totalPlans).toBe(1);
    expect(result.recognizedPlans[0].amendmentIds).toEqual(['am1', 'am2']);
    expect(result.recognizedPlans[0].amendmentPaths).toHaveLength(2);
    expect(result.recognizedPlans[0].effectiveSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('finds latestAdoptedPlan from multiple plans', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-001/original.md'), '# Draft\nContent');
    writeFile(path.join(dir, '.agent/plans/p-002/original.md'), '# Adopted\nContent');
    writeFile(path.join(dir, '.agent/plans/p-002/ledger.json'), '{}');

    const result = recognizePlans(dir);
    expect(result.totalPlans).toBe(2);
    expect(result.latestAdoptedPlan?.planId).toBe('p-002');
  });

  it('skips directories without original.md', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.agent/plans/p-empty'), { recursive: true });
    writeFile(path.join(dir, '.agent/plans/p-001/original.md'), '# Real\nContent');

    const result = recognizePlans(dir);
    expect(result.totalPlans).toBe(1);
  });

  it('computes effectiveSha256 same as original when no amendments', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-004/original.md'), '# Single\nContent');

    const result = recognizePlans(dir);
    expect(result.recognizedPlans[0].effectiveSha256).toBe(result.recognizedPlans[0].originalSha256);
  });

  it('computes different effectiveSha256 with amendments', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-005/original.md'), '# Original\nContent');
    writeFile(path.join(dir, '.agent/plans/p-005/amendments/am1.md'), '# Amendment');

    const result = recognizePlans(dir);
    const plan = result.recognizedPlans[0];
    expect(plan.effectiveSha256).not.toBe(plan.originalSha256);
  });
});

describe('adoptRecognizedPlan', () => {
  it('writes .status file with ADOPTED', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-001/original.md'), '# Plan\nContent');
    const result = recognizePlans(dir);
    const plan = result.recognizedPlans[0];

    const outcome = adoptRecognizedPlan(plan, dir);
    expect(outcome.adopted).toBe(true);
    expect(fs.existsSync(outcome.statusPath)).toBe(true);
    expect(fs.readFileSync(outcome.statusPath, 'utf-8').trim()).toBe('ADOPTED');
  });
});

describe('detectPlanFromFile', () => {
  it('returns null for non-existent file', () => {
    const dir = tmpDir();
    const plan = detectPlanFromFile('/nonexistent/plan.md', dir);
    expect(plan).toBeNull();
  });

  it('detects a plan from a valid original.md path', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-001/original.md'), '# Plan\nContent');

    const plan = detectPlanFromFile(path.join(dir, '.agent/plans/p-001/original.md'), dir);
    expect(plan).not.toBeNull();
    expect(plan!.planId).toBe('p-001');
  });

  it('blocks path traversal with ../ in filePath', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-001/original.md'), '# Plan\nContent');
    fs.mkdirSync(path.join(dir, '.agent', 'etc'), { recursive: true });
    const trapFile = path.join(dir, '.agent', 'etc', 'passwd');
    fs.writeFileSync(trapFile, 'root:x:0:0\n', 'utf-8');
    const traversalPath = path.join(dir, '.agent/plans/p-001/../../etc/passwd');
    expect(() => detectPlanFromFile(traversalPath, dir)).toThrow('traversal');
  });

  it('blocks traversal via absolute path', () => {
    const dir = tmpDir();
    expect(() => detectPlanFromFile('/etc/passwd', dir)).toThrow('traversal');
  });

  it('rejects symlink within plans dir', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/p-001/original.md'), '# Plan\nContent');
    const linkPath = path.join(dir, '.agent/plans/p-001/link.md');
    try {
      fs.symlinkSync(path.join(dir, '.agent/plans/p-001/original.md'), linkPath);
      expect(() => detectPlanFromFile(linkPath, dir)).toThrow('traversal');
    } catch {
      // symlink may not be supported on all platforms
    }
  });

  it('rejects plan outside canonical plans root via adopted plan', () => {
    const dir = tmpDir();
    const outsidePath = path.join(dir, 'outside.md');
    writeFile(outsidePath, '# Outside\nContent');
    const plan: RecognizedPlan = {
      planId: 'evil',
      kind: 'markdown_plan',
      originalPath: outsidePath,
      originalSha256: 'a'.repeat(64) as any,
      bytes: 10,
      status: 'DRAFT',
      capturedAt: new Date().toISOString(),
      amendmentPaths: [],
      amendmentIds: [],
      effectiveSha256: 'a'.repeat(64) as any,
      hasLedger: false,
      hasHandoffManifest: false,
      isAdopted: false,
      isResumable: false,
    };
    expect(() => adoptRecognizedPlan(plan, dir)).toThrow('traversal');
  });
});
