import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type LifecycleState =
  | "ACTIVE"
  | "SUPERSEDED"
  | "RETIRED"
  | "PURGE_ELIGIBLE"
  | "PURGED"
  | "HISTORICAL";

export interface LifecycleItem {
  path: string;
  state: LifecycleState;
  lifecycleClass: string;
  activeReference: boolean;
  reason: string;
}

/**
 * One content-addressed compaction candidate. Raw runs/checkpoints under
 * `.agent/runs/**` are archived into `.agent/archive/objects/<sha256>` and only
 * removed after the archive object round-trip-verifies (object hash matches the
 * original content hash and the restored bytes equal the original bytes).
 */
export interface CompactionEntry {
  path: string;
  sha256: string;
  sizeBytes: number;
  archiveObject: string;
  /** The content-addressed object already exists in the archive. */
  objectExists: boolean;
  /** Archive integrity: the stored object hashes to the entry sha256. */
  objectHashMatch: boolean;
  /**
   * Round-trip verification: restore probe — object bytes equal the original
   * bytes when the original is still present; when the original was already
   * removed, the hash itself is the restore identity (objectHashMatch).
   */
  restoredMatch: boolean;
  /** Tombstone entry was written for this item before archiving. */
  tombstoned: boolean;
  /** Object verified present (hash match) at the end of this run. */
  archived: boolean;
  /** Fail-closed: item cannot be safely compacted (original lost or stale). */
  blocked: boolean;
  blockedReason: string | null;
}

export interface CompactionReport {
  schema: "artifact/cleanup-compaction-report";
  version: 1;
  /** Non-dry-run AND explicit --compact: archiving is actually applied. */
  applyRequested: boolean;
  dryRun: boolean;
  entries: CompactionEntry[];
  archiveRoot: string;
  manifestPath: string;
  tombstonePath: string | null;
  /**
   * Every candidate is recoverable from content hashes: either a verified
   * archive object already exists, or the original content is present to be
   * hashed and (re-)archived.
   */
  recoverableFromHashes: boolean;
  applied: string[];
  blocked: string[];
  /** Interrupted prior compaction tombstones found with pending entries. */
  pendingTombstones: number;
  /** Pending tombstone entries verified/re-archived during recovery. */
  recovered: number;
}

export interface LifecycleReport {
  schema: "artifact/cleanup-lifecycle-report";
  version: 1;
  repoRoot: string;
  dryRun: boolean;
  activeWorkId: string | null;
  activeGeneration: number | null;
  activeReferences: string[];
  items: LifecycleItem[];
  eligible: string[];
  applied: string[];
  compaction: CompactionReport;
  receiptPath: string | null;
  hash: string;
}

const COMPACTION_TOMBSTONE_SCHEMA = "artifact/cleanup-compaction-tombstone";
const ARCHIVE_MANIFEST_SCHEMA = "harness/content-addressed-archive/v1";

