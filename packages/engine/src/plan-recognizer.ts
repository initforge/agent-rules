import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Sha256, PlanArtifactStatus } from './contracts.js';
import { sha256Bytes, isSha256 } from './contracts.js';

function assertPathWithin(resolved: string, root: string): void {
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: ${resolved} is not within ${root}`);
  }
}

export type PlanKind = 'portable_plan_v3' | 'markdown_plan' | 'legacy_plan' | 'unknown';

export interface RecognizedPlan {
  planId: string;
  kind: PlanKind;
  originalPath: string;
  originalSha256: Sha256;
  bytes: number;
  status: PlanArtifactStatus;
  capturedAt: string;
  amendmentPaths: string[];
  amendmentIds: string[];
  effectiveSha256: Sha256;
  hasLedger: boolean;
  hasHandoffManifest: boolean;
  isAdopted: boolean;
  isResumable: boolean;
}

export interface PlanRecognitionResult {
  recognizedPlans: RecognizedPlan[];
  latestAdoptedPlan: RecognizedPlan | null;
  totalPlans: number;
}

const PLANS_DIR = '.agent/plans';

export function recognizePlans(baseDir: string = process.cwd()): PlanRecognitionResult {
  const plansDir = path.resolve(baseDir, PLANS_DIR);
  if (!fs.existsSync(plansDir)) {
    return { recognizedPlans: [], latestAdoptedPlan: null, totalPlans: 0 };
  }

  const entries = fs.readdirSync(plansDir).sort().reverse();
  const recognizedPlans: RecognizedPlan[] = [];

  for (const entry of entries) {
    const planDir = path.join(plansDir, entry);
    if (!fs.statSync(planDir).isDirectory()) continue;

    const originalPath = path.join(planDir, 'original.md');
    if (!fs.existsSync(originalPath)) continue;

    const plan = recognizeSinglePlan(entry, planDir, originalPath);
    if (plan) recognizedPlans.push(plan);
  }

  const adopted = recognizedPlans.find((p) => p.isAdopted) ?? recognizedPlans[0] ?? null;

  return {
    recognizedPlans,
    latestAdoptedPlan: adopted,
    totalPlans: recognizedPlans.length,
  };
}

function recognizeSinglePlan(planId: string, planDir: string, originalPath: string): RecognizedPlan | null {
  const originalBytes = fs.readFileSync(originalPath);
  const originalSha256 = sha256Bytes(new Uint8Array(originalBytes));

  const amendmentDir = path.join(planDir, 'amendments');
  const amendmentPaths: string[] = [];
  const amendmentIds: string[] = [];

  if (fs.existsSync(amendmentDir)) {
    const entries = fs.readdirSync(amendmentDir).sort();
    for (const entry of entries) {
      const entryPath = path.join(amendmentDir, entry);
      if (fs.statSync(entryPath).isFile()) {
        amendmentPaths.push(entryPath);
        amendmentIds.push(entry.replace(/\.(md|json|yaml)$/i, ''));
      }
    }
  }

  const planBytes: Buffer[] = [originalBytes];
  for (const amPath of amendmentPaths) planBytes.push(fs.readFileSync(amPath));
  const effectiveBytes = Buffer.concat(planBytes);
  const effectiveSha256 = sha256Bytes(new Uint8Array(effectiveBytes));

  const ledgerPath = path.join(planDir, 'ledger.json');
  const hasLedger = fs.existsSync(ledgerPath);

  const handoffManifestPath = path.join(planDir, 'handoff.json');
  const hasHandoffManifest = fs.existsSync(handoffManifestPath);

  const kind = detectPlanKind(originalBytes.toString('utf-8'));
  const status = detectPlanStatus(planDir, hasLedger);
  const capturedAt = fs.statSync(originalPath).mtime.toISOString();
  const isAdopted = status === 'ADOPTED' || status === 'ACTIVE' || (hasLedger && status !== 'REJECTED');
  const isResumable = hasLedger || hasHandoffManifest;

  return {
    planId,
    kind,
    originalPath,
    originalSha256,
    bytes: originalBytes.byteLength,
    status,
    capturedAt,
    amendmentPaths,
    amendmentIds,
    effectiveSha256,
    hasLedger,
    hasHandoffManifest,
    isAdopted,
    isResumable,
  };
}

function detectPlanKind(content: string): PlanKind {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"schema"') && trimmed.includes('harness/portable-plan')) {
    return 'portable_plan_v3';
  }
  if (trimmed.startsWith('# ') && trimmed.includes('## ')) {
    return 'markdown_plan';
  }
  return 'legacy_plan';
}

function detectPlanStatus(planDir: string, hasLedger: boolean): PlanArtifactStatus {
  const statusFile = path.join(planDir, '.status');
  if (fs.existsSync(statusFile)) {
    const status = fs.readFileSync(statusFile, 'utf-8').trim().toUpperCase() as PlanArtifactStatus;
    if (['DRAFT', 'APPROVED', 'ADOPTED', 'ACTIVE', 'SUPERSEDED', 'REJECTED'].includes(status)) {
      return status;
    }
  }
  if (hasLedger) return 'ADOPTED';
  if (!hasLedger) return 'DRAFT';
  return 'DRAFT';
}

export function adoptRecognizedPlan(plan: RecognizedPlan, baseDir: string = process.cwd()): { adopted: boolean; statusPath: string } {
  const plansRoot = path.resolve(baseDir, PLANS_DIR);
  const planDir = path.dirname(plan.originalPath);
  assertPathWithin(planDir, plansRoot);
  const statusPath = path.join(planDir, '.status');
  const targetStatus: PlanArtifactStatus = 'ADOPTED';
  const tmpPath = statusPath + '.tmp';
  fs.writeFileSync(tmpPath, targetStatus, 'utf-8');
  fs.renameSync(tmpPath, statusPath);
  return { adopted: true, statusPath };
}

export function detectPlanFromFile(filePath: string, baseDir: string = process.cwd()): RecognizedPlan | null {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  const plansRoot = path.resolve(baseDir, PLANS_DIR);
  assertPathWithin(resolved, plansRoot);
  const planDir = path.dirname(resolved);
  assertPathWithin(planDir, plansRoot);
  const planId = path.basename(planDir);
  return recognizeSinglePlan(planId, planDir, resolved);
}
