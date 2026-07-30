import fs from 'node:fs';
import path from 'node:path';
import type { Sha256 } from './contracts.js';
import { sha256Bytes } from './contracts.js';
import type { ExecutionMode } from './execution-mode.js';
import type { RecognizedPlan } from './plan-recognizer.js';
import type { HandoffArtifact } from './artifact-handoff.js';

export type ResumeTrigger = 'checkpoint' | 'handoff' | 'plan_adopt' | 'mode_detect' | 'manual';

export interface ResumeContext {
  trigger: ResumeTrigger;
  executionMode: ExecutionMode;
  planId: string;
  planPath: string;
  handoffId: string | null;
  checkpointRevision: string | null;
  checkpointPath: string | null;
  contextCapsule: Record<string, string>;
  resumedAt: string;
  sha256: Sha256;
}

const CONTROLLER_DIR = '.agent/.controller';

export function buildResumeContext(
  trigger: ResumeTrigger,
  executionMode: ExecutionMode,
  plan: RecognizedPlan | null,
  handoff: HandoffArtifact | null,
  baseDir: string = process.cwd(),
): ResumeContext {
  const planId = plan?.planId ?? 'unknown';
  const planPath = plan?.originalPath ?? path.resolve(baseDir, '.agent', 'plans', planId, 'original.md');

  let checkpointRevision: string | null = null;
  let checkpointPath: string | null = null;

  const controllerDir = path.resolve(baseDir, CONTROLLER_DIR);
  if (fs.existsSync(controllerDir)) {
    const entries = fs.readdirSync(controllerDir).sort().reverse();
    if (entries.length > 0) {
      checkpointPath = path.join(controllerDir, entries[0]);
      const match = entries[0].match(/checkpoint-(\d+)-/);
      if (match) checkpointRevision = match[1];
    }
  }

  const contextCapsule: Record<string, string> = {
    executionMode,
    planId,
    trigger,
    baseDir,
    ...(handoff ? { handoffId: handoff.handoffId, nextSafeAction: handoff.nextSafeAction } : {}),
    ...(handoff?.contextCapsule ?? {}),
  };

  const contextBytes = new TextEncoder().encode(JSON.stringify(contextCapsule));
  const resumeSha = sha256Bytes(contextBytes);

  return {
    trigger,
    executionMode,
    planId,
    planPath,
    handoffId: handoff?.handoffId ?? null,
    checkpointRevision,
    checkpointPath,
    contextCapsule,
    resumedAt: new Date().toISOString(),
    sha256: resumeSha,
  };
}

export function writeResumeMarker(
  context: ResumeContext,
  baseDir: string = process.cwd(),
): string {
  const resumeDir = path.resolve(baseDir, '.agent');
  fs.mkdirSync(resumeDir, { recursive: true });
  const resumePath = path.join(resumeDir, 'resume.json');
  fs.writeFileSync(resumePath, JSON.stringify(context, null, 2), 'utf-8');
  return resumePath;
}

export function readResumeMarker(
  baseDir: string = process.cwd(),
): ResumeContext | null {
  const resumePath = path.resolve(baseDir, '.agent', 'resume.json');
  if (!fs.existsSync(resumePath)) return null;
  try {
    const raw = fs.readFileSync(resumePath, 'utf-8');
    return JSON.parse(raw) as ResumeContext;
  } catch {
    return null;
  }
}

export function assertResumeContext(context: ResumeContext): void {
  if (!context.planId || context.planId === 'unknown') {
    throw new Error('Resume context has no valid planId');
  }
  if (!context.executionMode) {
    throw new Error('Resume context has no execution mode');
  }
  if (!['ARTIFACT_PLAN', 'ARTIFACT_HANDOFF', 'RESUME', 'RECONCILE'].includes(context.executionMode)) {
    throw new Error(`Resume context execution mode ${context.executionMode} is not a valid resume mode`);
  }
}

export function clearResumeMarker(baseDir: string = process.cwd()): void {
  const resumePath = path.resolve(baseDir, '.agent', 'resume.json');
  if (fs.existsSync(resumePath)) {
    fs.unlinkSync(resumePath);
  }
}
