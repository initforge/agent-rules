import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import type { Sha256, HostAttestation, CapabilityStatus, WorkerReceipt, TaskAssignment } from './contracts.js';
import { sha256Bytes, isSha256 } from './contracts.js';
import type { ExecutionMode, OpenCodeModeProfile } from './execution-mode.js';
import { detectExecutionMode, assertOpenCodeMode } from './execution-mode.js';
import type { RecognizedPlan, PlanRecognitionResult } from './plan-recognizer.js';
import { recognizePlans, adoptRecognizedPlan } from './plan-recognizer.js';
import type { HandoffArtifact } from './artifact-handoff.js';
import { writeHandoffArtifact, readHandoffArtifact, listHandoffArtifacts, assertHandoffBinding } from './artifact-handoff.js';

export type OpenCodeCapability =
  | 'artifact_plan_read'
  | 'artifact_plan_write'
  | 'artifact_handoff_read'
  | 'artifact_handoff_write'
  | 'plan_recognition'
  | 'plan_adoption'
  | 'resume_from_checkpoint'
  | 'platform_attestation'
  | 'mode_detection';

export interface OpenCodeHostProfile {
  host: 'opencode';
  hostVersion: string;
  mode: ExecutionMode;
  modeProfile: OpenCodeModeProfile;
  plan: RecognizedPlan | null;
  handoff: HandoffArtifact | null;
  capabilities: OpenCodeCapability[];
  capabilityStatus: CapabilityStatus;
  attestation: HostAttestation;
}

export function buildOpenCodeProfile(baseDir: string = process.cwd()): OpenCodeHostProfile {
  const modeProfile = detectExecutionMode(baseDir);
  assertOpenCodeMode(modeProfile.detectedMode);

  const planResult = recognizePlans(baseDir);
  const handoffs = listHandoffArtifacts(baseDir);
  const activeHandoff = handoffs.find((h) => h.status === 'ACTIVE') ?? null;

  const capabilities: OpenCodeCapability[] = [
    'artifact_plan_read',
    'artifact_plan_write',
    'artifact_handoff_read',
    'artifact_handoff_write',
    'plan_recognition',
    'plan_adoption',
    'resume_from_checkpoint',
    'platform_attestation',
    'mode_detection',
  ];

  const hostVersion = process.env.OPENCODE_VERSION || '0.0.0';
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();

  const capabilityIds = capabilities.map((c) => `opencode:${c}`);

  const attestation: HostAttestation = {
    host: 'opencode',
    hostVersion,
    commitSha: detectCommitSha(baseDir),
    capabilityStatus: 'ADAPTER_ENFORCED',
    capabilityIds,
    contractSetSha256: computeContractSetSha(),
    requestedModel: process.env.OPENCODE_MODEL || 'unknown',
    resolvedModel: process.env.OPENCODE_MODEL || 'unknown',
    observedModel: process.env.OPENCODE_MODEL || 'unknown',
    evidenceHashes: [],
    nativeRunnerIdentity: 'opencode-harness',
    issuedAt,
    expiresAt,
  };

  return {
    host: 'opencode',
    hostVersion,
    mode: modeProfile.detectedMode,
    modeProfile,
    plan: planResult.latestAdoptedPlan,
    handoff: activeHandoff,
    capabilities,
    capabilityStatus: 'ADAPTER_ENFORCED',
    attestation,
  };
}

export function writeOpenCodePlanAdoption(
  planId: string,
  baseDir: string = process.cwd(),
): { adopted: boolean; plan: RecognizedPlan | null } {
  const planResult = recognizePlans(baseDir);
  const plan = planResult.recognizedPlans.find((p) => p.planId === planId)
    ?? planResult.latestAdoptedPlan;

  if (!plan) {
    return { adopted: false, plan: null };
  }

  adoptRecognizedPlan(plan, baseDir);
  return { adopted: true, plan };
}

export function writeOpenCodeHandoff(
  planId: string,
  nextSafeAction: string,
  receipts: WorkerReceipt[],
  contextCapsule: Record<string, string>,
  baseDir: string = process.cwd(),
): HandoffArtifact {
  const session = process.env.OPENCODE_SESSION || `session-${Date.now()}`;
  return writeHandoffArtifact(
    planId,
    'opencode',
    session,
    nextSafeAction,
    receipts,
    contextCapsule,
    baseDir,
  );
}

export function resolveOpenCodeHandoff(
  handoffId: string,
  baseDir: string = process.cwd(),
): { handoff: HandoffArtifact; planDir: string | null } {
  const handoff = readHandoffArtifact(handoffId, baseDir);
  if (!handoff) {
    throw new Error(`OpenCode handoff artifact not found: ${handoffId}`);
  }

  assertHandoffBinding(handoff);

  const plansDir = path.resolve(baseDir, '.agent', 'plans');
  let planDir: string | null = path.join(plansDir, handoff.planId);
  if (!fs.existsSync(planDir)) {
    planDir = null;
  }

  return { handoff, planDir };
}

export function gateChildSessionControl(profile: OpenCodeHostProfile): void {
  if (profile.mode === 'ARTIFACT_PLAN' || profile.mode === 'ARTIFACT_HANDOFF') {
    return;
  }
  if (process.env.OPENCODE_CHILD_SESSION === '1') {
    throw new Error(
      'OpenCode child-session control is gated: use ARTIFACT_PLAN or ARTIFACT_HANDOFF mode ' +
      'instead of live cross-host child session',
    );
  }
}

function assertPathWithin(resolved: string, root: string): void {
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: ${resolved} is not within ${root}`);
  }
}

function safeResolveGitRef(baseDir: string, gitDir: string, refContent: string): string | null {
  const refSpec = refContent.slice(5).trim();
  if (!refSpec.startsWith('refs/')) return null;
  const refPath = path.resolve(gitDir, refSpec);
  assertPathWithin(refPath, gitDir);
  if (!fs.existsSync(refPath)) return null;
  const stat = fs.lstatSync(refPath);
  if (stat.isSymbolicLink()) return null;
  return fs.readFileSync(refPath, 'utf-8').trim();
}

function detectCommitSha(baseDir: string): string {
  try {
    const gitDir = path.resolve(baseDir, '.git');
    const headPath = path.join(gitDir, 'HEAD');
    if (fs.existsSync(headPath)) {
      const lstat = fs.lstatSync(headPath);
      if (lstat.isSymbolicLink()) return 'unknown';
      const head = fs.readFileSync(headPath, 'utf-8').trim();
      if (head.startsWith('ref: ')) {
        const sha = safeResolveGitRef(baseDir, gitDir, head);
        if (sha) return sha;
      }
      if (/^[0-9a-f]{40}$/i.test(head)) return head;
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

function computeContractSetSha(): Sha256 {
  const components = [
    'harness/portable-plan/v3',
    'opencode/adapter/v1',
    'artifact-handoff/v1',
  ];
  return sha256Bytes(new TextEncoder().encode(components.join(':')));
}
