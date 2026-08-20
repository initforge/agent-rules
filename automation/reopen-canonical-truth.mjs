#!/usr/bin/env node
/**
 * reopen-canonical-truth.mjs — generic stale-terminal correction (P0, F01/REQ-001).
 *
 * Reads the generation-CAS pointer and its referenced ledger and reclassifies
 * the pointed plan to SUPERSEDED/INACTIVE/PARTIAL when the pointer's activation
 * state is not a schema-valid active state or the ledger claims a terminal PASS
 * whose final SHA does not match the current HEAD. The correction is driven
 * entirely by pointer/ledger/CI facts — never a hard-coded plan id.
 *
 * Usage: node automation/reopen-canonical-truth.mjs [--dry-run]
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function importClosureService() {
  const dist = path.join(ROOT, "packages", "kernel", "dist", "northstar", "closure-service.js");
  return import(pathToFileURL(dist).href);
}

function headSha() {
  try {
    return execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }).trim() || null;
  } catch {
    return null;
  }
}

const dryRun = process.argv.includes("--dry-run");
const { readCurrentPointer } = await import(pathToFileURL(path.join(ROOT, "packages", "kernel", "dist", "state", "current-pointer.js")).href);
const { correctStaleTerminal } = await importClosureService();

const pointer = readCurrentPointer(ROOT);
if (!pointer) {
  console.log("no active pointer — nothing to correct");
  process.exit(0);
}

const currentHead = headSha();
const result = correctStaleTerminal({
  repoRoot: ROOT,
  pointer: { plan_id: pointer.plan_id, generation: pointer.generation, activation_state: pointer.atomicity.activation_state },
  currentHead,
  reason: `canonical truth reopened by generic correction: pointer generation ${pointer.generation} activation_state ${pointer.atomicity.activation_state} is not schema-valid active (or terminal PASS stale for ${currentHead}); reclassified SUPERSEDED/INACTIVE/PARTIAL`,
});

if (dryRun) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if ("corrected" in result && result.corrected) {
  console.log(`corrected ${result.plan_id}: ${result.previous_status}/${result.previous_execution_state} -> ${result.corrected_status}/${result.corrected_execution_state} (terminal ${result.terminal_outcome})`);
  console.log(`correction_sha256=${result.correction_sha256}`);
} else {
  console.log(`no correction needed: ${result.reason}`);
}