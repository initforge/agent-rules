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

    const run = await store.getRun(run2Id);
    run!.tasks = [
      { id: "t1", name: "Task 1", status: "completed" },
      { id: "t2", name: "Task 2", status: "pending" },
    ];
    fs.writeFileSync(
      path.join(tmpDir, ".agent", "runs", run2Id, "run.json"),
      JSON.stringify(run, null, 2),
    );
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

    let run = await store.getRun(run3Id);
    run!.tasks = [
      { id: "task-a", name: "Alpha", status: "completed" },
      { id: "task-b", name: "Beta", status: "pending" },
    ];
    fs.writeFileSync(
      path.join(tmpDir, ".agent", "runs", run3Id, "run.json"),
      JSON.stringify(run, null, 2),
    );
    await store.updateState(run3Id, "PLANNED");
    const cp = await store.checkpoint(run3Id);
    expect(cp.completedTaskIds).toEqual(["task-a"]);

    const completedBefore = await store.getCompletedTaskIds(run3Id);
    expect(completedBefore).toEqual(["task-a"]);

    const resumed = await store.resume(run3Id);
    expect(resumed!.state).toBe("PLANNED");

    const runAfterResume = await store.getRun(run3Id);
    const completedTasks = (runAfterResume!.tasks as { id: string; status: string }[])
      .filter(t => t.status === "completed");
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

    let run = await store1.getRun(interruptionId);
    run!.tasks = [
      { id: "i1", name: "Install", status: "completed" },
      { id: "i2", name: "Build", status: "completed" },
      { id: "i3", name: "Test", status: "pending" },
    ];
    fs.writeFileSync(
      path.join(tmpDir, ".agent", "runs", interruptionId, "run.json"),
      JSON.stringify(run, null, 2),
    );
    await store1.updateState(interruptionId, "EXECUTING");
    await store1.checkpoint(interruptionId);

    const store2 = new DurableStore(tmpDir);
    const resumed = await store2.resume(interruptionId);
    expect(resumed).not.toBeNull();
    expect(resumed!.state).toBe("EXECUTING");

    const completedIds = await store2.getCompletedTaskIds(interruptionId);
    expect(completedIds).toEqual(["i1", "i2"]);

    const pendingTasks = (resumed!.tasks as { id: string; status: string }[])
      .filter(t => t.status !== "completed");
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
});
