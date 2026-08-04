/**
 * knowledge-lifecycle.ts — Acquisition, validation, staleness, and retirement
 * of contextual knowledge entries in the agent-rules harness.
 *
 * Lifecycle: DISCOVERED → VALIDATED → ACTIVE → SUPERSEDED → RETRACTED
 *            ↑ can also RETIRE directly from ACTIVE
 *
 * Design goals (ponytail: add when):
 * - No dependency on external store: knowledge entries live in a JSON registry file.
 * - Validity windows prevent stale knowledge from poisoning routing decisions.
 * - Supersession chains are linear; cyclic supersession is rejected.
 * - No model calls — all logic is deterministic.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type KnowledgeStatus = 'DISCOVERED' | 'VALIDATED' | 'ACTIVE' | 'SUPERSEDED' | 'RETRACTED';

export interface KnowledgeEntry {
  readonly id: string;
  readonly status: KnowledgeStatus;
  readonly domain: string;             // e.g. "routing", "security", "performance"
  readonly title: string;
  readonly body: string;
  readonly sha256: string;
  readonly discoveredAt: string;       // ISO-8601
  readonly validatedAt?: string;
  readonly activatedAt?: string;
  readonly supersededAt?: string;
  readonly supersededBy?: string;       // entry id
  readonly retiredAt?: string;
  readonly validUntil?: string;        // optional expiry
  readonly tags: readonly string[];
  readonly supersedesId?: string;      // what this entry supersedes
}

export interface KnowledgeRegistry {
  readonly version: 1;
  readonly entries: readonly KnowledgeEntry[];
}

// ─── SHA-256 helpers ──────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function computeEntrySha(entry: { id: string; body: string; domain: string; status: string; validatedAt?: string; activatedAt?: string; supersededAt?: string; retiredAt?: string }): string {
  return sha256(JSON.stringify({ id: entry.id, body: entry.body, domain: entry.domain, status: entry.status, validatedAt: entry.validatedAt, activatedAt: entry.activatedAt, supersededAt: entry.supersededAt, retiredAt: entry.retiredAt }));
}

// ─── Validation helpers ────────────────────────────────────────────────────────

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function requireStatus(entry: KnowledgeEntry, allowed: KnowledgeStatus[], action: string): void {
  if (!allowed.includes(entry.status)) {
    throw new Error(
      `Cannot ${action} entry '${entry.id}': status is ${entry.status}, expected one of ${allowed.join(', ')}`,
    );
  }
}

// ─── Registry I/O ────────────────────────────────────────────────────────────

function readRegistry(registryPath: string): KnowledgeRegistry {
  requireNonEmpty(registryPath, 'registryPath');
  if (!fs.existsSync(registryPath)) {
    return { version: 1, entries: [] };
  }
  return JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as KnowledgeRegistry;
}

function writeRegistry(registryPath: string, registry: KnowledgeRegistry): void {
  requireNonEmpty(registryPath, 'registryPath');
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

// ─── Core lifecycle operations ────────────────────────────────────────────────

/**
 * Discover a new knowledge entry.  Entry starts in DISCOVERED state.
 * Idempotent: if an entry with the same id already exists, returns it unchanged.
 */
export function discoverKnowledge(
  registryPath: string,
  opts: {
    id: string;
    domain: string;
    title: string;
    body: string;
    tags?: readonly string[];
    validUntil?: string;
  },
): KnowledgeEntry {
  requireNonEmpty(opts.id, 'id');
  requireNonEmpty(opts.domain, 'domain');
  requireNonEmpty(opts.title, 'title');
  requireNonEmpty(opts.body, 'body');

  const registry = readRegistry(registryPath);
  const existing = registry.entries.find((e) => e.id === opts.id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const entry: KnowledgeEntry = {
    id: opts.id,
    status: 'DISCOVERED',
    domain: opts.domain,
    title: opts.title,
    body: opts.body,
    sha256: computeEntrySha({ id: opts.id, body: opts.body, domain: opts.domain, status: 'DISCOVERED' }),
    discoveredAt: now,
    tags: opts.tags ?? [],
    validUntil: opts.validUntil,
  };

  const updated: KnowledgeRegistry = { version: 1, entries: [...registry.entries, entry] };
  writeRegistry(registryPath, updated);
  return entry;
}

/**
 * Promote a DISCOVERED entry to VALIDATED.  Validated entries can be activated.
 */
export function validateKnowledge(registryPath: string, id: string): KnowledgeEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Knowledge entry '${id}' not found in registry`);
  requireStatus(entry, ['DISCOVERED'], 'validate');

  const now = new Date().toISOString();
  const updated = registry.entries.map((e) =>
    e.id === id
      ? { ...e, status: 'VALIDATED' as const, validatedAt: now, sha256: computeEntrySha(e) }
      : e,
  );
  writeRegistry(registryPath, { version: 1, entries: updated });
  return updated.find((e) => e.id === id)!;
}

/**
 * Activate a VALIDATED entry.  Active entries are considered live knowledge.
 */
export function activateKnowledge(registryPath: string, id: string): KnowledgeEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Knowledge entry '${id}' not found in registry`);
  requireStatus(entry, ['VALIDATED'], 'activate');

  const now = new Date().toISOString();
  const updated = registry.entries.map((e) =>
    e.id === id
      ? { ...e, status: 'ACTIVE' as const, activatedAt: now, sha256: computeEntrySha(e) }
      : e,
  );
  writeRegistry(registryPath, { version: 1, entries: updated });
  return updated.find((e) => e.id === id)!;
}

