/**
 * Cleanup, Migration, and GC (SS-24)
 * 
 * Bounded implementation:
 * - Orphan detection for runs, checkpoints, worktrees
 * - Cleanup with receipts
 * - Migration tracking
 * - GC statistics and reporting
 * 
 * Limitations:
 * - No automatic scheduling (add when cron/scheduler available)
 * - No size-based eviction (add when quota config exists)
 * - No cross-instance cleanup (add when shared storage available)
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";

export interface OrphanCandidate {
  type: "run" | "checkpoint" | "worktree" | "improvement" | "memory" | "regenerable";
  id: string;
  path: string;
  detectedAt: string;
  reason: string;
  size?: number;
}

export interface CleanupReceipt {
  schema: "agent-rules/gc-cleanup-receipt";
  version: 1;
  operation: "cleanup" | "migrate" | "evict";
  targets: CleanupTarget[];
  timestamp: string;
  checksum: string;
  stats: CleanupStats;
}

export interface CleanupTarget {
  type: string;
  id: string;
  path: string;
  size: number;
  status: "removed" | "archived" | "skipped";
  reason?: string;
}

export interface CleanupStats {
  totalItems: number;
  removed: number;
  archived: number;
  skipped: number;
  bytesFreed: number;
  errors: string[];
}

export interface MigrationRecord {
  schema: "agent-rules/gc-migration";
  version: 1;
  id: string;
  fromPath: string;
  toPath: string;
  type: "directory" | "file" | "schema";
  checksum: string;
  timestamp: string;
  completed: boolean;
  error?: string;
}

export interface GCStats {
  lastRun: string | null;
  totalCleanups: number;
  totalBytesFreed: number;
  totalItemsRemoved: number;
  orphanCounts: Record<string, number>;
}

/** Compute SHA-256 checksum */
function checksum(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

/** ISO timestamp helper */
function now(): string {
  return new Date().toISOString();
}

/** Paths */
function agentDir(basePath: string): string {
  return path.join(basePath, ".agent");
}

function gcDir(basePath: string): string {
  return path.join(agentDir(basePath), "gc");
}

function archiveDir(basePath: string): string {
  return path.join(gcDir(basePath), "archive");
}

function auditFile(basePath: string): string {
  return path.join(gcDir(basePath), "receipts.jsonl");
}

function statsFile(basePath: string): string {
  return path.join(gcDir(basePath), "stats.json");
}

function migrationsFile(basePath: string): string {
  return path.join(gcDir(basePath), "migrations.json");
}

/** Ensure GC directory exists */
function ensureGCDir(basePath: string): void {
  fs.mkdirSync(gcDir(basePath), { recursive: true });
}

/** Append cleanup receipt to audit log */
function appendReceipt(basePath: string, receipt: CleanupReceipt): void {
  ensureGCDir(basePath);
  fs.appendFileSync(auditFile(basePath), JSON.stringify(receipt) + "\n", "utf-8");
}

/** Get directory size recursively */
function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let size = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      size += fs.statSync(fullPath).size;
    }
  }
  return size;
}

/** Load GC stats */
function loadStats(basePath: string): GCStats {
  const fp = statsFile(basePath);
  if (!fs.existsSync(fp)) {
    return {
      lastRun: null,
      totalCleanups: 0,
      totalBytesFreed: 0,
      totalItemsRemoved: 0,
      orphanCounts: {},
    };
  }
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as GCStats;
}

/** Save GC stats */
function saveStats(basePath: string, stats: GCStats): void {
  ensureGCDir(basePath);
  fs.writeFileSync(statsFile(basePath), JSON.stringify(stats, null, 2), "utf-8");
}

