import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  detectExecutionMode,
  assertOpenCodeMode,
  type ExecutionMode,
} from '../src/execution-mode.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-mode-'));
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

describe('detectExecutionMode', () => {
  it('returns INTERACTIVE when no plan or handoff artifacts exist', () => {
    const dir = tmpDir();
    const profile = detectExecutionMode(dir);
    expect(profile.detectedMode).toBe('INTERACTIVE');
    expect(profile.signals).toHaveLength(0);
  });

  it('returns ARTIFACT_PLAN when a plan directory with original.md exists', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/plan-001/original.md'), '# Plan\n\nContent');
    const profile = detectExecutionMode(dir);
    expect(profile.detectedMode).toBe('ARTIFACT_PLAN');
    expect(profile.planPath).toBeTruthy();
  });

  it('returns ARTIFACT_HANDOFF when both plan and handoff artifacts exist', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/plans/plan-001/original.md'), '# Plan\n\nContent');
    writeFile(path.join(dir, '.agent/handoff/ho-001/handoff.json'), JSON.stringify({ handoffId: 'ho-001' }));
    const profile = detectExecutionMode(dir);
    expect(profile.detectedMode).toBe('ARTIFACT_HANDOFF');
    expect(profile.planPath).toBeTruthy();
    expect(profile.handoffPath).toBeTruthy();
  });

  it('returns RESUME when checkpoint files exist', () => {
    const dir = tmpDir();
    writeFile(path.join(dir, '.agent/.controller/checkpoint-0000000001-a.json'), '{}');
    const profile = detectExecutionMode(dir);
    expect(profile.detectedMode).toBe('RESUME');
    expect(profile.resumeCheckpointPath).toBeTruthy();
  });

  it('uses OPENCODE_EXECUTION_MODE env var with highest confidence', () => {
    const dir = tmpDir();
    const prev = process.env.OPENCODE_EXECUTION_MODE;
    process.env.OPENCODE_EXECUTION_MODE = 'RECONCILE';
    try {
      const profile = detectExecutionMode(dir);
      expect(profile.detectedMode).toBe('RECONCILE');
      expect(profile.signals.some((s) => s.detectionMethod === 'env_signal' && s.confidence === 1.0)).toBe(true);
    } finally {
      if (prev) process.env.OPENCODE_EXECUTION_MODE = prev;
      else delete process.env.OPENCODE_EXECUTION_MODE;
    }
  });

  it('reports ADAPTER_ENFORCED capability status for OpenCode', () => {
    const dir = tmpDir();
    const profile = detectExecutionMode(dir);
    expect(profile.capabilityStatus).toBe('ADAPTER_ENFORCED');
  });
});

describe('assertOpenCodeMode', () => {
  it('throws for UNKNOWN mode', () => {
    expect(() => assertOpenCodeMode('UNKNOWN')).toThrow('UNKNOWN');
  });

  it('passes for INTERACTIVE mode', () => {
    expect(() => assertOpenCodeMode('INTERACTIVE')).not.toThrow();
  });

  it('passes for ARTIFACT_PLAN mode', () => {
    expect(() => assertOpenCodeMode('ARTIFACT_PLAN')).not.toThrow();
  });

  it('passes for ARTIFACT_HANDOFF mode', () => {
    expect(() => assertOpenCodeMode('ARTIFACT_HANDOFF')).not.toThrow();
  });

  it('passes for RESUME mode', () => {
    expect(() => assertOpenCodeMode('RESUME')).not.toThrow();
  });
});
