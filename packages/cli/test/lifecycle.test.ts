import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runLifecycleCleanup, type LifecycleReport } from "../src/cleanup/lifecycle.js";

const tempRoots: string[] = [];

const sha256Of = (content: string | Buffer): string =>
  crypto.createHash("sha256").update(content).digest("hex");

/** Minimal repo with the durable .agent protocol layout. */
function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "s7-lifecycle-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, ".agent", "runs", "W-test-1"), { recursive: true });
  fs.mkdirSync(path.join(root, ".agent", "plans", "p-1"), { recursive: true });
  fs.mkdirSync(path.join(root, ".agent", "evidence"), { recursive: true });
  fs.mkdirSync(path.join(root, ".agent", "tmp"), { recursive: true });
  fs.mkdirSync(path.join(root, ".agent", "tombstones"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agent", "runs", "W-test-1", "run.json"), '{"runId":"W-test-1","state":"COMPLETED"}\n');
  fs.writeFileSync(path.join(root, ".agent", "plans", "p-1", "original.md"), "# original intent\n");
  fs.writeFileSync(path.join(root, ".agent", "evidence", "pass.json"), '{"status":"PASS"}\n');
  fs.writeFileSync(path.join(root, ".agent", "tmp", "scratch.log"), "scratch\n");
  fs.writeFileSync(
    path.join(root, ".agent", "current.json"),
    JSON.stringify({
      schema: "artifact/execution-contract",
      version: 1,
      kind: "current-pointer",
      generation: 1,
      work_id: "p-1",
      plan_id: "p-1",
      plan_root: ".agent/plans/p-1",
      original: { path: ".agent/plans/p-1/original.md" },
      canonical_ledger: { path: ".agent/ledger/p-1.json" },
    })
  );
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const runPath = (root: string): string => path.join(root, ".agent", "runs", "W-test-1", "run.json");

describe("S7 lifecycle compaction dry-run", () => {
  it("plans content-addressed compaction without mutating anything", () => {
    const root = makeRoot();
    const before = fs.readFileSync(runPath(root), "utf8");
    const report = runLifecycleCleanup(root, { dryRun: true }) as LifecycleReport;

    expect(report.schema).toBe("artifact/cleanup-lifecycle-report");
    expect(report.dryRun).toBe(true);
    expect(fs.existsSync(runPath(root))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "tmp", "scratch.log"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "archive"))).toBe(false);

    const entry = report.compaction.entries.find((e) => e.path === ".agent/runs/W-test-1/run.json");
    expect(entry).toBeDefined();
    expect(entry!.sha256).toBe(sha256Of(before));
    expect(entry!.archiveObject).toMatch(/^\.agent\/archive\/objects\/[a-f0-9]{64}$/);
    expect(entry!.objectExists).toBe(false);
    expect(entry!.blocked).toBe(false);
    expect(report.compaction.recoverableFromHashes).toBe(true);
    expect(report.compaction.applyRequested).toBe(false);
    expect(report.compaction.tombstonePath).toBeNull();
  });

  it("never plans compaction for intent, decisions, evidence, or the pointer", () => {
    const root = makeRoot();
    const report = runLifecycleCleanup(root, { dryRun: true }) as LifecycleReport;
    const compacted = report.compaction.entries.map((e) => e.path);
    expect(compacted).toEqual([".agent/runs/W-test-1/run.json"]);
    expect(compacted.some((p) => p.startsWith(".agent/plans/"))).toBe(false);
    expect(compacted.some((p) => p.startsWith(".agent/evidence/"))).toBe(false);
    expect(compacted.some((p) => p.includes("current.json"))).toBe(false);
  });

  it("keeps tmp scratch purge-eligible and untouched in dry-run", () => {
    const root = makeRoot();
    const report = runLifecycleCleanup(root, { dryRun: true }) as LifecycleReport;
    expect(report.eligible).toContain(".agent/tmp/scratch.log");
    expect(fs.existsSync(path.join(root, ".agent", "tmp", "scratch.log"))).toBe(true);
  });
});

