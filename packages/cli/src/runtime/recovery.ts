import fs from "node:fs/promises";
import path from "node:path";
import { type RuntimeReceipt, type RuntimePlatform } from "./contracts.js";
import { exists, fsyncDirectory, removeIfExists, writeJsonDurable } from "./filesystem.js";

export interface TransactionJournal {
  schema: "agent-rules/runtime-transaction";
  version: 1;
  operation: "install" | "update" | "rollback";
  phase: "prepared" | "backed-up" | "committed";
  platform: RuntimePlatform;
  target: string;
  staging: string;
  backup: string;
  expectedPlanSha256?: string;
  expectedArtifactSha256?: string;
}

interface RecoveryOperations<Activation extends { destination: string }> {
  runtimeDirectory: string;
  journalFile: string;
  rollbackDirectory: string;
  validateJournal(root: string, platform: RuntimePlatform, journalPath: string, journal: TransactionJournal): Promise<void>;
  assertOwnedRuntime(runtimePath: string, platform?: RuntimePlatform, verifyActivation?: boolean): Promise<RuntimeReceipt>;
  readReceipt(runtimePath: string): Promise<RuntimeReceipt | undefined>;
  activationSpec(platform: RuntimePlatform, root: string, runtimePath: string): Activation;
  assertActivationOwned(spec: Activation, receipt: RuntimeReceipt): Promise<void>;
  createActivation(spec: Activation): Promise<void>;
}

export async function writeJournal<Activation extends { destination: string }>(root: string, journal: TransactionJournal, operations: RecoveryOperations<Activation>): Promise<void> {
  await writeJsonDurable(path.join(root, operations.journalFile), journal);
}

function readJournal(journalPath: string): Promise<TransactionJournal> {
  return fs.readFile(journalPath, "utf8").then((body) => JSON.parse(body) as TransactionJournal).catch(() => {
    throw new Error(`Refusing recovery from invalid transaction journal: ${journalPath}`);
  });
}

export async function recover<Activation extends { destination: string }>(root: string, expectedPlatform: RuntimePlatform, operations: RecoveryOperations<Activation>): Promise<void> {
  const journalPath = path.join(root, operations.journalFile);
  if (!(await exists(journalPath))) return;
  const journal = await readJournal(journalPath);
  const target = path.join(root, operations.runtimeDirectory);
  const rollback = path.join(root, operations.rollbackDirectory);
  await operations.validateJournal(root, expectedPlatform, journalPath, journal);
  const targetExists = await exists(target);
  const backupExists = await exists(journal.backup);
  if (journal.phase === "prepared") {
    if (journal.operation === "rollback" && await exists(journal.staging) && !targetExists) {
      await fs.rename(journal.staging, target);
      await fsyncDirectory(root);
    } else await removeIfExists(journal.staging);
  } else if (journal.phase === "backed-up") {
    if (journal.operation === "rollback") {
      const stagingExists = await exists(journal.staging);
      if (!targetExists && backupExists && stagingExists) {
        await fs.rename(journal.backup, target);
        await fs.rename(journal.staging, journal.backup);
        await fsyncDirectory(root);
      } else if (targetExists && !backupExists && stagingExists) {
        await fs.rename(journal.staging, journal.backup);
        await fsyncDirectory(root);
      } else if (!targetExists || !backupExists) throw new Error(`Ambiguous interrupted rollback transaction: ${journalPath}`);
    } else if (!targetExists && backupExists) {
      await fs.rename(journal.backup, target);
      await fsyncDirectory(root);
    } else if (targetExists && backupExists) {
      const current = await operations.readReceipt(target);
      if (current?.source.effectivePlanSha256 === journal.expectedPlanSha256 && current?.source.artifactSha256 === journal.expectedArtifactSha256) {
        await operations.assertOwnedRuntime(journal.backup, journal.platform);
      } else throw new Error(`Ambiguous interrupted transaction; target is not the staged runtime: ${target}`);
    } else if (journal.operation === "install" && targetExists && !backupExists) {
      const current = await operations.assertOwnedRuntime(target, expectedPlatform, false);
      if (current.source.effectivePlanSha256 !== journal.expectedPlanSha256 || current.source.artifactSha256 !== journal.expectedArtifactSha256) {
        throw new Error(`Interrupted install target identity mismatch: ${target}`);
      }
      const spec = operations.activationSpec(expectedPlatform, root, target);
      if (await exists(spec.destination)) await operations.assertActivationOwned(spec, current);
      else await operations.createActivation(spec);
      await operations.assertOwnedRuntime(target, expectedPlatform);
    } else if (journal.operation === "update") throw new Error(`Ambiguous interrupted update transaction: ${journalPath}`);
  } else if (journal.phase === "committed" && backupExists) await operations.assertOwnedRuntime(journal.backup, journal.platform);
  await removeIfExists(journal.staging);
  await fs.unlink(journalPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
  await fsyncDirectory(root);
  if (await exists(rollback)) await operations.assertOwnedRuntime(rollback);
}

export async function previewRecovery<Activation extends { destination: string }>(root: string, expectedPlatform: RuntimePlatform, operations: RecoveryOperations<Activation>): Promise<RuntimeReceipt> {
  const journalPath = path.join(root, operations.journalFile);
  const target = path.join(root, operations.runtimeDirectory);
  if (!(await exists(journalPath))) return operations.assertOwnedRuntime(target, expectedPlatform);
  const journal = await readJournal(journalPath);
  await operations.validateJournal(root, expectedPlatform, journalPath, journal);
  const targetExists = await exists(target);
  const backupExists = await exists(journal.backup);
  const stagingExists = await exists(journal.staging);
  let outcome = target;
  if (journal.phase === "prepared" && journal.operation === "rollback" && stagingExists && !targetExists) outcome = journal.staging;
  else if (journal.phase === "backed-up" && journal.operation === "rollback") {
    if (!targetExists && backupExists && stagingExists) outcome = journal.backup;
    else if (!targetExists || (!backupExists && !stagingExists)) throw new Error(`Ambiguous interrupted rollback transaction: ${journalPath}`);
  } else if (journal.phase === "backed-up" && !targetExists && backupExists) outcome = journal.backup;
  else if (!targetExists) throw new Error(`Recovery would not produce an owned runtime: ${target}`);
  return operations.assertOwnedRuntime(outcome, expectedPlatform, outcome === target);
}