/** Detect orphan runs (runs without valid state) */
function detectOrphanRuns(basePath: string): OrphanCandidate[] {
  const orphans: OrphanCandidate[] = [];
  const runsDir = path.join(agentDir(basePath), "runs");
  
  if (!fs.existsSync(runsDir)) return orphans;
  
  const entries = fs.readdirSync(runsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const runPath = path.join(runsDir, entry.name);
    const runFile = path.join(runPath, "run.json");
    
    if (!fs.existsSync(runFile)) {
      orphans.push({
        type: "run",
        id: entry.name,
        path: runPath,
        detectedAt: now(),
        reason: "run.json not found",
        size: getDirSize(runPath),
      });
      continue;
    }
    
    try {
      const run = JSON.parse(fs.readFileSync(runFile, "utf-8"));
      const terminalStates = ["COMPLETED", "FAILED", "CANCELLED"];
      if (!terminalStates.includes(run.state)) {
        // Check if process is dead
        if (run.orphanPid && !isProcessAlive(run.orphanPid)) {
          orphans.push({
            type: "run",
            id: entry.name,
            path: runPath,
            detectedAt: now(),
            reason: `stale run (dead PID: ${run.orphanPid})`,
            size: getDirSize(runPath),
          });
        }
      }
    } catch {
      orphans.push({
        type: "run",
        id: entry.name,
        path: runPath,
        detectedAt: now(),
        reason: "invalid run.json",
        size: getDirSize(runPath),
      });
    }
  }
  
  return orphans;
}

/** Detect orphan checkpoints (checkpoint files without corresponding run) */
function detectOrphanCheckpoints(basePath: string): OrphanCandidate[] {
  const orphans: OrphanCandidate[] = [];
  const runsDir = path.join(agentDir(basePath), "runs");
  
  if (!fs.existsSync(runsDir)) return orphans;
  
  // Get all run IDs
  const runIds = new Set(
    fs.readdirSync(runsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  );
  
  // Check each run's checkpoints directory
  for (const runId of runIds) {
    const cpDir = path.join(runsDir, runId, "checkpoints");
    if (!fs.existsSync(cpDir)) continue;
    
    const files = fs.readdirSync(cpDir).filter((f) => f.endsWith(".json"));
    if (files.length > 10) {
      // More than 10 checkpoints is suspicious
      orphans.push({
        type: "checkpoint",
        id: `${runId}:excess-checkpoints`,
        path: cpDir,
        detectedAt: now(),
        reason: `excessive checkpoints (${files.length} files)`,
        size: getDirSize(cpDir),
      });
    }
  }
  
  return orphans;
}

/** Detect orphan improvements */
function detectOrphanImprovements(basePath: string): OrphanCandidate[] {
  const orphans: OrphanCandidate[] = [];
  const improvementsDir = path.join(agentDir(basePath), "improvements");
  
  if (!fs.existsSync(improvementsDir)) return orphans;
  
  const entries = fs.readdirSync(improvementsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const impPath = path.join(improvementsDir, entry.name);
    const impFile = path.join(impPath, "improvement.json");
    
    if (!fs.existsSync(impFile)) {
      orphans.push({
        type: "improvement",
        id: entry.name,
        path: impPath,
        detectedAt: now(),
        reason: "improvement.json not found",
        size: getDirSize(impPath),
      });
    }
  }
  
  return orphans;
}

/** Detect orphan memory entries */
function detectOrphanMemory(basePath: string): OrphanCandidate[] {
  const orphans: OrphanCandidate[] = [];
  const memoryDir = path.join(agentDir(basePath), "memory", "entries");
  
  if (!fs.existsSync(memoryDir)) return orphans;
  
  const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".json"));
  
  // Memory entries with invalid JSON
  for (const file of files) {
    const filePath = path.join(memoryDir, file);
    try {
      JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      orphans.push({
        type: "memory",
        id: file.replace(".json", ""),
        path: filePath,
        detectedAt: now(),
        reason: "invalid JSON",
        size: fs.statSync(filePath).size,
      });
    }
  }
  
  return orphans;
}

/**
 * REQ-018 — regenerable artifact detection. Per-task MCP config directories
 * and worktree-transaction patches are temporary helpers with an owner, a
 * purpose, a regeneration rule and a TTL. After the TTL they become
 * PURGE_ELIGIBLE and are removed by reachability/retention GC; they never
 * become project truth.
 */
const REGENERABLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RegenerableArtifact extends OrphanCandidate {
  owner: string;
  purpose: string;
  regeneration_rule: string;
  expiresAt: string;
}