describe("S7 lifecycle compaction apply", () => {
  it("apply without --compact purges scratch but never archives runs", () => {
    const root = makeRoot();
    const report = runLifecycleCleanup(root, { dryRun: false, compact: false }) as LifecycleReport;
    expect(fs.existsSync(path.join(root, ".agent", "tmp", "scratch.log"))).toBe(false);
    expect(fs.existsSync(runPath(root))).toBe(true);
    expect(report.compaction.applied).toEqual([]);
    expect(report.compaction.dryRun).toBe(true);
    const tombstones = fs.readdirSync(path.join(root, ".agent", "tombstones"));
    expect(tombstones.some((f) => f.startsWith("compact-"))).toBe(false);
  });

  it("apply --compact archives content-addressably with tombstone-before-archive and round-trip verification", () => {
    const root = makeRoot();
    const original = fs.readFileSync(runPath(root), "utf8");
    const report = runLifecycleCleanup(root, { dryRun: false, compact: true }) as LifecycleReport;

    // Original removed only after a verified archive object exists.
    expect(fs.existsSync(runPath(root))).toBe(false);
    const entry = report.compaction.entries.find((e) => e.path === ".agent/runs/W-test-1/run.json");
    expect(entry).toBeDefined();
    expect(entry!.archived).toBe(true);
    expect(entry!.objectHashMatch).toBe(true);
    expect(entry!.restoredMatch).toBe(true);
    expect(entry!.tombstoned).toBe(true);
    expect(report.compaction.applied).toEqual([".agent/runs/W-test-1/run.json"]);

    // Content-addressed object exists and round-trips to the original bytes.
    const objectPath = path.join(root, entry!.archiveObject);
    expect(fs.existsSync(objectPath)).toBe(true);
    expect(sha256Of(fs.readFileSync(objectPath))).toBe(entry!.sha256);
    expect(fs.readFileSync(objectPath, "utf8")).toBe(original);

    // Tombstone written with the content hash and marked archived.
    expect(report.compaction.tombstonePath).not.toBeNull();
    const tombstone = JSON.parse(fs.readFileSync(path.join(root, report.compaction.tombstonePath!), "utf8"));
    expect(tombstone.schema).toBe("artifact/cleanup-compaction-tombstone");
    expect(tombstone.entries).toHaveLength(1);
    expect(tombstone.entries[0].sha256).toBe(entry!.sha256);
    expect(tombstone.entries[0].status).toBe("archived");

    // Manifest binds path -> hash.
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".agent", "archive", "manifest.json"), "utf8"));
    expect(manifest.schema).toBe("harness/content-addressed-archive/v1");
    expect(manifest.entries[".agent/runs/W-test-1/run.json"].sha256).toBe(entry!.sha256);
  });

  it("is idempotent: a second apply re-verifies and deletes nothing twice", () => {
    const root = makeRoot();
    const first = runLifecycleCleanup(root, { dryRun: false, compact: true }) as LifecycleReport;
    const objectPath = path.join(root, first.compaction.entries[0].archiveObject);
    expect(fs.existsSync(runPath(root))).toBe(false);
    // Re-add the original (as if a new identical run record appeared) and re-apply.
    fs.writeFileSync(runPath(root), '{"runId":"W-test-1","state":"COMPLETED"}\n');
    const second = runLifecycleCleanup(root, { dryRun: false, compact: true }) as LifecycleReport;
    expect(second.compaction.entries[0].archived).toBe(true);
    expect(second.compaction.entries[0].objectExists).toBe(true);
    expect(second.compaction.entries[0].objectHashMatch).toBe(true);
    expect(fs.existsSync(runPath(root))).toBe(false);
    expect(fs.existsSync(objectPath)).toBe(true);
  });
});

