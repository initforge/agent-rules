/**
 * Cross-Process Integration Tests for Lifecycle Modules
 * 
 * Tests that lifecycle state persists correctly across separate Node.js processes
 * sharing the same .agent directory. Uses child_process to simulate independent agents.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Shared test workspace */
let testDir: string;

/** Absolute path to the dist directory (where built lifecycle modules live) */
const distPath = path.resolve(__dirname, "..", "..", "dist");

/** File URL for ESM imports from absolute paths */
function distUrl(module: string): string {
  return `file:///${distPath.replace(/\\/g, "/")}/${module}`;
}

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "xproc-lifecycle-"));
  process.env.TEST_DIR = testDir;
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Run a snippet of JS in a fresh Node process, return stdout */
function runChild(code: string, cwd?: string): Promise<string> {
  return new Promise((resolve) => {
    // The child reads `testDir` from the inherited environment so the same
    // snippet string can be shared across tests without template-literal
    // evaluation at module load (when `testDir` is still undefined).
    const env = { ...process.env, TEST_DIR: cwd ?? testDir };
    const child = spawn(process.execPath, ["--input-type=module", "--eval", code], {
      cwd: cwd ?? testDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("close", () => {
      if (stderr && !stdout) resolve(stderr.trim());
      else resolve(stdout.trim());
    });
  });
}

// ── Memory Cross-Process Tests ────────────────────────────────────────────────

describe("Memory lifecycle — cross-process", () => {
  it("child process creates memory entry, parent reads it", async () => {
    await runChild(`
import { storeMemory } from "${distUrl("lifecycle/memory.js")}";
const entry = storeMemory("${process.env.TEST_DIR}", "cross-key", { hello: "world" });
console.log(JSON.stringify({ id: entry.id, key: entry.key }));
    `);

    // Parent reads via the same module (different process instance)
    const { getMemory } = await import("../../src/lifecycle/memory.js");
    const entries = JSON.parse(
      await runChild(`
import { listMemory } from "${distUrl("lifecycle/memory.js")}";
console.log(JSON.stringify(listMemory("${process.env.TEST_DIR}")));
      `)
    ) as Array<{ id: string; key: string }>;

    const found = entries.find((e) => e.key === "cross-key");
    expect(found).toBeDefined();
    expect(found?.key).toBe("cross-key");
  });

  it("concurrent stores from two child processes both persist", async () => {
    const du = distUrl("lifecycle/memory.js");
    const code = (name: string) => `
import { storeMemory, listMemory } from "${du}";
const d = "${process.env.TEST_DIR}";
storeMemory(d, "key-${name}", { from: "${name}" });
const all = listMemory(d).map(e => e.key);
console.log(JSON.stringify(all));
    `;

    const [out1, out2] = await Promise.all([
      runChild(code("alice")),
      runChild(code("bob")),
    ]);

    const list1 = JSON.parse(out1) as string[];
    const list2 = JSON.parse(out2) as string[];

    expect(list1).toContain("key-alice");
    expect(list2).toContain("key-bob");

    // Both visible in parent via fresh list
    const { listMemory } = await import("../../src/lifecycle/memory.js");
    const all = listMemory(testDir);
    const keys = all.map((e) => e.key);
    expect(keys).toContain("key-alice");
    expect(keys).toContain("key-bob");
  });

  it("evict in child process removes entry visible to parent", async () => {
    // Parent stores an entry
    const { storeMemory } = await import("../../src/lifecycle/memory.js");
    const entry = storeMemory(testDir, "to-evict", { data: 1 });
    expect(storeMemory(testDir, "to-evict", { data: 1 })).toBeDefined();

    // Child evicts it
    await runChild(`
import { evictMemory } from "${distUrl("lifecycle/memory.js")}";
const result = evictMemory("${process.env.TEST_DIR}", "${entry.id}");
console.log(result);
    `);

    const { getMemory } = await import("../../src/lifecycle/memory.js");
    expect(getMemory(testDir, entry.id)).toBeNull();
  });

  it("memory audit receipts persist across processes", async () => {
    // Child stores
    await runChild(`
import { storeMemory } from "${distUrl("lifecycle/memory.js")}";
storeMemory("${process.env.TEST_DIR}", "audit-test", { v: 1 });
    `);

    const { loadAuditLog } = await import("../../src/lifecycle/memory.js");
    const receipts = loadAuditLog(testDir);
    expect(receipts.some((r) => r.operation === "store")).toBe(true);
  });
});

// ── Improvement Cross-Process Tests ─────────────────────────────────────────

describe("Improvement lifecycle — cross-process", () => {
  it("child creates and promotes improvement, parent reads final stage", async () => {
    const result = await runChild(`
import { createImprovement, promoteImprovement, getImprovement } from "${distUrl("lifecycle/improvement.js")}";
const d = "${process.env.TEST_DIR}";
const imp = createImprovement(d, "cross-imp", "1.0.0", "test", [{ path: "/x", sha256: "a", size: 1 }]);
promoteImprovement(d, imp.id);
promoteImprovement(d, imp.id);
const final = getImprovement(d, imp.id);
console.log(JSON.stringify({ stage: final?.stage, status: final?.status }));
    `);

    const { getImprovement } = await import("../../src/lifecycle/improvement.js");
    const stage = JSON.parse(result) as { stage: string; status: string };
    expect(stage.stage).toBe("production");
    expect(stage.status).toBe("active");
  });

  it("real rollback: child rolls back from production, parent sees superseded restored", async () => {
    // Set up: v1 in production, v2 promoted to production (supersedes v1)
    await runChild(`
import { createImprovement, promoteImprovement } from "${distUrl("lifecycle/improvement.js")}";
const d = "${process.env.TEST_DIR}";
const v1 = createImprovement(d, "rollback-imp", "1.0.0", "v1", [{ path: "/x", sha256: "a", size: 1 }]);
promoteImprovement(d, v1.id);
promoteImprovement(d, v1.id); // v1 now production
const v2 = createImprovement(d, "rollback-imp", "2.0.0", "v2", [{ path: "/y", sha256: "b", size: 1 }]);
promoteImprovement(d, v2.id);
promoteImprovement(d, v2.id); // v2 now production, v1 superseded
const rb = promoteImprovement(d, v2.id); // v2: production → archived (no-op, was testing rollback)
console.log("done");
    `);

    // Now parent rolls back v2 (currently at archived, can't rollback)
    // First: check current state
    const { getImprovement, listImprovements } = await import("../../src/lifecycle/improvement.js");
    const all = listImprovements(testDir).improvements;
    const v2entry = all.find((i) => i.version === "2.0.0");
    const v1entry = all.find((i) => i.version === "1.0.0");

    // v2 is at production (after 2 promotions), v1 is superseded
    expect(v1entry?.status).toBe("superseded");
    expect(v1entry?.stage).toBe("production");
    expect(v2entry?.status).toBe("active");
    expect(v2entry?.stage).toBe("production");

    // Roll back v2: should restore v1 to active
    const { rollbackImprovement } = await import("../../src/lifecycle/improvement.js");
    const rb = rollbackImprovement(testDir, v2entry!.id, "testing rollback");
    expect(rb.success).toBe(true);
    expect(rb.improvement?.stage).toBe("staging");
    expect(rb.improvement?.status).toBe("rolled_back");
    expect(rb.restoredFromId).toBe(v1entry?.id);

    // v1 should now be active again
    const restored = getImprovement(testDir, v1entry!.id);
    expect(restored?.status).toBe("active");
    expect(restored?.stage).toBe("production");
  });

  it("improvement history file is created and readable across processes", async () => {
    const childId = await runChild(`
import { createImprovement, loadImprovementHistory } from "${distUrl("lifecycle/improvement.js")}";
const d = "${process.env.TEST_DIR}";
const imp = createImprovement(d, "history-test", "1.0.0", "test", [{ path: "/x", sha256: "a", size: 1 }]);
const hist = loadImprovementHistory(d, imp.id);
console.log(hist.length);
    `);

    expect(parseInt(childId)).toBe(1); // 1 history entry: "created"

    const { loadImprovementHistory, createImprovement } = await import("../../src/lifecycle/improvement.js");
    const { listImprovements } = await import("../../src/lifecycle/improvement.js");
    const all = listImprovements(testDir).improvements;
    const histEntry = all.find((i) => i.name === "history-test");
    expect(histEntry).toBeDefined();

    const hist = loadImprovementHistory(testDir, histEntry!.id);
    expect(hist.length).toBeGreaterThan(0);
    expect(hist[0].event).toBe("created");
  });

  it("audit trail visible across processes", async () => {
    await runChild(`
import { createImprovement, promoteImprovement } from "${distUrl("lifecycle/improvement.js")}";
const d = "${process.env.TEST_DIR}";
const imp = createImprovement(d, "audit-xproc", "1.0.0", "test", [{ path: "/x", sha256: "a", size: 1 }]);
promoteImprovement(d, imp.id);
    `);

    const { loadImprovementAudit } = await import("../../src/lifecycle/improvement.js");
    const audit = loadImprovementAudit(testDir);
    expect(audit.length).toBe(1); // 1 promotion (createImprovement does not add to global audit)
    expect(audit.some((e) => e.schema?.includes("promotion"))).toBe(true);
  });
});

// ── GC Cross-Process Tests ───────────────────────────────────────────────────

describe("GC lifecycle — cross-process", () => {
  it("scanForOrphans detects orphans created by child process", async () => {
    // Child creates an orphan run directory (no run.json)
    await runChild(`
import path from "node:path";
import fs from "node:fs";
const runsDir = path.join(process.env.TEST_DIR, '.agent', 'runs', 'orphan-child');
fs.mkdirSync(runsDir, { recursive: true });
fs.writeFileSync(path.join(runsDir, "test.txt"), "orphan content");
    `);

    const { scanForOrphans } = await import("../../src/lifecycle/gc.js");
    const orphans = scanForOrphans(testDir);
    expect(orphans.some((o) => o.id.includes("orphan-child"))).toBe(true);
  });

  it("cleanup receipts persist and are loadable from different process", async () => {
    // Child creates orphan and cleans it up
    await runChild(`
import path from "node:path";
import fs from "node:fs";
import { scanForOrphans, cleanupOrphans } from "${distUrl("lifecycle/gc.js")}";
const d = "${process.env.TEST_DIR}";
const runsDir = path.join(d, '.agent', 'runs', 'receipt-xproc');
fs.mkdirSync(runsDir, { recursive: true });
fs.writeFileSync(path.join(runsDir, "test.txt"), "data");
const orphans = scanForOrphans(d);
const receipt = cleanupOrphans(d, orphans);
console.log(receipt.stats.removed);
    `);

    const { loadCleanupReceipts } = await import("../../src/lifecycle/gc.js");
    const receipts = loadCleanupReceipts(testDir);
    expect(receipts.length).toBeGreaterThan(0);
    expect(receipts[0].schema).toBe("agent-rules/gc-cleanup-receipt");
  });

  it("evictOldMemory in child reduces entry count visible to parent", async () => {
    const { storeMemory } = await import("../../src/lifecycle/memory.js");
    for (let i = 0; i < 8; i++) {
      storeMemory(testDir, `gc-key-${i}`, { n: i });
    }

    await runChild(`
import { evictOldMemory } from "${distUrl("lifecycle/gc.js")}";
const receipt = evictOldMemory("${process.env.TEST_DIR}", 3);
console.log(JSON.stringify({ removed: receipt.stats.removed }));
    `);

    const { listMemory } = await import("../../src/lifecycle/memory.js");
    const remaining = listMemory(testDir);
    // evicted the oldest 5 (8 - 3 = 5 evicted)
    expect(remaining.length).toBeLessThanOrEqual(3);
  });

  it("archive mode creates archive metadata readable by parent", async () => {
    await runChild(`
import path from "node:path";
import fs from "node:fs";
import { scanForOrphans, cleanupOrphans } from "${distUrl("lifecycle/gc.js")}";
const d = "${process.env.TEST_DIR}";
const runsDir = path.join(d, '.agent', 'runs', 'archive-xproc');
fs.mkdirSync(runsDir, { recursive: true });
fs.writeFileSync(path.join(runsDir, "important.txt"), "keep this");
const orphans = scanForOrphans(d);
cleanupOrphans(d, orphans, { archive: true });
    `);

    // Parent verifies archive metadata was created
    const archiveMeta = path.join(testDir, ".agent", "gc", "archive");
    const exists = fs.existsSync(archiveMeta);
    expect(exists).toBe(true);

    // Should have at least one archived item with a meta.json
    if (exists) {
      const entries = fs.readdirSync(archiveMeta);
      const hasMeta = entries.some((e) => e.endsWith(".meta.json"));
      expect(hasMeta).toBe(true);
    }
  });

  it("migration records persist across processes", async () => {
    await runChild(`
import { recordMigration } from "${distUrl("lifecycle/gc.js")}";
const d = "${process.env.TEST_DIR}";
const mig = recordMigration(d, "/old/path", "/new/path", "file");
console.log(mig.id);
    `);

    const { getMigrations } = await import("../../src/lifecycle/gc.js");
    const migrations = getMigrations(testDir);
    expect(migrations.length).toBe(1);
    expect(migrations[0].completed).toBe(false);
  });

  it("GC stats accumulate across multiple cleanups from different processes", async () => {
    const du = distUrl("lifecycle/gc.js");
    // Process A: create orphan and cleanup
    await runChild(`
import path from "node:path";
import fs from "node:fs";
import { scanForOrphans, cleanupOrphans } from "${du}";
const d = "${process.env.TEST_DIR}";
fs.mkdirSync(path.join(d, '.agent', 'runs', 'cleanup-a'), { recursive: true });
fs.writeFileSync(path.join(d, '.agent', 'runs', 'cleanup-a', 'a.txt'), "a");
cleanupOrphans(d, scanForOrphans(d));
    `);

    // Process B: create orphan and cleanup
    await runChild(`
import path from "node:path";
import fs from "node:fs";
import { scanForOrphans, cleanupOrphans } from "${du}";
const d = "${process.env.TEST_DIR}";
fs.mkdirSync(path.join(d, '.agent', 'runs', 'cleanup-b'), { recursive: true });
fs.writeFileSync(path.join(d, '.agent', 'runs', 'cleanup-b', 'b.txt'), "b");
cleanupOrphans(d, scanForOrphans(d));
    `);

    const { getGCStats } = await import("../../src/lifecycle/gc.js");
    const stats = getGCStats(testDir);
    expect(stats.totalCleanups).toBeGreaterThanOrEqual(2);
    expect(stats.totalItemsRemoved).toBeGreaterThanOrEqual(2);
  });
});
