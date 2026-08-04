/**
 * improvement-lifecycle.ts — Proposal, evaluation, application, and rejection
 * of improvement suggestions within the agent-rules harness.
 *
 * Lifecycle: PROPOSED → EVALUATED → APPROVED → APPLIED
 *                              ↓
 *                          REJECTED
 *            (APPROVED → APPLIED) or (APPROVED → SUPERSEDED)
 *
 * ponytail: add when:
 * - Evaluation rubric weights become configurable.
 * - Rollback of applied improvements is needed.
 * - Improvement candidates become automatable.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImprovementStatus =
  | 'PROPOSED'
  | 'EVALUATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'SUPERSEDED';

export type ImprovementPriority = 'low' | 'medium' | 'high' | 'critical';

export type ImprovementScope = 'single-file' | 'multi-file' | 'cross-module' | 'harness-wide';

export interface EvaluationResult {
  readonly score: number;        // 0-100
  readonly rationale: string;
  readonly impactAreas: readonly string[];
  readonly riskLevel: 'low' | 'medium' | 'high';
}

export interface ImprovementEntry {
  readonly id: string;
  readonly status: ImprovementStatus;
  readonly title: string;
  readonly description: string;
  readonly proposer: string;          // identity of the proposer
  readonly proposedAt: string;        // ISO-8601
  readonly scope: ImprovementScope;
  readonly priority: ImprovementPriority;
  readonly affectedPaths: readonly string[];
  readonly evaluation?: EvaluationResult;
  readonly evaluatedBy?: string;
  readonly evaluatedAt?: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly rejectedBy?: string;
  readonly rejectedAt?: string;
  readonly appliedAt?: string;
  readonly supersededAt?: string;
  readonly supersededBy?: string;
  readonly sha256: string;
}

export interface ImprovementRegistry {
  readonly version: 1;
  readonly entries: readonly ImprovementEntry[];
}

// ─── SHA-256 helpers ──────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

type HashableEntry = Omit<ImprovementEntry, 'sha256'>;

function computeEntrySha(entry: HashableEntry): string {
  return sha256(JSON.stringify(entry));
}

// ─── Validation helpers ────────────────────────────────────────────────────────

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function requireStatus(entry: ImprovementEntry, allowed: ImprovementStatus[], action: string): void {
  if (!allowed.includes(entry.status)) {
    throw new Error(
      `Cannot ${action} improvement '${entry.id}': status is ${entry.status}, expected ${allowed.join(' | ')}`,
    );
  }
}

// ─── Registry I/O ─────────────────────────────────────────────────────────────

function readRegistry(registryPath: string): ImprovementRegistry {
  if (!fs.existsSync(registryPath)) return { version: 1, entries: [] };
  return JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as ImprovementRegistry;
}

function writeRegistry(registryPath: string, registry: ImprovementRegistry): void {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

function setEntry(registryPath: string, id: string, mut: (e: ImprovementEntry) => ImprovementEntry): ImprovementEntry {
  const registry = readRegistry(registryPath);
  const updated = registry.entries.map((e) => (e.id === id ? mut(e) : e));
  const entry = updated.find((e) => e.id === id)!;
  writeRegistry(registryPath, { version: 1, entries: updated });
  return entry;
}

// ─── Core lifecycle operations ─────────────────────────────────────────────────

/**
 * Propose a new improvement.  Starts in PROPOSED state.
 * Idempotent for duplicate ids.
 */