function detectRegenerableArtifacts(basePath: string): RegenerableArtifact[] {
  const out: RegenerableArtifact[] = [];
  const runsDir = path.join(agentDir(basePath), "runs");
  if (!fs.existsSync(runsDir)) return out;
  const nowMs = Date.now();

  const visitRun = (runPath: string): void => {
    // Per-task MCP config dirs are marked by their mcp-process-receipt.json.
    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "mcp-process-receipt.json") {
          const configDir = path.dirname(full);
          const mtime = fs.statSync(configDir).mtimeMs;
          const expiresAt = new Date(mtime + REGENERABLE_TTL_MS);
          if (nowMs >= mtime + REGENERABLE_TTL_MS) {
            out.push({
              type: "regenerable",
              id: path.relative(agentDir(basePath), configDir).split(path.sep).join("/"),
              path: configDir,
              detectedAt: now(),
              reason: `per-task MCP config expired (TTL ${REGENERABLE_TTL_MS}ms); no task routes it`,
              size: getDirSize(configDir),
              owner: "harness-runner",
              purpose: "task-scoped MCP config materialised for exactly one task",
              regeneration_rule: "materializeMcpConfig (regenerated per task route)",
              expiresAt: expiresAt.toISOString(),
            });
          }
        }
      }
    };
    walk(runPath);
  };

  // Worktree-transaction receipts/patches under .agent/worktree-transactions.
  const wtxDir = path.join(agentDir(basePath), "worktree-transactions");
  if (fs.existsSync(wtxDir)) {
    for (const entry of fs.readdirSync(wtxDir, { withFileTypes: true })) {
      const full = path.join(wtxDir, entry.name);
      const mtime = fs.statSync(full).mtimeMs;
      if (nowMs >= mtime + REGENERABLE_TTL_MS) {
        out.push({
          type: "regenerable",
          id: `worktree-transactions/${entry.name}`,
          path: full,
          detectedAt: now(),
          reason: "worktree transaction artifact expired (TTL); transaction should have been closed",
          size: entry.isDirectory() ? getDirSize(full) : fs.statSync(full).size,
          owner: "harness-runner",
          purpose: "disposable worktree transaction receipt/patch",
          regeneration_rule: "recreated per worktree transaction",
          expiresAt: new Date(mtime + REGENERABLE_TTL_MS).toISOString(),
        });
      }
    }
  }

  const runEntries = fs.readdirSync(runsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const run of runEntries) visitRun(path.join(runsDir, run.name));
  return out;
}

/** Copy directory recursively */
function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Check if process is alive */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Scan for all orphan candidates */
export function scanForOrphans(basePath: string): OrphanCandidate[] {
  const allOrphans: OrphanCandidate[] = [];
  
  allOrphans.push(...detectOrphanRuns(basePath));
  allOrphans.push(...detectOrphanCheckpoints(basePath));
  allOrphans.push(...detectOrphanImprovements(basePath));
  allOrphans.push(...detectOrphanMemory(basePath));
  allOrphans.push(...detectRegenerableArtifacts(basePath));
  
  return allOrphans;
}