describe("S7 compaction recovery from content hashes", () => {
  it("dry-run reports an archive object already present without a tombstone as recoverable from hashes", () => {
    const root = makeRoot();
    const original = fs.readFileSync(runPath(root), "utf8");
    const sha = sha256Of(original);
    const objectPath = path.join(root, ".agent", "archive", "objects", sha);
    fs.mkdirSync(path.dirname(objectPath), { recursive: true });
    fs.writeFileSync(objectPath, original);

    const report = runLifecycleCleanup(root, { dryRun: true }) as LifecycleReport;
    const entry = report.compaction.entries.find((e) => e.path === ".agent/runs/W-test-1/run.json");
    expect(entry!.objectExists).toBe(true);
    expect(entry!.objectHashMatch).toBe(true);
    expect(entry!.restoredMatch).toBe(true);
    expect(report.compaction.recoverableFromHashes).toBe(true);
    // Dry-run: nothing is deleted even though the archive copy exists.
    expect(fs.existsSync(runPath(root))).toBe(true);
  });

  it("recovers an interrupted compaction: pending tombstone + missing object re-archived from the original", () => {
    const root = makeRoot();
    const original = fs.readFileSync(runPath(root), "utf8");
    const sha = sha256Of(original);
    const tombstonePath = path.join(root, ".agent", "tombstones", "compact-2026-08-12T00-00-00-000Z.json");
    fs.writeFileSync(
      tombstonePath,
      JSON.stringify({
        schema: "artifact/cleanup-compaction-tombstone",
        version: 1,
        createdAt: "2026-08-12T00:00:00.000Z",
        entries: [
          {
            path: ".agent/runs/W-test-1/run.json",
            sha256: sha,
            sizeBytes: original.length,
            archiveObject: `.agent/archive/objects/${sha}`,
            status: "pending",
          },
        ],
      })
    );

    const report = runLifecycleCleanup(root, { dryRun: false, compact: true }) as LifecycleReport;
    expect(report.compaction.pendingTombstones).toBe(1);
    expect(report.compaction.recovered).toBe(1);
    // Object was re-archived from the original and round-trip verified.
    const objectPath = path.join(root, ".agent", "archive", "objects", sha);
    expect(fs.existsSync(objectPath)).toBe(true);
    expect(sha256Of(fs.readFileSync(objectPath))).toBe(sha);
    // Tombstone updated to archived; original retained until verified removal.
    const tombstone = JSON.parse(fs.readFileSync(tombstonePath, "utf8"));
    expect(tombstone.entries[0].status).toBe("archived");
  });

  it("fails closed when the archive object hash does not match and the original is gone", () => {
    const root = makeRoot();
    const original = fs.readFileSync(runPath(root), "utf8");
    const sha = sha256Of(original);
    const objectPath = path.join(root, ".agent", "archive", "objects", sha);
    fs.mkdirSync(path.dirname(objectPath), { recursive: true });
    fs.writeFileSync(objectPath, "CORRUPTED-BYTES\n");
    // Interrupted compaction that also lost the original: only the corrupt
    // object remains.
    fs.rmSync(runPath(root), { force: true });
    fs.writeFileSync(
      path.join(root, ".agent", "tombstones", "compact-2026-08-12T00-00-00-000Z.json"),
      JSON.stringify({
        schema: "artifact/cleanup-compaction-tombstone",
        version: 1,
        entries: [
          {
            path: ".agent/runs/W-test-1/run.json",
            sha256: sha,
            sizeBytes: original.length,
            archiveObject: `.agent/archive/objects/${sha}`,
            status: "pending",
          },
        ],
      })
    );

    const report = runLifecycleCleanup(root, { dryRun: false, compact: true }) as LifecycleReport;
    // Fail closed: the corrupt object is never trusted and nothing is deleted.
    expect(sha256Of(fs.readFileSync(objectPath))).not.toBe(sha);
    expect(report.compaction.blocked.length).toBeGreaterThan(0);
    expect(report.compaction.recoverableFromHashes).toBe(false);
    expect(report.compaction.applied).toEqual([]);
  });
});