export function proposeImprovement(
  registryPath: string,
  opts: {
    id: string;
    title: string;
    description: string;
    proposer: string;
    scope: ImprovementScope;
    priority: ImprovementPriority;
    affectedPaths: readonly string[];
  },
): ImprovementEntry {
  requireNonEmpty(opts.id, 'id');
  requireNonEmpty(opts.title, 'title');
  requireNonEmpty(opts.description, 'description');
  requireNonEmpty(opts.proposer, 'proposer');

  const registry = readRegistry(registryPath);
  const existing = registry.entries.find((e) => e.id === opts.id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const entry: ImprovementEntry = {
    id: opts.id,
    status: 'PROPOSED',
    title: opts.title,
    description: opts.description,
    proposer: opts.proposer,
    proposedAt: now,
    scope: opts.scope,
    priority: opts.priority,
    affectedPaths: opts.affectedPaths,
    sha256: '',
  };
  const withSha = { ...entry, sha256: computeEntrySha(entry) };

  const updated: ImprovementRegistry = { version: 1, entries: [...registry.entries, withSha] };
  writeRegistry(registryPath, updated);
  return withSha;
}

/**
 * Evaluate a PROPOSED improvement.  Advances to EVALUATED state.
 * Score 0-49 → rejected.  50-100 → approved.
 */
export function evaluateImprovement(
  registryPath: string,
  id: string,
  result: EvaluationResult,
  evaluatedBy: string,
): ImprovementEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Improvement '${id}' not found`);
  requireStatus(entry, ['PROPOSED'], 'evaluate');

  const now = new Date().toISOString();
  const evaluated: ImprovementEntry = {
    ...entry,
    status: 'EVALUATED',
    evaluation: result,
    evaluatedBy,
    evaluatedAt: now,
  };
  const updatedEntry = { ...evaluated, sha256: computeEntrySha(evaluated) };

  const updated = registry.entries.map((e) => (e.id === id ? updatedEntry : e));
  writeRegistry(registryPath, { version: 1, entries: updated });

  // Auto-approve or reject based on score
  if (result.score < 50) {
    return rejectImprovement(registryPath, id, evaluatedBy);
  }
  return approveImprovement(registryPath, id, evaluatedBy);
}

/**
 * Approve an EVALUATED improvement.
 */
export function approveImprovement(registryPath: string, id: string, approvedBy: string): ImprovementEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Improvement '${id}' not found`);
  requireStatus(entry, ['EVALUATED'], 'approve');

  const now = new Date().toISOString();
  return setEntry(registryPath, id, (e) => {
    const approved: ImprovementEntry = {
      ...e,
      status: 'APPROVED',
      approvedBy,
      approvedAt: now,
    };
    return { ...approved, sha256: computeEntrySha(approved) };
  });
}

/**
 * Reject an EVALUATED improvement.
 */
export function rejectImprovement(registryPath: string, id: string, rejectedBy: string): ImprovementEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Improvement '${id}' not found`);
  requireStatus(entry, ['EVALUATED'], 'reject');

  return setEntry(registryPath, id, (e) => {
    const now = new Date().toISOString();
    const rejected: ImprovementEntry = {
      ...e,
      status: 'REJECTED',
      rejectedBy,
      rejectedAt: now,
    };
    return { ...rejected, sha256: computeEntrySha(rejected) };
  });
}

/**
 * Apply an APPROVED improvement.  Advances to APPLIED state.
 */
export function applyImprovement(registryPath: string, id: string): ImprovementEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Improvement '${id}' not found`);
  requireStatus(entry, ['APPROVED'], 'apply');

  const now = new Date().toISOString();
  return setEntry(registryPath, id, (e) => {
    const applied: Omit<ImprovementEntry, 'sha256'> = {
      ...e,
      status: 'APPLIED',
      appliedAt: now,
    };
    return { ...applied, sha256: computeEntrySha(applied) };
  });
}

/**
 * Supersede an approved/evaluated improvement with a newer one.
 */
export function supersedeImprovement(
  registryPath: string,
  currentId: string,
  supersedingId: string,
): ImprovementEntry {
  const registry = readRegistry(registryPath);
  const current = registry.entries.find((e) => e.id === currentId);
  if (!current) throw new Error(`Improvement '${currentId}' not found`);
  requireStatus(current, ['APPROVED', 'EVALUATED'], 'supersede');

  const superseding = registry.entries.find((e) => e.id === supersedingId);
  if (!superseding) throw new Error(`Improvement '${supersedingId}' not found`);

  const now = new Date().toISOString();

  const updatedCurrent = setEntry(registryPath, currentId, (e) => {
    const updated: Omit<ImprovementEntry, 'sha256'> = {
      ...e,
      status: 'SUPERSEDED',
      supersededAt: now,
      supersededBy: supersedingId,
    };
    return { ...updated, sha256: computeEntrySha(updated) };
  });

  void superseding;
  return updatedCurrent;
}

/**
 * List improvements, optionally filtered by status.
 */
export function listImprovements(
  registryPath: string,
  opts?: { status?: ImprovementStatus },
): readonly ImprovementEntry[] {
  const registry = readRegistry(registryPath);
  if (!opts?.status) return registry.entries.slice();
  return registry.entries.filter((e) => e.status === opts.status);
}

/**
 * Get a single improvement by id.
 */
export function getImprovement(registryPath: string, id: string): ImprovementEntry | undefined {
  return readRegistry(registryPath).entries.find((e) => e.id === id);
}