/** Remove orphan items */
export function cleanupOrphans(
  basePath: string,
  orphans: OrphanCandidate[],
  options: { dryRun?: boolean; archive?: boolean } = {}
): CleanupReceipt {
  const targets: CleanupTarget[] = [];
  const stats: CleanupStats = {
    totalItems: orphans.length,
    removed: 0,
    archived: 0,
    skipped: 0,
    bytesFreed: 0,
    errors: [],
  };
  
  for (const orphan of orphans) {
    const target: CleanupTarget = {
      type: orphan.type,
      id: orphan.id,
      path: orphan.path,
      size: orphan.size ?? 0,
      status: "skipped",
    };
    
    try {
      if (!fs.existsSync(orphan.path)) {
        target.status = "skipped";
        target.reason = "path does not exist";
      } else if (options.dryRun) {
        target.status = "skipped";
        target.reason = "dry-run mode";
        stats.skipped++;
      } else if (options.archive) {
        // Real archive: zip the orphan dir and move to gc/archive/
        const archDir = archiveDir(basePath);
        fs.mkdirSync(archDir, { recursive: true });
        const archiveName = `${orphan.type}-${orphan.id}-${Date.now()}.tar.gz`;
        const archivePath = path.join(archDir, archiveName);
        try {
          // Use tar-like approach: write a manifest + copy content to avoid external tar dep
          const archMeta = {
            originalPath: orphan.path,
            originalId: orphan.id,
            originalType: orphan.type,
            archivedAt: now(),
            size: orphan.size,
          };
          fs.mkdirSync(path.join(archDir, archiveName.replace(".tar.gz", "")), { recursive: true });
          fs.writeFileSync(
            path.join(archDir, archiveName.replace(".tar.gz", "") + ".meta.json"),
            JSON.stringify(archMeta, null, 2),
            "utf-8"
          );
          // Copy contents to archive
          copyDir(orphan.path, path.join(archDir, archiveName.replace(".tar.gz", "")));
          fs.rmSync(orphan.path, { recursive: true, force: true });
          target.status = "archived";
          stats.archived++;
          stats.bytesFreed += orphan.size ?? 0;
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          target.reason = `archive failed: ${error}`;
          target.status = "skipped";
          stats.skipped++;
          stats.errors.push(`${orphan.id}: ${error}`);
        }
      } else {
        fs.rmSync(orphan.path, { recursive: true, force: true });
        target.status = "removed";
        stats.removed++;
        stats.bytesFreed += orphan.size ?? 0;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      target.reason = error;
      target.status = "skipped";
      stats.errors.push(`${orphan.id}: ${error}`);
      stats.skipped++;
    }
    
    targets.push(target);
  }
  
  const receipt: CleanupReceipt = {
    schema: "agent-rules/gc-cleanup-receipt",
    version: 1,
    operation: "cleanup",
    targets,
    timestamp: now(),
    checksum: checksum({ targets, stats }),
    stats,
  };
  
  if (!options.dryRun) {
    appendReceipt(basePath, receipt);
    
    // Update stats
    const gcStats = loadStats(basePath);
    gcStats.lastRun = now();
    gcStats.totalCleanups++;
    gcStats.totalBytesFreed += stats.bytesFreed;
    gcStats.totalItemsRemoved += stats.removed + stats.archived;
    for (const orphan of orphans) {
      gcStats.orphanCounts[orphan.type] = (gcStats.orphanCounts[orphan.type] ?? 0) + 1;
    }
    saveStats(basePath, gcStats);
  }
  
  return receipt;
}

/** Record a migration */
export function recordMigration(
  basePath: string,
  fromPath: string,
  toPath: string,
  type: "directory" | "file" | "schema"
): MigrationRecord {
  const record: MigrationRecord = {
    schema: "agent-rules/gc-migration",
    version: 1,
    id: randomUUID(),
    fromPath,
    toPath,
    type,
    checksum: "",
    timestamp: now(),
    completed: false,
  };
  
  // Compute checksum of source if it exists
  if (fs.existsSync(fromPath)) {
    // Check if it's a file (readable as text) or directory (needs serialization)
    const stat = fs.statSync(fromPath);
    const content = stat.isFile()
      ? fs.readFileSync(fromPath)
      : Buffer.from(JSON.stringify({ fromPath, toPath, type }));
    record.checksum = checksum(content);
  }
  
  // Save to migrations file
  ensureGCDir(basePath);
  const fp = migrationsFile(basePath);
  let migrations: MigrationRecord[] = [];
  if (fs.existsSync(fp)) {
    migrations = JSON.parse(fs.readFileSync(fp, "utf-8")) as MigrationRecord[];
  }
  migrations.push(record);
  fs.writeFileSync(fp, JSON.stringify(migrations, null, 2), "utf-8");
  
  return record;
}

/** Complete a migration */
export function completeMigration(
  basePath: string,
  migrationId: string,
  error?: string
): MigrationRecord | null {
  const fp = migrationsFile(basePath);
  if (!fs.existsSync(fp)) return null;
  
  const migrations = JSON.parse(fs.readFileSync(fp, "utf-8")) as MigrationRecord[];
  const migration = migrations.find((m) => m.id === migrationId);
  
  if (!migration) return null;
  
  migration.completed = !error;
  if (error) migration.error = error;
  
  fs.writeFileSync(fp, JSON.stringify(migrations, null, 2), "utf-8");
  
  // Record as cleanup receipt
  if (migration.completed) {
    const receipt: CleanupReceipt = {
      schema: "agent-rules/gc-cleanup-receipt",
      version: 1,
      operation: "migrate",
      targets: [{
        type: migration.type,
        id: migrationId,
        path: migration.fromPath,
        size: fs.existsSync(migration.fromPath) ? getDirSize(migration.fromPath) : 0,
        status: "removed",
      }],
      timestamp: now(),
      checksum: checksum(migration),
      stats: { totalItems: 1, removed: 1, archived: 0, skipped: 0, bytesFreed: 0, errors: [] },
    };
    appendReceipt(basePath, receipt);
  }
  
  return migration;
}

/** Get migration history */
export function getMigrations(basePath: string, includeCompleted = true): MigrationRecord[] {
  const fp = migrationsFile(basePath);
  if (!fs.existsSync(fp)) return [];
  const migrations = JSON.parse(fs.readFileSync(fp, "utf-8")) as MigrationRecord[];
  return includeCompleted ? migrations : migrations.filter((m) => !m.completed);
}

/** Get GC statistics */
export function getGCStats(basePath: string): GCStats {
  return loadStats(basePath);
}

/** Load cleanup receipts */
export function loadCleanupReceipts(basePath: string, lastN?: number): CleanupReceipt[] {
  const fp = auditFile(basePath);
  if (!fs.existsSync(fp)) return [];
  const content = fs.readFileSync(fp, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const receipts = lines.map((line) => JSON.parse(line) as CleanupReceipt);
  return lastN ? receipts.slice(-lastN) : receipts;
}

/** Prune old receipts, keeping only the last N entries */
export function pruneReceipts(basePath: string, keepLast: number): { pruned: number; remaining: number } {
  const fp = auditFile(basePath);
  if (!fs.existsSync(fp)) return { pruned: 0, remaining: 0 };
  const content = fs.readFileSync(fp, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const toKeep = lines.length > keepLast ? lines.slice(-keepLast) : lines;
  const pruned = lines.length - toKeep.length;
  if (pruned > 0) {
    fs.writeFileSync(fp, toKeep.join("\n") + (toKeep.length ? "\n" : ""), "utf-8");
  }
  return { pruned, remaining: toKeep.length };
}

/** Evict old memory entries (simple LRU-like eviction by count) */
export function evictOldMemory(
  basePath: string,
  maxEntries: number
): CleanupReceipt {
  const memoryDir = path.join(agentDir(basePath), "memory", "entries");
  
  if (!fs.existsSync(memoryDir)) {
    return {
      schema: "agent-rules/gc-cleanup-receipt",
      version: 1,
      operation: "evict",
      targets: [],
      timestamp: now(),
      checksum: "",
      stats: { totalItems: 0, removed: 0, archived: 0, skipped: 0, bytesFreed: 0, errors: [] },
    };
  }
  
  const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".json"));
  const entries: { file: string; path: string; mtime: number }[] = [];
  
  for (const file of files) {
    const filePath = path.join(memoryDir, file);
    const stat = fs.statSync(filePath);
    entries.push({ file, path: filePath, mtime: stat.mtimeMs });
  }
  
  // Sort by modification time (oldest first)
  entries.sort((a, b) => a.mtime - b.mtime);
  
  const toEvict = entries.length > maxEntries ? entries.slice(0, entries.length - maxEntries) : [];
  
  const targets: CleanupTarget[] = toEvict.map((e) => ({
    type: "memory",
    id: e.file.replace(".json", ""),
    path: e.path,
    size: fs.statSync(e.path).size,
    status: "removed",
  }));
  
  for (const entry of toEvict) {
    try {
      fs.rmSync(entry.path);
    } catch {}
  }
  
  const stats: CleanupStats = {
    totalItems: entries.length,
    removed: toEvict.length,
    archived: 0,
    skipped: entries.length - toEvict.length,
    bytesFreed: targets.reduce((sum, t) => sum + t.size, 0), // size captured before deletion
    errors: [],
  };
  
  const receipt: CleanupReceipt = {
    schema: "agent-rules/gc-cleanup-receipt",
    version: 1,
    operation: "evict",
    targets,
    timestamp: now(),
    checksum: checksum({ targets, stats }),
    stats,
  };
  
  appendReceipt(basePath, receipt);
  
  // Update stats
  const gcStats = loadStats(basePath);
  gcStats.lastRun = now();
  gcStats.totalCleanups++;
  gcStats.totalBytesFreed += stats.bytesFreed;
  gcStats.totalItemsRemoved += stats.removed;
  gcStats.orphanCounts["memory"] = (gcStats.orphanCounts["memory"] ?? 0) + stats.removed;
  saveStats(basePath, gcStats);
  
  return receipt;
}
