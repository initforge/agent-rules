import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  storeMemory,
  updateMemory,
  evictMemory,
  getMemory,
  listMemory,
  getMemoryStats,
  verifyMemoryIntegrity,
  compactAuditLog,
  loadAuditLog,
} from "../../src/lifecycle/memory.js";
import {
  createImprovement,
  getImprovement,
  listImprovements,
  getImprovementsByStage,
  promoteImprovement,
  rollbackImprovement,
  archiveImprovement,
  loadImprovementAudit,
  verifyImprovementIntegrity,
  loadImprovementHistory,
} from "../../src/lifecycle/improvement.js";
import {
  scanForOrphans,
  cleanupOrphans,
  recordMigration,
  completeMigration,
  getMigrations,
  getGCStats,
  loadCleanupReceipts,
  evictOldMemory,
  pruneReceipts,
} from "../../src/lifecycle/gc.js";

/** Temporary test workspace */
let testDir: string;

function testPath(...segments: string[]): string {
  return path.join(testDir, ...segments);
}

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ── Memory Lifecycle Tests ──────────────────────────────────────────────────

describe("Memory Lifecycle (SS-20)", () => {
  it("stores and retrieves memory entries", () => {
    const entry = storeMemory(testDir, "test-key", { foo: "bar" }, { source: "test" });
    expect(entry.id).toBeDefined();
    expect(entry.key).toBe("test-key");
    expect(entry.value).toEqual({ foo: "bar" });
    expect(entry.metadata.source).toBe("test");
    expect(entry.version).toBe(1);

    const retrieved = getMemory(testDir, entry.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.key).toBe("test-key");
  });

  it("updates existing memory entries", () => {
    const entry = storeMemory(testDir, "update-test", { v: 1 });
    const updated = updateMemory(testDir, entry.id, { v: 2 }, { updated: "true" });

    expect(updated).toBeDefined();
    expect(updated?.version).toBe(2);
    expect(updated?.value).toEqual({ v: 2 });
    expect(updated?.metadata.updated).toBe("true");
    expect(updated?.metadata.sha256).toBeDefined();
  });

  it("returns null when updating non-existent entry", () => {
    const result = updateMemory(testDir, "non-existent-id", { value: 1 });
    expect(result).toBeNull();
  });

  it("evicts memory entries", () => {
    const entry = storeMemory(testDir, "evict-test", { data: true });
    expect(getMemory(testDir, entry.id)).toBeDefined();

    const evicted = evictMemory(testDir, entry.id);
    expect(evicted).toBe(true);
    expect(getMemory(testDir, entry.id)).toBeNull();
  });

  it("evicts returns false for non-existent entries", () => {
    const result = evictMemory(testDir, "non-existent-id");
    expect(result).toBe(false);
  });

  it("lists all memory entries", () => {
    storeMemory(testDir, "key1", { n: 1 });
    storeMemory(testDir, "key2", { n: 2 });
    storeMemory(testDir, "key3", { n: 3 });

    const entries = listMemory(testDir);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.key).sort()).toEqual(["key1", "key2", "key3"]);
  });

  it("computes memory statistics", () => {
    storeMemory(testDir, "stat1", { data: "a".repeat(100) });
    storeMemory(testDir, "stat2", { data: "b".repeat(200) });

    const stats = getMemoryStats(testDir);
    expect(stats.entryCount).toBe(2);
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.oldestEntry).toBeDefined();
    expect(stats.newestEntry).toBeDefined();
  });

  it("verifies memory integrity", () => {
    const entry = storeMemory(testDir, "integrity-test", { value: 123 });

    const valid = verifyMemoryIntegrity(testDir, entry.id);
    expect(valid.valid).toBe(true);
    expect(valid.entry).toBeDefined();
  });

  it("detects integrity tampering", () => {
    const entry = storeMemory(testDir, "tamper-test", { value: 123 });
    const entryPath = testPath(".agent", "memory", "entries", `${entry.id}.json`);

    // Tamper with the entry
    const tampered = JSON.parse(fs.readFileSync(entryPath, "utf-8"));
    tampered.value = { value: 999 }; // Change value
    fs.writeFileSync(entryPath, JSON.stringify(tampered, null, 2), "utf-8");

    const result = verifyMemoryIntegrity(testDir, entry.id);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("checksum mismatch");
  });

  it("creates audit receipts on store/update/evict", () => {
    const entry = storeMemory(testDir, "audit-test", { data: true });
    updateMemory(testDir, entry.id, { data: false });
    evictMemory(testDir, entry.id);

    const receipts = loadAuditLog(testDir);
    expect(receipts).toHaveLength(3);
    expect(receipts[0].operation).toBe("store");
    expect(receipts[1].operation).toBe("update");
    expect(receipts[2].operation).toBe("evict");
  });

  it("compacts audit log", () => {
    // Store same entry multiple times
    const entry = storeMemory(testDir, "compact-test", { v: 1 });
    for (let i = 2; i <= 5; i++) {
      updateMemory(testDir, entry.id, { v: i });
    }

    const receiptsBefore = loadAuditLog(testDir);
    expect(receiptsBefore.length).toBe(5); // 1 store + 4 updates

    const result = compactAuditLog(testDir);
    expect(result.compacted).toBeGreaterThan(0);

    const receiptsAfter = loadAuditLog(testDir);
    expect(receiptsAfter.length).toBeLessThan(receiptsBefore.length);
  });
});

