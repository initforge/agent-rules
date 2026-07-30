import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Sha256, WorkerReceipt } from './contracts.js';
import { sha256Bytes, isSha256 } from './contracts.js';

export type HandoffDirection = 'outgoing' | 'incoming';
export type HandoffStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'STALE';

export interface HandoffArtifact {
  handoffId: string;
  direction: HandoffDirection;
  status: HandoffStatus;
  planId: string;
  artifactId: string;
  originatingHost: string;
  originatingSession: string;
  nextSafeAction: string;
  receipts: WorkerReceipt[];
  contextCapsule: Record<string, string>;
  openedAt: string;
  completedAt: string | null;
  sha256: Sha256;
}

export interface HandoffManifest {
  formatVersion: string;
  handoffId: string;
  planId: string;
  originatingHost: string;
  originatingSession: string;
  nextSafeAction: string;
  receiptCount: number;
  contextKeys: string[];
  exportedAt: string;
  sha256: Sha256;
}

const HANDOFF_DIR = '.agent/handoff';
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,128}$/;

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function assertSafePathComponent(id: string, label: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`${label} contains unsafe path characters: ${id}`);
  }
}

function assertPathWithin(resolved: string, root: string): void {
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: ${resolved} is not within ${root}`);
  }
}

function assertNoSymlinkOrHardlink(target: string): void {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symlink blocked: ${target}`);
  }
  if (stat.nlink > 1) {
    throw new Error(`Hardlink blocked: ${target} (nlink=${stat.nlink})`);
  }
}

export function writeHandoffArtifact(
  planId: string,
  originatingHost: string,
  originatingSession: string,
  nextSafeAction: string,
  receipts: WorkerReceipt[],
  contextCapsule: Record<string, string>,
  baseDir: string = process.cwd(),
): HandoffArtifact {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const handoffId = `ho-${timestamp}-${random}`;
  const handoffBase = path.resolve(baseDir, HANDOFF_DIR);
  const handoffDir = path.resolve(handoffBase, handoffId);
  assertPathWithin(handoffDir, handoffBase);
  ensureDir(handoffDir);

  const handoff: HandoffArtifact = {
    handoffId,
    direction: 'outgoing',
    status: 'ACTIVE',
    planId,
    artifactId: handoffId,
    originatingHost,
    originatingSession,
    nextSafeAction,
    receipts: [...receipts],
    contextCapsule: { ...contextCapsule },
    openedAt: new Date().toISOString(),
    completedAt: null,
    sha256: '' as Sha256,
  };

  const handoffJson = JSON.stringify(handoff, (key, value) => {
    if (key === 'sha256') return undefined;
    return value;
  }, 2);

  const handoffSha = sha256Bytes(new TextEncoder().encode(handoffJson));
  handoff.sha256 = handoffSha;

  const manifest: HandoffManifest = {
    formatVersion: '1.0',
    handoffId,
    planId,
    originatingHost,
    originatingSession,
    nextSafeAction,
    receiptCount: receipts.length,
    contextKeys: Object.keys(contextCapsule),
    exportedAt: new Date().toISOString(),
    sha256: handoffSha,
  };

  fs.writeFileSync(path.join(handoffDir, 'handoff.json'), JSON.stringify(handoff, null, 2), 'utf-8');
  fs.writeFileSync(path.join(handoffDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  return handoff;
}

export function readHandoffArtifact(
  handoffId: string,
  baseDir: string = process.cwd(),
): HandoffArtifact | null {
  assertSafePathComponent(handoffId, 'handoffId');
  const handoffBase = path.resolve(baseDir, HANDOFF_DIR);
  const handoffPath = path.resolve(handoffBase, handoffId, 'handoff.json');
  assertPathWithin(handoffPath, handoffBase);
  if (!fs.existsSync(handoffPath)) return null;
  assertNoSymlinkOrHardlink(handoffPath);

  const raw = fs.readFileSync(handoffPath, 'utf-8');
  const handoff = JSON.parse(raw) as HandoffArtifact;
  return handoff;
}

export function listHandoffArtifacts(
  baseDir: string = process.cwd(),
): HandoffArtifact[] {
  const handoffDir = path.resolve(baseDir, HANDOFF_DIR);
  if (!fs.existsSync(handoffDir)) return [];

  const entries = fs.readdirSync(handoffDir).sort().reverse();
  const artifacts: HandoffArtifact[] = [];

  for (const entry of entries) {
    const artifactDir = path.join(handoffDir, entry);
    let stat;
    try {
      stat = fs.lstatSync(artifactDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (stat.isSymbolicLink()) continue;

    const handoffPath = path.join(artifactDir, 'handoff.json');
    if (!fs.existsSync(handoffPath)) continue;

    try {
      const raw = fs.readFileSync(handoffPath, 'utf-8');
      artifacts.push(JSON.parse(raw) as HandoffArtifact);
    } catch {
      continue;
    }
  }

  return artifacts;
}

export function resolveHandoff(
  handoffId: string,
  baseDir: string = process.cwd(),
): { handoff: HandoffArtifact; planDir: string | null } {
  const handoff = readHandoffArtifact(handoffId, baseDir);
  if (!handoff) {
    throw new Error(`Handoff artifact not found: ${handoffId}`);
  }

  const plansDir = path.resolve(baseDir, '.agent', 'plans');
  assertSafePathComponent(handoff.planId, 'planId');
  const planDirCandidate = path.resolve(plansDir, handoff.planId);
  assertPathWithin(planDirCandidate, plansDir);
  let planDir: string | null = planDirCandidate;
  if (!fs.existsSync(planDir)) {
    planDir = null;
  }

  return { handoff, planDir };
}

export function assertHandoffBinding(handoff: HandoffArtifact): void {
  if (!handoff.handoffId || !handoff.planId || !handoff.originatingHost || !handoff.originatingSession) {
    throw new Error('Handoff artifact is missing identity fields');
  }
  if (!handoff.nextSafeAction) {
    throw new Error('Handoff artifact must specify nextSafeAction');
  }
  if (handoff.status === 'STALE') {
    throw new Error('Handoff artifact is STALE — cannot use for handoff resolution');
  }
  if (!handoff.sha256 || !isSha256(handoff.sha256)) {
    throw new Error('Handoff artifact is missing a valid SHA-256 binding');
  }
}
