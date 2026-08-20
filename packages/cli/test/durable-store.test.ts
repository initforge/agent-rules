import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import {
  DurableStore,
  RUN_LOCKED_ERROR,
  RUN_ACTIVE_ERROR,
} from "../src/services/durable-store.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "durable-store-test-"));
const store = new DurableStore(tmpDir);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("DurableStore", () => {
  const runId = "test-run-001";
  const plan = { steps: ["step1", "step2"] };

  it("createRun creates a run with CREATED state", async () => {
    const run = await store.createRun(runId, plan);
    expect(run.runId).toBe(runId);
    expect(run.state).toBe("CREATED");
    expect(run.plan).toEqual(plan);
    expect(run.tasks).toEqual([]);
    expect(run.receipts).toEqual([]);
    expect(run.checkpoints).toEqual([]);
    expect(run.attempt).toBe(1);
    expect(run.createdAt).toBeTruthy();
    expect(run.updatedAt).toBeTruthy();
  });

  it("updateState transitions correctly", async () => {
    await store.updateState(runId, "DISCOVERING");
    const run = await store.getRun(runId);
    expect(run!.state).toBe("DISCOVERING");

    await store.updateState(runId, "PLANNED");
    const run2 = await store.getRun(runId);
    expect(run2!.state).toBe("PLANNED");
  });

  it("addReceipt persists receipts", async () => {
    const receipt1 = { id: "r1", result: "ok" };
    const receipt2 = { id: "r2", result: "done" };
    await store.addReceipt(runId, receipt1);
    await store.addReceipt(runId, receipt2);
    const run = await store.getRun(runId);
    expect(run!.receipts).toHaveLength(2);
    expect(run!.receipts[0]).toEqual(receipt1);
    expect(run!.receipts[1]).toEqual(receipt2);
  });

  it("checkpoint saves run state", async () => {
    const cp = await store.checkpoint(runId);
    expect(cp.id).toBeTruthy();
    expect(cp.state).toBe("PLANNED");
    expect(cp.completedTaskIds).toEqual([]);
    expect(cp.createdAt).toBeTruthy();
  });

  it("resume returns completed tasks", async () => {
    const run2Id = "test-run-002";
    const plan2 = { steps: ["a", "b", "c"] };
    await store.createRun(run2Id, plan2);

    // Use updateState to get EXECUTING state first (checkpoint captures state at this point)
    await store.updateState(run2Id, "EXECUTING");
    // Inject tasks via compact JSON (matching store format) before checkpoint
    const fp = path.join(tmpDir, ".agent", "runs", run2Id, "run.json");
    const run = JSON.parse(fs.readFileSync(fp, "utf-8")) as Record<string, unknown>;
    run.tasks = [
      { id: "t1", taskId: "t1", state: "COMPLETED", status: "completed" },
      { id: "t2", taskId: "t2", state: "PENDING", status: "pending" },
    ];
    fs.writeFileSync(fp, JSON.stringify(run)); // compact: matches store + checkpoint hash
    await store.checkpoint(run2Id);

    const resumed = await store.resume(run2Id);
    expect(resumed).not.toBeNull();
    const completedIds = await store.getCompletedTaskIds(run2Id);
    expect(completedIds).toContain("t1");
    expect(completedIds).not.toContain("t2");

    await store.deleteRun(run2Id);
  });

  it("resume does NOT re-run completed tasks", async () => {
    const run3Id = "test-run-003";
    await store.createRun(run3Id, { tasks: ["x", "y"] });
    await store.updateState(run3Id, "PLANNED");
    // Inject tasks with state field before checkpoint (compact JSON)
    const fp = path.join(tmpDir, ".agent", "runs", run3Id, "run.json");
    const run = JSON.parse(fs.readFileSync(fp, "utf-8")) as Record<string, unknown>;
    run.tasks = [
      { id: "task-a", taskId: "task-a", state: "COMPLETED", status: "completed" },
      { id: "task-b", taskId: "task-b", state: "PENDING", status: "pending" },
    ];
    fs.writeFileSync(fp, JSON.stringify(run)); // compact: matches store format
    const cp = await store.checkpoint(run3Id);
    expect(cp.completedTaskIds).toEqual(["task-a"]);

    const completedBefore = await store.getCompletedTaskIds(run3Id);
    expect(completedBefore).toEqual(["task-a"]);

    const resumed = await store.resume(run3Id);
    // resume restores from checkpoint which has PLANNED state (captured before task injection)
    expect(resumed!.state).toBe("PLANNED");

    const runAfterResume = await store.getRun(run3Id);
    const completedTasks = (runAfterResume!.tasks as { id: string; state: string }[])
      .filter(t => t.state === "COMPLETED");
    expect(completedTasks).toHaveLength(1);
    expect(completedTasks[0].id).toBe("task-a");

    await store.deleteRun(run3Id);
  });

  it("listRuns returns all runs", async () => {
    const idA = "list-test-a";
    const idB = "list-test-b";
    await store.createRun(idA, {});
    await store.createRun(idB, {});
    const runs = await store.listRuns();
    expect(runs).toContain(idA);
    expect(runs).toContain(idB);
    await store.deleteRun(idA);
    await store.deleteRun(idB);
  });

  it("deleteRun removes run data", async () => {
    const tmpId = "delete-test";
    await store.createRun(tmpId, {});
    expect(await store.getRun(tmpId)).not.toBeNull();
    await store.deleteRun(tmpId);
    expect(await store.getRun(tmpId)).toBeNull();
    expect(await store.getCompletedTaskIds(tmpId)).toEqual([]);
  });

  it("Simulated interruption: checkpoint, create new store instance, resume, verify completed tasks not re-run", async () => {
    const interruptionId = "interruption-test";
    const store1 = new DurableStore(tmpDir);
    await store1.createRun(interruptionId, { workload: "heavy" });

    await store1.updateState(interruptionId, "EXECUTING");
    // Inject tasks after state transition (compact JSON to match store format)
    const fp = path.join(tmpDir, ".agent", "runs", interruptionId, "run.json");
    const run = JSON.parse(fs.readFileSync(fp, "utf-8")) as Record<string, unknown>;
    run.tasks = [
      { id: "i1", taskId: "i1", state: "COMPLETED", status: "completed" },
      { id: "i2", taskId: "i2", state: "COMPLETED", status: "completed" },
      { id: "i3", taskId: "i3", state: "PENDING", status: "pending" },
    ];
    fs.writeFileSync(fp, JSON.stringify(run)); // compact: matches store format
    await store1.checkpoint(interruptionId);

    const store2 = new DurableStore(tmpDir);
    const resumed = await store2.resume(interruptionId);
    expect(resumed).not.toBeNull();
    expect(resumed!.state).toBe("EXECUTING");

    const completedIds = await store2.getCompletedTaskIds(interruptionId);
    expect(completedIds).toEqual(["i1", "i2"]);

    const pendingTasks = (resumed!.tasks as { id: string; state: string }[])
      .filter(t => t.state !== "COMPLETED");
    expect(pendingTasks).toHaveLength(1);
    expect(pendingTasks[0].id).toBe("i3");

    await store2.deleteRun(interruptionId);
  });

  it("GAP-3: checkpoint filenames embed a sha256 hash of the canonical JSON", async () => {
    const cpRunId = "hash-cp-test";
    await store.createRun(cpRunId, {});
    await store.checkpoint(cpRunId);
    const cpDir = path.join(tmpDir, ".agent", "runs", cpRunId, "checkpoints");
    const files = fs.readdirSync(cpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^checkpoint-.+-[0-9a-f]{16}\.json$/);
    await store.deleteRun(cpRunId);
  });

  it("GAP-3: tampered checkpoint is detected, NOT absorbed, run set to FAILED", async () => {
    const tamperId = "tamper-test";
    await store.createRun(tamperId, {});
    await store.updateState(tamperId, "EXECUTING");
    await store.addReceipt(tamperId, { taskId: "T-1", status: "PASS", evidencePaths: ["e"] });
    await store.checkpoint(tamperId);

    // Tamper: wipe receipts, rewrite under the same filename (hash now stale).
    const cpDir = path.join(tmpDir, ".agent", "runs", tamperId, "checkpoints");
    const file = fs.readdirSync(cpDir)[0];
    const cp = JSON.parse(fs.readFileSync(path.join(cpDir, file), "utf-8"));
    cp.data.receipts = [];
    fs.writeFileSync(path.join(cpDir, file), JSON.stringify(cp, null, 2));

    const resumed = await store.resume(tamperId);
    expect(resumed!.state).toBe("FAILED");
    expect(resumed!.error).toMatch(/tamper/);

    // Receipts must NOT be absorbed from the tampered checkpoint.
    const run = await store.getRun(tamperId);
    expect(run!.receipts).toHaveLength(1);
    expect(run!.receipts[0]).toMatchObject({ taskId: "T-1" });

    await store.deleteRun(tamperId);
  });

  it("F3: getCompletedTaskIds throws on tampered checkpoint instead of returning []", async () => {
    const tamperGetId = "tamper-get-test";
    await store.createRun(tamperGetId, {});
    await store.checkpoint(tamperGetId);

    const cpDir = path.join(tmpDir, ".agent", "runs", tamperGetId, "checkpoints");
    const file = fs.readdirSync(cpDir)[0];
    const cp = JSON.parse(fs.readFileSync(path.join(cpDir, file), "utf-8"));
    cp.completedTaskIds = ["t1"];
    fs.writeFileSync(path.join(cpDir, file), JSON.stringify(cp, null, 2));

    await expect(store.getCompletedTaskIds(tamperGetId)).rejects.toThrow(/tamper/);

    await store.deleteRun(tamperGetId);
  });

  it("GAP-4: resume refuses a run locked by a live foreign process (BLOCKED)", async () => {
    const lockId = "lock-live-test";
    await store.createRun(lockId, {});
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
    try {
      // Wait for the child to be alive.
      await new Promise((resolve) => setTimeout(resolve, 200));
      fs.writeFileSync(
        path.join(tmpDir, ".agent", "runs", lockId, "run.json.lock"),
        `${child.pid}\n${Date.now()}`,
      );
      const resumed = await store.resume(lockId);
      expect(resumed!.state).toBe("BLOCKED");
      expect(resumed!.error).toBe(RUN_LOCKED_ERROR);
    } finally {
      child.kill("SIGKILL");
    }
    await store.deleteRun(lockId);
  });

  it("GAP-4: stale lock (dead PID) is cleaned and resume proceeds", async () => {
    const staleLockId = "lock-stale-test";
    await store.createRun(staleLockId, {});
    await store.updateState(staleLockId, "EXECUTING");
    // checkpoint AFTER state transition so it captures EXECUTING state
    await store.checkpoint(staleLockId);

    // Dead PID: spawn a child that exits immediately and use its PID.
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
    await new Promise((resolve) => child.on("exit", resolve));
    fs.writeFileSync(
      path.join(tmpDir, ".agent", "runs", staleLockId, "run.json.lock"),
      `${child.pid}\n${Date.now()}`,
    );

    const resumed = await store.resume(staleLockId);
    expect(resumed!.state).toBe("EXECUTING");
    expect(fs.existsSync(
      path.join(tmpDir, ".agent", "runs", staleLockId, "run.json.lock"),
    )).toBe(false);

    await store.deleteRun(staleLockId);
  });

  it("GAP-2: stale process.json (dead PID) is flagged as orphan and cleaned", async () => {
    const staleProcId = "proc-stale-test";
    await store.createRun(staleProcId, {});
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
    await new Promise((resolve) => child.on("exit", resolve));
    fs.writeFileSync(
      path.join(tmpDir, ".agent", "runs", staleProcId, "process.json"),
      JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }),
    );

    await store.checkAndFlagStaleProcess(staleProcId);
    const run = await store.getRun(staleProcId);
    expect(run!.staleProcess).toBe(true);
    expect(run!.orphanPid).toBe(child.pid);
    expect(fs.existsSync(
      path.join(tmpDir, ".agent", "runs", staleProcId, "process.json"),
    )).toBe(false);

    await store.deleteRun(staleProcId);
  });

  it("GAP-2: resume refuses double-execution when a live foreign process owns the run", async () => {
    const liveProcId = "proc-live-test";
    await store.createRun(liveProcId, {});
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      fs.writeFileSync(
        path.join(tmpDir, ".agent", "runs", liveProcId, "process.json"),
        JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }),
      );
      const resumed = await store.resume(liveProcId);
      expect(resumed!.state).toBe("CREATED"); // state stays as-is
      expect(resumed!.error).toBe(RUN_ACTIVE_ERROR);
    } finally {
      child.kill("SIGKILL");
    }
    await store.deleteRun(liveProcId);
  });

  it("getRun throws CORRUPTED_RUN_ERROR when run.json exists but is not valid JSON", async () => {
    const corruptId = "corrupt-json-test";
    await store.createRun(corruptId, {});
    const fp = path.join(tmpDir, ".agent", "runs", corruptId, "run.json");
    fs.writeFileSync(fp, "not valid json {{{", "utf-8");

    await expect(store.getRun(corruptId)).rejects.toThrow(/not valid JSON/);
    await store.deleteRun(corruptId);
  });

  it("validateRun throws on missing runId", async () => {
    const corruptId = "missing-runid-test";
    await store.createRun(corruptId, {});
    const fp = path.join(tmpDir, ".agent", "runs", corruptId, "run.json");
    const run = JSON.parse(fs.readFileSync(fp, "utf-8"));
    delete run.runId;
    fs.writeFileSync(fp, JSON.stringify(run), "utf-8");

    await expect(store.getRun(corruptId)).rejects.toThrow(/missing runId/);
    await store.deleteRun(corruptId);
  });

  it("validateRun throws on invalid state field", async () => {
    const corruptId = "bad-state-test";
    await store.createRun(corruptId, {});
    const fp = path.join(tmpDir, ".agent", "runs", corruptId, "run.json");
    const run = JSON.parse(fs.readFileSync(fp, "utf-8"));
    run.state = "NOT_A_REAL_STATE";
    fs.writeFileSync(fp, JSON.stringify(run), "utf-8");

    await expect(store.getRun(corruptId)).rejects.toThrow(/invalid state/);
    await store.deleteRun(corruptId);
  });

  it("validateRun throws when receipts is not an array", async () => {
    const corruptId = "bad-receipts-test";
    await store.createRun(corruptId, {});
    const fp = path.join(tmpDir, ".agent", "runs", corruptId, "run.json");
    const run = JSON.parse(fs.readFileSync(fp, "utf-8"));
    run.receipts = "not an array";
    fs.writeFileSync(fp, JSON.stringify(run), "utf-8");

    await expect(store.getRun(corruptId)).rejects.toThrow(/receipts must be array/);
    await store.deleteRun(corruptId);
  });

  it("addReceipt returns false (dedup) when receipt with same id already exists", async () => {
    const dedupId = "dedup-test";
    await store.createRun(dedupId, {});
    const receipt = { id: "dup-1", taskId: "T-1", status: "PASS" };
    const first = await store.addReceipt(dedupId, receipt);
    expect(first).toBe(true);
    const second = await store.addReceipt(dedupId, receipt);
    expect(second).toBe(false);
    const run = await store.getRun(dedupId);
    expect(run!.receipts).toHaveLength(1);
    await store.deleteRun(dedupId);
  });

  it("addReceipt adds receipts without id (no dedup, idempotent push)", async () => {
    const noIdId = "no-id-receipt-test";
    await store.createRun(noIdId, {});
    await store.addReceipt(noIdId, { taskId: "T-1", status: "FAIL" });
    await store.addReceipt(noIdId, { taskId: "T-1", status: "FAIL" });
    const run = await store.getRun(noIdId);
    expect(run!.receipts).toHaveLength(2);
    await store.deleteRun(noIdId);
  });

  it("addReceipt rejects non-object receipt", async () => {
    const badId = "bad-receipt-type";
    await store.createRun(badId, {});
    await expect(store.addReceipt(badId, "string receipt" as unknown as object)).rejects.toThrow(/must be an object/);
    await expect(store.addReceipt(badId, null)).rejects.toThrow(/must be an object/);
    await store.deleteRun(badId);
  });

  it("createRun overwrites existing run with fresh state and incremented attempt", async () => {
    const overwriteId = "overwrite-test";
    await store.createRun(overwriteId, { v: 1 });
    const r1 = await store.getRun(overwriteId);
    expect(r1!.attempt).toBe(1);
    expect(r1!.plan).toEqual({ v: 1 });

    await store.createRun(overwriteId, { v: 2 });
    const r2 = await store.getRun(overwriteId);
    expect(r2!.attempt).toBe(2);
    expect(r2!.plan).toEqual({ v: 2 });
    expect(r2!.state).toBe("CREATED");
    await store.deleteRun(overwriteId);
  });

  it("checkpoint embeds completedTaskIds from tasks with state=COMPLETED", async () => {
    const cpTaskId = "cp-taskids-test";
    await store.createRun(cpTaskId, {});
    const run = await store.getRun(cpTaskId);
    run!.tasks = [
      { id: "T-A", taskId: "T-A", state: "COMPLETED", status: "completed" },
      { id: "T-B", taskId: "T-B", state: "PENDING", status: "pending" },
      { id: "T-C", taskId: "T-C", state: "COMPLETED", completed: true },
    ];
    fs.writeFileSync(
      path.join(tmpDir, ".agent", "runs", cpTaskId, "run.json"),
      JSON.stringify(run, null, 2),
    );
    const cp = await store.checkpoint(cpTaskId);
    expect(cp.completedTaskIds).toContain("T-A");
    expect(cp.completedTaskIds).toContain("T-C");
    expect(cp.completedTaskIds).not.toContain("T-B");
    await store.deleteRun(cpTaskId);
  });

  it("resume with no checkpoint returns run unchanged", async () => {
    const noCpId = "no-cp-test";
    await store.createRun(noCpId, {});
    await store.updateState(noCpId, "EXECUTING");
    const resumed = await store.resume(noCpId);
    expect(resumed!.state).toBe("EXECUTING");
    expect(resumed!.tasks).toEqual([]);
    await store.deleteRun(noCpId);
  });

  it("checkpoint data contains plan, tasks, receipts snapshot", async () => {
    const snapId = "snapshot-test";
    await store.createRun(snapId, { myPlan: true });
    await store.addReceipt(snapId, { id: "r1", taskId: "T-1", status: "PASS" });
    const cp = await store.checkpoint(snapId);
    expect(cp.data.plan).toEqual({ myPlan: true });
    expect(cp.data.receipts).toHaveLength(1);
    expect(cp.schemaVersion).toBe(1);
    await store.deleteRun(snapId);
  });
});