// ── Improvement Lifecycle Tests (SS-21) ───────────────────────────────────

describe("Improvement Lifecycle (SS-21)", () => {
  it("creates and retrieves improvements", () => {
    const improvement = createImprovement(
      testDir,
      "test-improvement",
      "1.0.0",
      "Initial release",
      [{ path: "/fake/path", sha256: "abc123", size: 100 }],
      { owner: "test" }
    );

    expect(improvement.id).toBeDefined();
    expect(improvement.stage).toBe("development");
    expect(improvement.status).toBe("active");
    expect(improvement.version).toBe("1.0.0");

    const retrieved = getImprovement(testDir, improvement.id);
    expect(retrieved?.name).toBe("test-improvement");
  });

  it("promotes improvement through stages", () => {
    const improvement = createImprovement(
      testDir,
      "promote-test",
      "1.0.0",
      "Test promotion",
      [{ path: "/fake", sha256: "x", size: 1 }]
    );

    expect(improvement.stage).toBe("development");

    const promote1 = promoteImprovement(testDir, improvement.id);
    expect(promote1.success).toBe(true);
    expect(promote1.improvement?.stage).toBe("staging");
    expect(promote1.receipt).toBeDefined();
    expect(promote1.receipt?.fromStage).toBe("development");
    expect(promote1.receipt?.toStage).toBe("staging");

    const promote2 = promoteImprovement(testDir, improvement.id);
    expect(promote2.success).toBe(true);
    expect(promote2.improvement?.stage).toBe("production");

    const promote3 = promoteImprovement(testDir, improvement.id);
    expect(promote3.success).toBe(false);
    expect(promote3.error).toContain("cannot promote");
  });

  it("rolls back improvement to previous stage", () => {
    const improvement = createImprovement(
      testDir,
      "rollback-test",
      "1.0.0",
      "Test rollback",
      [{ path: "/fake", sha256: "x", size: 1 }]
    );

    promoteImprovement(testDir, improvement.id); // dev -> staging
    promoteImprovement(testDir, improvement.id); // staging -> production

    const rollback = rollbackImprovement(testDir, improvement.id, "testing rollback", "tester");
    expect(rollback.success).toBe(true);
    expect(rollback.improvement?.stage).toBe("staging");
    expect(rollback.improvement?.status).toBe("rolled_back");
    expect(rollback.receipt).toBeDefined();
    expect(rollback.receipt?.reason).toBe("testing rollback");
  });

  it("cannot rollback from development", () => {
    const improvement = createImprovement(
      testDir,
      "norollback-test",
      "1.0.0",
      "Test",
      [{ path: "/fake", sha256: "x", size: 1 }]
    );

    const result = rollbackImprovement(testDir, improvement.id, "should fail");
    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot rollback");
  });

  it("archives improvement", () => {
    const improvement = createImprovement(
      testDir,
      "archive-test",
      "1.0.0",
      "Test archive",
      [{ path: "/fake", sha256: "x", size: 1 }]
    );

    const result = archiveImprovement(testDir, improvement.id, "obsolete");
    expect(result.success).toBe(true);
    expect(result.improvement?.stage).toBe("archived");
    expect(result.improvement?.status).toBe("superseded");
  });

  it("supersedes previous production version on promotion", () => {
    const v1 = createImprovement(testDir, "v1", "1.0.0", "v1", [{ path: "/fake", sha256: "x", size: 1 }]);
    promoteImprovement(testDir, v1.id);
    promoteImprovement(testDir, v1.id); // dev -> staging
    promoteImprovement(testDir, v1.id); // staging -> production

    // v1 should now be production
    expect(getImprovement(testDir, v1.id)?.stage).toBe("production");

    // Create v2
    const v2 = createImprovement(testDir, "v2", "2.0.0", "v2", [{ path: "/fake", sha256: "y", size: 1 }]);
    promoteImprovement(testDir, v2.id);
    promoteImprovement(testDir, v2.id);
    promoteImprovement(testDir, v2.id);

    // v1 should now be superseded
    expect(getImprovement(testDir, v1.id)?.status).toBe("superseded");
    expect(getImprovement(testDir, v2.id)?.stage).toBe("production");
  });

  it("lists improvements by stage", () => {
    createImprovement(testDir, "dev1", "1.0.0", "d1", [{ path: "/fake", sha256: "x", size: 1 }]);
    const staging = createImprovement(testDir, "staging1", "1.0.0", "s1", [{ path: "/fake", sha256: "x", size: 1 }]);
    promoteImprovement(testDir, staging.id);

    const all = listImprovements(testDir);
    expect(all.improvements.length).toBe(2);
    expect(all.byStage.development.length).toBe(1);
    expect(all.byStage.staging.length).toBe(1);

    const stagingOnly = getImprovementsByStage(testDir, "staging");
    expect(stagingOnly).toHaveLength(1);
    expect(stagingOnly[0].name).toBe("staging1");
  });

  it("verifies improvement integrity", () => {
    const improvement = createImprovement(
      testDir,
      "verify-test",
      "1.0.0",
      "Test",
      [{ path: "/fake", sha256: "x", size: 1 }]
    );

    const valid = verifyImprovementIntegrity(testDir, improvement.id);
    expect(valid.valid).toBe(true);
  });

  it("creates audit trail for promotions and rollbacks", () => {
    const improvement = createImprovement(
      testDir,
      "audit-test",
      "1.0.0",
      "Test",
      [{ path: "/fake", sha256: "x", size: 1 }]
    );

    promoteImprovement(testDir, improvement.id);
    rollbackImprovement(testDir, improvement.id, "testing");

    const audit = loadImprovementAudit(testDir);
    expect(audit.length).toBe(2);
    expect(audit[0].schema).toContain("promotion");
    expect(audit[1].schema).toContain("rollback");
  });

  it("rollback preserves complete history for rolled-back improvement and restored version", () => {
    // Setup: v1 in production, v2 promoted to production (supersedes v1)
    const v1 = createImprovement(testDir, "history-imp", "1.0.0", "v1", [{ path: "/x", sha256: "a", size: 1 }]);
    promoteImprovement(testDir, v1.id);
    promoteImprovement(testDir, v1.id);

    const v2 = createImprovement(testDir, "history-imp", "2.0.0", "v2", [{ path: "/y", sha256: "b", size: 1 }]);
    promoteImprovement(testDir, v2.id);
    promoteImprovement(testDir, v2.id);

    const rollback = rollbackImprovement(testDir, v2.id, "regression detected");

    // v2 history should have rollback entry
    const v2History = loadImprovementHistory(testDir, v2.id);
    expect(v2History.some((h) => h.event === "rolled_back")).toBe(true);
    expect(v2History[v2History.length - 1].reason).toBe("regression detected");

    // v1 should have been restored with a promotion history entry
    if (rollback.restoredFromId) {
      const v1History = loadImprovementHistory(testDir, rollback.restoredFromId);
      expect(v1History.some((h) => h.event === "promoted")).toBe(true);
      expect(v1History.some((h) => h.toStatus === "active")).toBe(true);
    }
  });
});

