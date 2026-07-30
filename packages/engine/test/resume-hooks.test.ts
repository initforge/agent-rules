import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildResumeContext,
  writeResumeMarker,
  readResumeMarker,
  assertResumeContext,
  clearResumeMarker,
  type ResumeContext,
} from '../src/resume-hooks.js';
import type { RecognizedPlan } from '../src/plan-recognizer.js';
import type { HandoffArtifact } from '../src/artifact-handoff.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
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

const hash = 'a'.repeat(64);

function stubPlan(overrides: Partial<RecognizedPlan> = {}): RecognizedPlan {
  return {
    planId: 'plan-001',
    kind: 'markdown_plan',
    originalPath: '.agent/plans/plan-001/original.md',
    originalSha256: hash,
    bytes: 100,
    status: 'ADOPTED',
    capturedAt: '2026-07-28T00:00:00.000Z',
    amendmentPaths: [],
    amendmentIds: [],
    effectiveSha256: hash,
    hasLedger: true,
    hasHandoffManifest: false,
    isAdopted: true,
    isResumable: true,
    ...overrides,
  };
}

function stubHandoff(overrides: Partial<HandoffArtifact> = {}): HandoffArtifact {
  return {
    handoffId: 'ho-001',
    direction: 'outgoing',
    status: 'ACTIVE',
    planId: 'plan-001',
    artifactId: 'ho-001',
    originatingHost: 'opencode',
    originatingSession: 'session-1',
    nextSafeAction: 'Review',
    receipts: [],
    contextCapsule: {},
    openedAt: '2026-07-28T00:00:00.000Z',
    completedAt: null,
    sha256: hash,
    ...overrides,
  };
}

describe('buildResumeContext', () => {
  it('builds a context from plan and handoff', () => {
    const dir = tmpDir();
    const plan = stubPlan();
    const handoff = stubHandoff();

    const context = buildResumeContext('handoff', 'ARTIFACT_HANDOFF', plan, handoff, dir);
    expect(context.trigger).toBe('handoff');
    expect(context.executionMode).toBe('ARTIFACT_HANDOFF');
    expect(context.planId).toBe('plan-001');
    expect(context.handoffId).toBe('ho-001');
    expect(context.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds a context without handoff', () => {
    const dir = tmpDir();
    const plan = stubPlan();

    const context = buildResumeContext('plan_adopt', 'ARTIFACT_PLAN', plan, null, dir);
    expect(context.trigger).toBe('plan_adopt');
    expect(context.handoffId).toBeNull();
  });

  it('builds a context with checkpoint revision when controller files exist', () => {
    const dir = tmpDir();
    const plan = stubPlan();
    writeFile(path.join(dir, '.agent/.controller/checkpoint-0000000003-a.json'), '{}');

    const context = buildResumeContext('checkpoint', 'RESUME', plan, null, dir);
    expect(context.checkpointRevision).toBe('0000000003');
    expect(context.checkpointPath).toBeTruthy();
  });

  it('includes context capsule from handoff', () => {
    const dir = tmpDir();
    const plan = stubPlan();
    const handoff = stubHandoff({ contextCapsule: { taskId: 'T1', phase: 'verify' } });

    const context = buildResumeContext('handoff', 'ARTIFACT_HANDOFF', plan, handoff, dir);
    expect(context.contextCapsule.taskId).toBe('T1');
    expect(context.contextCapsule.phase).toBe('verify');
  });
});

describe('writeResumeMarker and readResumeMarker', () => {
  it('writes and reads a resume marker', () => {
    const dir = tmpDir();
    const plan = stubPlan();
    const context = buildResumeContext('plan_adopt', 'ARTIFACT_PLAN', plan, null, dir);

    const markerPath = writeResumeMarker(context, dir);
    expect(fs.existsSync(markerPath)).toBe(true);

    const read = readResumeMarker(dir);
    expect(read).not.toBeNull();
    expect(read!.planId).toBe('plan-001');
    expect(read!.executionMode).toBe('ARTIFACT_PLAN');
  });

  it('returns null when no resume marker exists', () => {
    const dir = tmpDir();
    const read = readResumeMarker(dir);
    expect(read).toBeNull();
  });

  it('clearResumeMarker removes the resume file', () => {
    const dir = tmpDir();
    const plan = stubPlan();
    const context = buildResumeContext('manual', 'RESUME', plan, null, dir);
    writeResumeMarker(context, dir);

    expect(fs.existsSync(path.join(dir, '.agent/resume.json'))).toBe(true);
    clearResumeMarker(dir);
    expect(fs.existsSync(path.join(dir, '.agent/resume.json'))).toBe(false);
  });
});

describe('assertResumeContext', () => {
  it('throws for unknown planId', () => {
    expect(() => assertResumeContext({
      trigger: 'manual',
      executionMode: 'RESUME',
      planId: 'unknown',
      planPath: '',
      handoffId: null,
      checkpointRevision: null,
      checkpointPath: null,
      contextCapsule: {},
      resumedAt: '',
      sha256: '',
    })).toThrow('no valid planId');
  });

  it('throws for invalid execution mode', () => {
    expect(() => assertResumeContext({
      trigger: 'manual',
      executionMode: 'INTERACTIVE',
      planId: 'plan-001',
      planPath: '',
      handoffId: null,
      checkpointRevision: null,
      checkpointPath: null,
      contextCapsule: {},
      resumedAt: '',
      sha256: '',
    })).toThrow('not a valid resume mode');
  });

  it('passes for valid resume context', () => {
    expect(() => assertResumeContext({
      trigger: 'handoff',
      executionMode: 'ARTIFACT_HANDOFF',
      planId: 'plan-001',
      planPath: '.agent/plans/plan-001/original.md',
      handoffId: 'ho-001',
      checkpointRevision: null,
      checkpointPath: null,
      contextCapsule: {},
      resumedAt: '2026-07-28T00:00:00.000Z',
      sha256: 'a'.repeat(64),
    })).not.toThrow();
  });
});