function rel(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function safeReadJson(file: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function walk(root: string, current: string, out: string[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(root, absolute, out);
    else if (entry.isFile()) out.push(rel(root, absolute));
  }
}

function under(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

function activeRefs(root: string, pointer: Record<string, unknown> | null): Set<string> {
  const refs = new Set<string>([".agent/current.json"]);
  if (!pointer) return refs;
  const add = (value: unknown) => {
    if (typeof value === "string" && value.length > 0 && !path.isAbsolute(value)) refs.add(value.split(path.sep).join("/"));
  };
  add(pointer.plan_root);
  for (const field of ["original", "canonical_ledger", "effective_chain_tip", "candidate_chain_tip", "contract"]) {
    const item = pointer[field];
    if (item && typeof item === "object") add((item as Record<string, unknown>).path);
  }
  return refs;
}

function classify(relative: string, refs: Set<string>, activePlanRoot: string | null): LifecycleItem {
  const active = [...refs].some((reference) => under(relative, reference)) || (activePlanRoot !== null && under(relative, activePlanRoot));
  if (active) return { path: relative, state: "ACTIVE", lifecycleClass: "intent_and_contract", activeReference: true, reason: "current pointer or active plan reference" };
  if (relative === ".agent/current.json") return { path: relative, state: "ACTIVE", lifecycleClass: "intent_and_contract", activeReference: true, reason: "current pointer is protected" };
  if (relative.startsWith(".agent/tmp/")) return { path: relative, state: "PURGE_ELIGIBLE", lifecycleClass: "ephemeral_helper_or_test", activeReference: false, reason: "ignored scratch/runtime helper outside active references" };
  if (relative.includes("v3-decision-fabric")) return { path: relative, state: "HISTORICAL", lifecycleClass: "historical_archive", activeReference: false, reason: "completed V3 proof retained for audit" };
  if (relative.startsWith(".agent/plans/") || relative.startsWith(".agent/ledger/")) return { path: relative, state: "SUPERSEDED", lifecycleClass: "historical_archive", activeReference: false, reason: "not reachable from the active pointer; preserve until explicit retirement" };
  if (relative.startsWith(".agent/evidence/")) return { path: relative, state: "RETIRED", lifecycleClass: "durable_evidence", activeReference: false, reason: "durable evidence is not active retrieval authority" };
  if (relative.startsWith(".agent/runs/")) return { path: relative, state: "RETIRED", lifecycleClass: "ephemeral_helper_or_test", activeReference: false, reason: "raw run/checkpoint — content-addressed compaction candidate (archived before removal)" };
  if (relative.startsWith(".agent/archive/")) return { path: relative, state: "RETIRED", lifecycleClass: "content_addressed_archive", activeReference: false, reason: "content-addressed archive — never purged or re-archived" };
  return { path: relative, state: "RETIRED", lifecycleClass: "shared_artifact", activeReference: false, reason: "unreachable durable artifact; fail closed and retain" };
}

export function lifecycleInventory(repoRoot: string): { pointer: Record<string, unknown> | null; items: LifecycleItem[]; activeReferences: string[] } {
  const agentRoot = path.join(repoRoot, ".agent");
  const pointer = safeReadJson(path.join(agentRoot, "current.json"));
  const refs = activeRefs(repoRoot, pointer);
  const activePlanRoot = typeof pointer?.plan_root === "string" ? pointer.plan_root : null;
  const files: string[] = [];
  if (fs.existsSync(agentRoot)) walk(repoRoot, agentRoot, files);
  const items = files.sort().map((file) => classify(file, refs, activePlanRoot));
  return { pointer, items, activeReferences: [...refs].sort() };
}

/** Raw runs/checkpoints are the only compaction candidates; never plans, ledgers, evidence, or pointers. */
function compactionCandidates(items: LifecycleItem[]): LifecycleItem[] {
  return items.filter((item) => item.path.startsWith(".agent/runs/") && !item.activeReference);
}

function sha256OfBytes(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file: string): string | null {
  try {
    return sha256OfBytes(fs.readFileSync(file));
  } catch {
    return null;
  }
}

function bytesEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

function contentAddressedObject(repoRoot: string, sha256: string): string {
  return path.join(repoRoot, ".agent", "archive", "objects", sha256).split(path.sep).join("/");
}

/** Atomic JSON write: write to a temp sibling, then rename over the target. */
function atomicWriteJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(temp, file);
}

function readArchiveManifest(repoRoot: string): Record<string, unknown> {
  const manifestPath = path.join(repoRoot, ".agent", "archive", "manifest.json");
  return safeReadJson(manifestPath) ?? { schema: ARCHIVE_MANIFEST_SCHEMA, version: 1, entries: {} };
}

interface RecoveryResult {
  pendingTombstones: number;
  recovered: number;
  blocked: string[];
}

/**
 * Edge-case recovery: an archive interrupted before (or after) tombstone
 * creation must be recoverable from content hashes. Every `compact-*.json`
 * tombstone with pending entries is re-checked: archive objects are re-verified
 * by hash, missing objects are re-archived from the still-present original, and
 * mismatches fail closed (no deletion) and are reported.
 */
function recoverFromTombstones(repoRoot: string, apply: boolean): RecoveryResult {
  const result: RecoveryResult = { pendingTombstones: 0, recovered: 0, blocked: [] };
  const tombstonesDir = path.join(repoRoot, ".agent", "tombstones");
  let files: string[] = [];
  try {
    files = fs.readdirSync(tombstonesDir).filter((name) => name.startsWith("compact-") && name.endsWith(".json"));
  } catch {
    return result;
  }
  for (const file of files) {
    const tombstonePath = path.join(tombstonesDir, file);
    const tombstone = safeReadJson(tombstonePath);
    if (!tombstone || !Array.isArray(tombstone.entries)) continue;
    const pending = tombstone.entries.filter((entry) => (entry as Record<string, unknown>).status !== "archived");
    if (pending.length === 0) continue;
    result.pendingTombstones += 1;
    let dirty = false;
    for (const rawEntry of pending) {
      const entry = rawEntry as Record<string, unknown>;
      const originalPath = path.join(repoRoot, String(entry.path ?? ""));
      const objectPath = path.join(repoRoot, String(entry.archiveObject ?? ""));
      const expectedHash = typeof entry.sha256 === "string" ? entry.sha256 : null;
      if (expectedHash === null) {
        result.blocked.push(`${String(entry.path)}: tombstone entry has no content hash; cannot recover from hashes`);
        continue;
      }
      const objectHash = sha256File(objectPath);
      if (objectHash === expectedHash) {
        // Object present and hash-bound. Restore probe: if the original still
        // exists, its bytes must equal the archive object; otherwise the hash
        // is the restore identity. Either way the entry is verified.
        let verified = true;
        if (fs.existsSync(originalPath)) {
          const originalBytes = fs.readFileSync(originalPath);
          const objectBytes = fs.readFileSync(objectPath);
          if (!bytesEqual(originalBytes, objectBytes)) {
            verified = false;
            result.blocked.push(`${String(entry.path)}: archive object hash matches but original bytes changed; fail closed, no deletion`);
          }
        }
        if (verified) {
          entry.status = "archived";
          result.recovered += 1;
          dirty = true;
        }
      } else if (fs.existsSync(originalPath)) {
        if (apply) {
          fs.mkdirSync(path.dirname(objectPath), { recursive: true });
          try {
            fs.copyFileSync(originalPath, objectPath);
            if (sha256File(objectPath) === expectedHash) {
              entry.status = "archived";
              result.recovered += 1;
              dirty = true;
            } else {
              result.blocked.push(`${String(entry.path)}: re-archive from original failed hash verification`);
            }
          } catch (error) {
            result.blocked.push(`${String(entry.path)}: re-archive failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          result.blocked.push(`${String(entry.path)}: archive object missing or corrupt; original present — re-archive with apply`);
        }
      } else {
        result.blocked.push(`${String(entry.path)}: neither original nor valid archive object — recovery from content hashes impossible`);
      }
    }
    if (dirty && apply) atomicWriteJson(tombstonePath, tombstone);
  }
  return result;
}

function planCompaction(repoRoot: string, items: LifecycleItem[], apply: boolean): CompactionReport {
  const candidates = compactionCandidates(items);
  // Both paths are repo-relative (like tombstonePath) so callers can resolve
  // them with path.join(repoRoot, ...) without double-nesting absolute paths.
  const archiveRoot = ".agent/archive";
  const manifestPath = ".agent/archive/manifest.json";
  const recovery = recoverFromTombstones(repoRoot, apply);
  const entries: CompactionEntry[] = [];
  const applied: string[] = [];
  const blocked: string[] = [];
  let tombstonePath: string | null = null;

  interface PendingEntry { path: string; sha256: string; sizeBytes: number; archiveObject: string; status: string; }
  const pendingEntries: PendingEntry[] = [];

  for (const candidate of candidates) {
    const absolute = path.join(repoRoot, candidate.path);
    let bytes: Buffer | null = null;
    try {
      bytes = fs.readFileSync(absolute);
    } catch {
      bytes = null;
    }
    const sha256 = bytes !== null ? sha256OfBytes(bytes) : null;
    if (bytes === null || sha256 === null) {
      entries.push({
        path: candidate.path,
        sha256: "",
        sizeBytes: 0,
        archiveObject: "",
        objectExists: false,
        objectHashMatch: false,
        restoredMatch: false,
        tombstoned: false,
        archived: false,
        blocked: true,
        blockedReason: "original run/checkpoint is missing; recoverable only if a verified archive object exists",
      });
      blocked.push(candidate.path);
      continue;
    }
    const objectPath = contentAddressedObject(repoRoot, sha256);
    const objectExists = fs.existsSync(objectPath);
    const objectHashMatch = objectExists && sha256File(objectPath) === sha256;
    const objectBytes = objectExists ? fs.readFileSync(objectPath) : null;
    const restoredMatch = objectHashMatch && (bytes === null || (objectBytes !== null && bytesEqual(objectBytes, bytes)));
    const entry: CompactionEntry = {
      path: candidate.path,
      sha256,
      sizeBytes: bytes.length,
      archiveObject: rel(repoRoot, objectPath),
      objectExists,
      objectHashMatch,
      restoredMatch,
      tombstoned: false,
      archived: objectExists && objectHashMatch && restoredMatch,
      blocked: false,
      blockedReason: null,
    };
    if (!entry.objectHashMatch && objectExists) {
      entry.blocked = true;
      entry.blockedReason = "stale archive object does not match current content hash; fail closed until re-archived";
      blocked.push(candidate.path);
    }
    entries.push(entry);
    if (!entry.blocked) {
      pendingEntries.push({ path: candidate.path, sha256, sizeBytes: bytes.length, archiveObject: rel(repoRoot, objectPath), status: "pending" });
    }
  }

  if (apply) {
    // Tombstone BEFORE archiving: the tombstone carries the content hashes, so
    // an archive interrupted after tombstone creation is recoverable from
    // hashes, and an interruption before tombstone creation leaves originals
    // untouched (also recoverable from content hashes).
    if (pendingEntries.length > 0) {
      const name = `compact-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      tombstonePath = path.join(".agent", "tombstones", name).split(path.sep).join("/");
      const tombstoneBody = {
        schema: COMPACTION_TOMBSTONE_SCHEMA,
        version: 1,
        createdAt: new Date().toISOString(),
        repoRoot,
        entries: pendingEntries.map((entry) => ({ ...entry, status: "pending" })),
      };
      const tombstoneHash = crypto.createHash("sha256").update(JSON.stringify(tombstoneBody)).digest("hex");
      atomicWriteJson(path.join(repoRoot, tombstonePath), { ...tombstoneBody, hash: tombstoneHash });
    }
    for (const entry of entries) {
      if (entry.blocked) continue;
      const objectPath = path.join(repoRoot, entry.archiveObject);
      const originalPath = path.join(repoRoot, entry.path);
      let archived = false;
      if (fs.existsSync(objectPath) && entry.objectHashMatch && entry.restoredMatch) {
        archived = true;
      } else {
        fs.mkdirSync(path.dirname(objectPath), { recursive: true });
        // Atomic object write: temp sibling + rename, then hash-verify.
        const temp = `${objectPath}.tmp-${process.pid}-${Date.now()}`;
        fs.copyFileSync(originalPath, temp);
        fs.renameSync(temp, objectPath);
        const verified = sha256File(objectPath) === entry.sha256;
        if (verified) {
          const restoredBytes = fs.readFileSync(objectPath);
          const originalBytes = fs.readFileSync(originalPath);
          entry.restoredMatch = bytesEqual(restoredBytes, originalBytes);
          entry.objectHashMatch = true;
          entry.objectExists = true;
          archived = entry.restoredMatch;
        }
      }
      entry.tombstoned = tombstonePath !== null;
      entry.archived = archived;
      if (archived) {
        applied.push(entry.path);
        const manifest = readArchiveManifest(repoRoot);
        const manifestEntries = (manifest.entries ?? {}) as Record<string, unknown>;
        manifestEntries[entry.path] = {
          sha256: entry.sha256,
          sizeBytes: entry.sizeBytes,
          archivedAt: new Date().toISOString(),
        };
        manifest.entries = manifestEntries;
        manifest.updatedAt = new Date().toISOString();
        atomicWriteJson(path.join(repoRoot, manifestPath), manifest);
      } else {
        entry.blocked = true;
        entry.blockedReason = "archive object failed round-trip verification; original retained";
        blocked.push(entry.path);
      }
    }
    // Remove originals ONLY after tombstone + verified archive. Items whose
    // original bytes changed after archiving are never deleted.
    for (const entry of entries) {
      if (entry.blocked || !entry.archived || !entry.objectHashMatch || !entry.restoredMatch) continue;
      const originalPath = path.join(repoRoot, entry.path);
      const objectPath = path.join(repoRoot, entry.archiveObject);
      try {
        if (bytesEqual(fs.readFileSync(originalPath), fs.readFileSync(objectPath))) {
          fs.rmSync(originalPath, { force: true });
        } else {
          entry.blocked = true;
          entry.blockedReason = "original changed between archive and removal; fail closed";
          blocked.push(entry.path);
        }
      } catch {
        // Original already gone (idempotent re-run): object is the retained copy.
      }
    }
    // Mark tombstone entries archived once every verified entry is stored.
    if (tombstonePath !== null) {
      const tombstone = safeReadJson(path.join(repoRoot, tombstonePath));
      if (tombstone && Array.isArray(tombstone.entries)) {
        for (const rawEntry of tombstone.entries) {
          const entry = rawEntry as Record<string, unknown>;
          const matches = entries.find((candidate) => candidate.path === entry.path);
          if (matches?.archived && matches.objectHashMatch) entry.status = "archived";
        }
        atomicWriteJson(path.join(repoRoot, tombstonePath), tombstone);
      }
    }
  }

  const allBlocked = [...blocked, ...recovery.blocked];
  const recoverableFromHashes = recovery.blocked.length === 0 && entries.every((entry) => entry.blocked === false || entry.objectHashMatch || (() => {
    try { fs.accessSync(path.join(repoRoot, entry.path)); return true; } catch { return false; }
  })());

  return {
    schema: "artifact/cleanup-compaction-report",
    version: 1,
    applyRequested: apply,
    dryRun: !apply,
    entries,
    archiveRoot,
    manifestPath,
    tombstonePath,
    recoverableFromHashes,
    applied,
    blocked: allBlocked,
    pendingTombstones: recovery.pendingTombstones,
    recovered: recovery.recovered,
  };
}

export function runLifecycleCleanup(repoRoot: string, options: { dryRun: boolean; compact?: boolean }): LifecycleReport {
  const inventory = lifecycleInventory(repoRoot);
  const eligible = inventory.items.filter((item) => item.state === "PURGE_ELIGIBLE" && !item.activeReference).map((item) => item.path);
  const applied: string[] = [];
  if (!options.dryRun) {
    for (const relative of eligible) {
      const absolute = path.resolve(repoRoot, relative);
      const safe = path.relative(repoRoot, absolute);
      if (safe.startsWith("..") || path.isAbsolute(safe) || !relative.startsWith(".agent/tmp/")) continue;
      fs.rmSync(absolute, { recursive: true, force: true });
      applied.push(relative);
    }
  }
  // Compaction stays in dry-run (planned-only) unless the run is explicitly
  // non-dry-run AND --compact is requested.
  const applyCompaction = !options.dryRun && options.compact === true;
  const compaction = planCompaction(repoRoot, inventory.items, applyCompaction);
  const pointer = inventory.pointer;
  const body = {
    schema: "artifact/cleanup-lifecycle-report" as const,
    version: 1 as const,
    repoRoot,
    dryRun: options.dryRun,
    activeWorkId: typeof pointer?.work_id === "string" ? pointer.work_id : null,
    activeGeneration: Number.isInteger(pointer?.generation) ? Number(pointer?.generation) : null,
    activeReferences: inventory.activeReferences,
    items: inventory.items,
    eligible,
    applied,
    compaction,
  };
  const hash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  let receiptPath: string | null = null;
  if (!options.dryRun) {
    const name = `lifecycle-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    receiptPath = path.join(".agent", "tombstones", name).split(path.sep).join("/");
    fs.mkdirSync(path.join(repoRoot, ".agent", "tombstones"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, receiptPath), JSON.stringify({ ...body, hash }, null, 2) + "\n", "utf8");
  }
  return { ...body, hash, receiptPath };
}