// ── GC/Migration Tests (SS-24) ──────────────────────────────────────────────

describe("GC, Migration, and Cleanup (SS-24)", () => {
  it("scans for orphan runs", () => {
    // Create a fake orphan run (no run.json)
    const runsDir = path.join(testDir, ".agent", "runs", "orphan-run");
    fs.mkdirSync(runsDir, { recursive: true });

    const orphans = scanForOrphans(testDir);
    const orphanRuns = orphans.filter((o) => o.type === "run");
    expect(orphanRuns.length).toBeGreaterThan(0);
    expect(orphanRuns[0].id).toBe("orphan-run");
    expect(orphanRuns[0].reason).toBe("run.json not found");
  });

  it("cleans up orphan items", () => {
    const runsDir = path.join(testDir, ".agent", "runs", "to-clean");
    fs.mkdirSync(runsDir, { recursive: true });
    fs.writeFileSync(path.join(runsDir, "test.txt"), "test content");

    const orphans = scanForOrphans(testDir);
    const receipt = cleanupOrphans(testDir, orphans, { archive: false });

    expect(receipt.stats.totalItems).toBeGreaterThan(0);
    expect(receipt.stats.removed).toBeGreaterThan(0);
    expect(receipt.stats.bytesFreed).toBeGreaterThan(0);
  });

  it("supports dry-run mode", () => {
    const runsDir = path.join(testDir, ".agent", "runs", "dry-run-test");
    fs.mkdirSync(runsDir, { recursive: true });

    const orphans = scanForOrphans(testDir);
    const receipt = cleanupOrphans(testDir, orphans, { dryRun: true });

    expect(receipt.stats.skipped).toBe(orphans.length);
    expect(fs.existsSync(runsDir)).toBe(true); // Still exists
  });

  it("records and completes migrations", () => {
    const migration = recordMigration(
      testDir,
      "/old/path",
      "/new/path",
      "directory"
    );

    expect(migration.id).toBeDefined();
    expect(migration.completed).toBe(false);

    const completed = completeMigration(testDir, migration.id);
    expect(completed?.completed).toBe(true);

    const migrations = getMigrations(testDir);
    expect(migrations).toHaveLength(1);
    expect(migrations[0].id).toBe(migration.id);
  });

  it("records migration errors", () => {
    const migration = recordMigration(
      testDir,
      "/old",
      "/new",
      "file"
    );

    const result = completeMigration(testDir, migration.id, "failed to copy");
    expect(result?.completed).toBe(false);
    expect(result?.error).toBe("failed to copy");
  });

  it("returns null for non-existent migration", () => {
    const result = completeMigration(testDir, "non-existent-id");
    expect(result).toBeNull();
  });

  it("loads cleanup receipts", () => {
    const runsDir = path.join(testDir, ".agent", "runs", "receipt-test");
    fs.mkdirSync(runsDir, { recursive: true });

    const orphans = scanForOrphans(testDir);
    cleanupOrphans(testDir, orphans);

    const receipts = loadCleanupReceipts(testDir);
    expect(receipts.length).toBeGreaterThan(0);
    expect(receipts[0].schema).toBe("agent-rules/gc-cleanup-receipt");
  });

  it("evicts old memory entries", () => {
    // Create memory entries
    for (let i = 0; i < 10; i++) {
      storeMemory(testDir, `key-${i}`, { data: i });
    }

    // Evict to keep only 5
    const receipt = evictOldMemory(testDir, 5);

    expect(receipt.stats.removed).toBe(5);
    expect(receipt.operation).toBe("evict");
  });

  it("gets GC statistics", () => {
    // Run a cleanup first
    const runsDir = path.join(testDir, ".agent", "runs", "stats-test");
    fs.mkdirSync(runsDir, { recursive: true });

    const orphans = scanForOrphans(testDir);
    cleanupOrphans(testDir, orphans);

    const stats = getGCStats(testDir);
    expect(stats.totalCleanups).toBeGreaterThan(0);
    expect(stats.lastRun).toBeDefined();
    expect(stats.orphanCounts.run).toBeGreaterThan(0);
  });

  it("prunes old cleanup receipts, keeping last N", () => {
    // Create 10 orphan cleanups
    for (let i = 0; i < 10; i++) {
      const runsDir = path.join(testDir, ".agent", "runs", `prune-test-${i}`);
      fs.mkdirSync(runsDir, { recursive: true });
      const orphans = scanForOrphans(testDir);
      cleanupOrphans(testDir, orphans);
    }

    const before = loadCleanupReceipts(testDir);
    expect(before.length).toBe(10);

    const result = pruneReceipts(testDir, 3);
    expect(result.pruned).toBe(7);
    expect(result.remaining).toBe(3);

    const after = loadCleanupReceipts(testDir);
    expect(after.length).toBe(3);
  });

  it("pruneReceipts returns 0 when file does not exist", () => {
    const result = pruneReceipts(testDir, 5);
    expect(result.pruned).toBe(0);
    expect(result.remaining).toBe(0);
  });
});
