import fs from 'node:fs';
import path from 'node:path';
import type { Sha256, HostAttestation } from './contracts.js';
import { sha256Bytes } from './contracts.js';

export type ExecutionMode =
  | 'INTERACTIVE'
  | 'ARTIFACT_PLAN'
  | 'ARTIFACT_HANDOFF'
  | 'PLAN_REVIEW'
  | 'RESUME'
  | 'RECONCILE'
  | 'UNKNOWN';

export type ModeDetectionMethod = 'file_presence' | 'argv_signal' | 'env_signal' | 'plan_artifact_present' | 'handoff_artifact_present' | 'resume_marker';

export interface ModeSignal {
  mode: ExecutionMode;
  confidence: number;
  detectionMethod: ModeDetectionMethod;
  evidencePath?: string;
}

export interface OpenCodeModeProfile {
  detectedMode: ExecutionMode;
  signals: ModeSignal[];
  planPath?: string;
  handoffPath?: string;
  resumeCheckpointPath?: string;
  capabilityStatus: HostAttestation['capabilityStatus'];
}

const AGENT_PLANS_DIR = '.agent/plans';
const AGENT_HANDOFF_DIR = '.agent/handoff';

function findLatestPlanDir(baseDir: string): string | null {
  const plansDir = path.join(baseDir, AGENT_PLANS_DIR);
  if (!fs.existsSync(plansDir)) return null;
  const entries = fs.readdirSync(plansDir).sort().reverse();
  for (const entry of entries) {
    const planDir = path.join(plansDir, entry);
    if (fs.statSync(planDir).isDirectory()) {
      const originalMd = path.join(planDir, 'original.md');
      if (fs.existsSync(originalMd)) return planDir;
    }
  }
  return null;
}

function findLatestHandoffDir(baseDir: string): string | null {
  const handoffDir = path.join(baseDir, AGENT_HANDOFF_DIR);
  if (!fs.existsSync(handoffDir)) return null;
  const entries = fs.readdirSync(handoffDir).sort().reverse();
  for (const entry of entries) {
    const hDir = path.join(handoffDir, entry);
    if (fs.statSync(hDir).isDirectory()) {
      const manifestPath = path.join(hDir, 'handoff.json');
      if (fs.existsSync(manifestPath)) return hDir;
    }
  }
  return null;
}

function findResumeMarker(baseDir: string): string | null {
  const controllerDir = path.join(baseDir, '.agent', '.controller');
  if (!fs.existsSync(controllerDir)) return null;
  const entries = fs.readdirSync(controllerDir).sort().reverse();
  return entries.length > 0 ? path.join(controllerDir, entries[0]) : null;
}

export function detectExecutionMode(baseDir: string = process.cwd()): OpenCodeModeProfile {
  const signals: ModeSignal[] = [];
  let detectedMode: ExecutionMode = 'UNKNOWN';
  let planPath: string | undefined;
  let handoffPath: string | undefined;
  let resumeCheckpointPath: string | undefined;

  const latestPlanDir = findLatestPlanDir(baseDir);
  if (latestPlanDir) {
    planPath = latestPlanDir;
    signals.push({
      mode: 'ARTIFACT_PLAN',
      confidence: 0.9,
      detectionMethod: 'plan_artifact_present',
      evidencePath: latestPlanDir,
    });
  }

  const latestHandoffDir = findLatestHandoffDir(baseDir);
  if (latestHandoffDir) {
    handoffPath = latestHandoffDir;
    signals.push({
      mode: 'ARTIFACT_HANDOFF',
      confidence: 0.85,
      detectionMethod: 'handoff_artifact_present',
      evidencePath: latestHandoffDir,
    });
  }

  const resumeMarker = findResumeMarker(baseDir);
  if (resumeMarker) {
    resumeCheckpointPath = resumeMarker;
    signals.push({
      mode: 'RESUME',
      confidence: 0.8,
      detectionMethod: 'resume_marker',
      evidencePath: resumeMarker,
    });
  }

  const envMode = process.env.OPENCODE_EXECUTION_MODE;
  if (envMode) {
    const upper = envMode.toUpperCase() as ExecutionMode;
    signals.push({
      mode: upper,
      confidence: 1.0,
      detectionMethod: 'env_signal',
    });
  }

  detectedMode = resolveMode(signals);

  return {
    detectedMode,
    signals,
    planPath,
    handoffPath,
    resumeCheckpointPath,
    capabilityStatus: 'ADAPTER_ENFORCED',
  };
}

function resolveMode(signals: ModeSignal[]): ExecutionMode {
  const envSignal = signals.find((s) => s.detectionMethod === 'env_signal');
  if (envSignal) return envSignal.mode;

  const planSignal = signals.find((s) => s.mode === 'ARTIFACT_PLAN');
  const handoffSignal = signals.find((s) => s.mode === 'ARTIFACT_HANDOFF');
  const resumeSignal = signals.find((s) => s.mode === 'RESUME');

  if (planSignal && handoffSignal) return 'ARTIFACT_HANDOFF';
  if (planSignal) return 'ARTIFACT_PLAN';
  if (resumeSignal) return 'RESUME';

  return 'INTERACTIVE';
}

export function assertOpenCodeMode(mode: ExecutionMode): void {
  if (mode === 'UNKNOWN') {
    throw new Error('OpenCode execution mode is UNKNOWN — cannot proceed');
  }
  if (mode === 'INTERACTIVE') {
    return;
  }
  if (!['ARTIFACT_PLAN', 'ARTIFACT_HANDOFF', 'PLAN_REVIEW', 'RESUME', 'RECONCILE'].includes(mode)) {
    throw new Error(`OpenCode execution mode ${mode} is not supported as an active host mode`);
  }
}