/**
 * Retire an ACTIVE entry directly (without supersession).
 */
export function retireKnowledge(registryPath: string, id: string): KnowledgeEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Knowledge entry '${id}' not found in registry`);
  requireStatus(entry, ['ACTIVE'], 'retire');

  const now = new Date().toISOString();
  const updated = registry.entries.map((e) =>
    e.id === id
      ? { ...e, status: 'RETRACTED' as const, retiredAt: now, sha256: computeEntrySha(e) }
      : e,
  );
  writeRegistry(registryPath, { version: 1, entries: updated });
  return updated.find((e) => e.id === id)!;
}

/**
 * Retire an ACTIVE entry by superseding it with a new entry.
 * The new entry must not already supersede something else (linear chain).
 */
export function supersedeKnowledge(
  registryPath: string,
  currentId: string,
  supersedingId: string,
): KnowledgeEntry {
  const registry = readRegistry(registryPath);

  const current = registry.entries.find((e) => e.id === currentId);
  if (!current) throw new Error(`Knowledge entry '${currentId}' not found in registry`);
  requireStatus(current, ['ACTIVE'], 'supersede');

  const superseding = registry.entries.find((e) => e.id === supersedingId);
  if (!superseding) throw new Error(`Knowledge entry '${supersedingId}' not found in registry`);

  // Linear supersession: the superseding entry must not already supersede something else
  if (superseding.supersedesId) {
    throw new Error(
      `Cannot supersede '${currentId}' with '${supersedingId}': superseding entry already supersedes '${superseding.supersedesId}' (cyclic supersession not allowed)`,
    );
  }

  // Cyclic supersession check: follow the chain
  let followId: string | undefined = currentId;
  const visited = new Set<string>();
  while (followId !== undefined) {
    if (visited.has(followId)) {
      throw new Error(`Cyclic supersession detected starting from '${currentId}'`);
    }
    visited.add(followId);
    const node = registry.entries.find((e) => e.id === followId);
    followId = node?.supersedesId;
  }

  const now = new Date().toISOString();

  // Update current: mark as superseded
  const updatedCurrent = {
    ...current,
    status: 'SUPERSEDED' as const,
    supersededAt: now,
    supersededBy: supersedingId,
    sha256: computeEntrySha(current),
  };

  // Update superseding: record what it supersedes and activate
  const updatedSuperseding = {
    ...superseding,
    supersedesId: currentId,
    status: 'ACTIVE' as const,
    activatedAt: now,
    sha256: computeEntrySha(superseding),
  };

  const updated = registry.entries.map((e) => {
    if (e.id === currentId) return updatedCurrent;
    if (e.id === supersedingId) return updatedSuperseding;
    return e;
  });

  writeRegistry(registryPath, { version: 1, entries: updated });
  return updatedCurrent;
}

/**
 * Query active knowledge entries, optionally filtered by domain and/or tag.
 * Expired entries (validUntil < now) are excluded.
 */
export function queryActiveKnowledge(
  registryPath: string,
  opts?: { domain?: string; tag?: string },
): KnowledgeEntry[] {
  const registry = readRegistry(registryPath);
  const now = new Date().toISOString();
  return registry.entries.slice().filter((e) => {
    if (e.status !== 'ACTIVE') return false;
    if (opts?.domain && e.domain !== opts.domain) return false;
    if (opts?.tag && !e.tags.includes(opts.tag)) return false;
    if (e.validUntil && e.validUntil < now) return false;
    return true;
  });
}

/**
 * List entries in any status, optionally filtered by status.
 */
export function listKnowledgeEntries(
  registryPath: string,
  opts?: { status?: KnowledgeStatus },
): KnowledgeEntry[] {
  const registry = readRegistry(registryPath);
  if (!opts?.status) return registry.entries.slice();
  return registry.entries.filter((e) => e.status === opts.status);
}
