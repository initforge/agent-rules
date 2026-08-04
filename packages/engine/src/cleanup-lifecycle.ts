/**
 * cleanup-lifecycle.ts — Expiry tracking and cleanup execution for transient harness
 * resources: ephemeral temp directories, stale lease records, expired evidence
 * snapshots, and orphaned worktree directories.
 *
 * Lifecycle: REGISTERED → EXPIRED → CLEANED | FAILED
 *            ↑ can also go directly from REGISTERED → CLEANED (eager)
 *
 * ponytail: add when:
 * - Scheduled background cleanup (cron-style) is needed.
 * - Cleanup policies per resource kind become configurable.
 * - Cleanup receipts are persisted for audit.
 */
import fs from 'node:fs';
import path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CleanupStatus = 'REGISTERED' | 'EXPIRED' | 'CLEANED' | 'FAILED';

export type CleanupKind =
  | 'temp-directory'
  | 'evidence-snapshot'
  | 'worktree-orphan'
  | 'lease-record'
  | 'checkpoint';

export interface CleanupEntry {
  readonly id: string;
  readonly status: CleanupStatus;
  readonly kind: CleanupKind;
  readonly targetPath: string;
  readonly reason: string;
  readonly registeredAt: string;         // ISO-8601
  readonly expiresAt: string;           // ISO-8601
  readonly cleanedAt?: string;
  readonly cleanedBy?: string;
  readonly error?: string;
}

export interface CleanupRegistry {
  readonly version: 1;
  readonly entries: readonly CleanupEntry[];
}

// ─── Validation helpers ────────────────────────────────────────────────────────

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

// ─── Registry I/O ─────────────────────────────────────────────────────────────

function readRegistry(registryPath: string): CleanupRegistry {
  if (!fs.existsSync(registryPath)) return { version: 1, entries: [] };
  return JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as CleanupRegistry;
}

function writeRegistry(registryPath: string, registry: CleanupRegistry): void {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

function updateEntry(registryPath: string, id: string, mut: (e: CleanupEntry) => CleanupEntry): CleanupEntry {
  const registry = readRegistry(registryPath);
  const updated = registry.entries.map((e) => (e.id === id ? mut(e) : e));
  const entry = updated.find((e) => e.id === id)!;
  writeRegistry(registryPath, { version: 1, entries: updated });
  return entry;
}

// ─── Core lifecycle operations ──────────────────────────────────────────────────

/**
 * Register a resource for cleanup.  Entry starts in REGISTERED state.
 * Idempotent: duplicate ids are ignored and the existing entry returned.
 */
export function registerCleanup(
  registryPath: string,
  opts: {
    id: string;
    kind: CleanupKind;
    targetPath: string;
    reason: string;
    expiresAt: string;      // ISO-8601
  },
): CleanupEntry {
  requireNonEmpty(opts.id, 'id');
  requireNonEmpty(opts.targetPath, 'targetPath');
  requireNonEmpty(opts.reason, 'reason');
  requireNonEmpty(opts.expiresAt, 'expiresAt');

  const registry = readRegistry(registryPath);
  const existing = registry.entries.find((e) => e.id === opts.id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const entry: CleanupEntry = {
    id: opts.id,
    status: 'REGISTERED',
    kind: opts.kind,
    targetPath: opts.targetPath,
    reason: opts.reason,
    registeredAt: now,
    expiresAt: opts.expiresAt,
  };

  writeRegistry(registryPath, { version: 1, entries: [...registry.entries, entry] });
  return entry;
}

/**
 * Mark a registered entry as expired (without executing cleanup).
 * Useful for resources that are already gone or whose expiry is handled externally.
 */
export function expireEntry(registryPath: string, id: string): CleanupEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Cleanup entry '${id}' not found`);
  if (entry.status !== 'REGISTERED') {
    throw new Error(`Cannot expire entry '${id}': status is ${entry.status}`);
  }

  return updateEntry(registryPath, id, (e) => ({ ...e, status: 'EXPIRED' as const }));
}

/**
 * Remove a registered entry without executing any file operations.
 */
export function deregisterCleanup(registryPath: string, id: string): void {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Cleanup entry '${id}' not found`);
  if (entry.status === 'CLEANED') {
    throw new Error(`Cannot deregister '${id}': already cleaned`);
  }

  writeRegistry(registryPath, {
    version: 1,
    entries: registry.entries.filter((e) => e.id !== id),
  });
}

/**
 * Execute cleanup for an EXPIRED entry.  Removes the target path from disk.
 * Returns the updated entry (status CLEANED or FAILED).
 */
export function executeCleanup(
  registryPath: string,
  id: string,
  opts?: { dryRun?: boolean; cleanedBy?: string },
): CleanupEntry {
  const registry = readRegistry(registryPath);
  const entry = registry.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Cleanup entry '${id}' not found`);
  if (entry.status !== 'EXPIRED') {
    throw new Error(`Cannot execute cleanup for '${id}': status is ${entry.status}, expected EXPIRED`);
  }

  let error: string | undefined;
  let cleaned = false;

  if (!opts?.dryRun) {
    try {
      const stat = fs.lstatSync(entry.targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(entry.targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(entry.targetPath);
      }
      cleaned = true;
    } catch (e) {
      const err = e as Error & { code?: string };
      error = err.code ? `${err.code}: ${err.message}` : err.message;
    }
  } else {
    cleaned = fs.existsSync(entry.targetPath);
  }

  const now = new Date().toISOString();
  const newStatus: CleanupStatus = cleaned ? 'CLEANED' : 'FAILED';

  return updateEntry(registryPath, id, (e) => ({
    ...e,
    status: newStatus,
    cleanedAt: now,
    cleanedBy: opts?.cleanedBy,
    error,
  }));
}

/**
 * Expire all entries whose expiresAt < now and optionally execute their cleanup.
 * Returns the list of updated entries.
 */
export function processExpiredEntries(
  registryPath: string,
  opts?: { dryRun?: boolean; cleanedBy?: string; execute?: boolean },
): CleanupEntry[] {
  const registry = readRegistry(registryPath);
  const now = new Date().toISOString();

  const results: CleanupEntry[] = [];

  for (const entry of registry.entries) {
    if (entry.status !== 'REGISTERED') continue;
    if (entry.expiresAt >= now) continue;

    const expired = updateEntry(registryPath, entry.id, (e) => ({ ...e, status: 'EXPIRED' as const }));
    results.push(expired);

    if (opts?.execute) {
      results[results.length - 1] = executeCleanup(registryPath, entry.id, opts);
    }
  }

  return results;
}

/**
 * Get the current status of a cleanup entry.
 */
export function getCleanupStatus(registryPath: string, id: string): CleanupEntry | undefined {
  return readRegistry(registryPath).entries.find((e) => e.id === id);
}

/**
 * List all cleanup entries, optionally filtered by status or kind.
 */
export function listCleanupEntries(
  registryPath: string,
  opts?: { status?: CleanupStatus; kind?: CleanupKind },
): CleanupEntry[] {
  const registry = readRegistry(registryPath);
  return registry.entries.filter((e) => {
    if (opts?.status && e.status !== opts.status) return false;
    if (opts?.kind && e.kind !== opts.kind) return false;
    return true;
  });
}
