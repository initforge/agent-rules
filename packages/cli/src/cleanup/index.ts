import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type ClassifiedItem,
  type CleanupReceipt,
  JUNK_BASENAMES,
  JUNK_EXTENSIONS,
  PROTECTED_SEGMENTS,
} from "./types.js";

/**
 * SS-24 (R-042) cleanup core — B05:
 * inventory/classify/rescue, exact-named non-production deletion guard,
 * rollback/irreversibility receipt. Preservation-first (M11-R64): nothing is
 * destroyed before it is classified; protected paths fail closed.
 */

const GLOB_PATTERN = /[*?[\]{}]/;

/** B05 guard: deletion/rescue accepts only exact path names, never globs. */
export function assertExactNamed(target: string): void {
  if (GLOB_PATTERN.test(target)) {
    throw new Error(
      `Cleanup guard: exact path names required, glob/wildcard rejected: "${target}"`
    );
  }
}

/**
 * Deterministic classification:
 * keep (protected/outside-root/missing) -> rescue (unclassified) -> delete (junk).
 * Order matters: protection wins over junk.
 */
export function classifyPath(target: string, repoRoot: string): ClassifiedItem {
  const abs = path.resolve(target);
  const rel = path.relative(repoRoot, abs);
  let kind: "file" | "directory" = "file";
  let sizeBytes = 0;
  let exists = true;
  try {
    const stat = fs.statSync(abs);
    kind = stat.isDirectory() ? "directory" : "file";
    sizeBytes = stat.isDirectory() ? 0 : stat.size;
  } catch {
    exists = false;
  }
  const base: Omit<ClassifiedItem, "classification" | "reason"> & {
    classification: ClassifiedItem["classification"];
    reason: string;
  } = {
    path: abs,
    rel,
    kind,
    sizeBytes,
    classification: "keep",
    reason: "",
  };
  if (!exists) return { ...base, reason: "path does not exist" };
  if (rel === "") return { ...base, reason: "repository root is protected" };
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return { ...base, reason: "outside repository root" };
  }
  const segments = rel.split(path.sep).map((segment) => segment.toLowerCase());
  const protectedHit = segments.find((segment) => PROTECTED_SEGMENTS.includes(segment));
  if (protectedHit !== undefined) {
    return { ...base, reason: `protected segment "${protectedHit}"` };
  }
  const basename = path.basename(abs);
  if (
    JUNK_BASENAMES.has(basename) ||
    JUNK_BASENAMES.has(basename.toLowerCase()) ||
    JUNK_EXTENSIONS.has(path.extname(basename).toLowerCase())
  ) {
    return { ...base, classification: "delete", reason: "junk pattern" };
  }
  return { ...base, classification: "rescue", reason: "unclassified — preserve before removal" };
}

/** B05 inventory: classify every explicitly named target. */
export function inventoryPaths(targets: string[], repoRoot: string): ClassifiedItem[] {
  return targets.map((target) => classifyPath(target, repoRoot));
}

function receiptId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`;
}

/** B05 receipt: irreversibility + rollback for delete; move-back for rescue. */
export function buildReceipt(input: {
  mode: "delete" | "rescue";
  repoRoot: string;
  items: ClassifiedItem[];
  dryRun: boolean;
  irreversible: boolean;
  quarantineDir: string | null;
  gitHead: string | null;
}): CleanupReceipt {
  const relList = input.items.map((item) => item.rel).join(" ");
  const body = {
    schema: "artifact/cleanup-receipt" as const,
    version: 1 as const,
    receiptId: receiptId(),
    createdAt: new Date().toISOString(),
    repoRoot: input.repoRoot,
    mode: input.mode,
    dryRun: input.dryRun,
    irreversible: input.irreversible,
    gitHead: input.gitHead,
    quarantineDir: input.quarantineDir,
    items: input.items,
    rollback:
      input.mode === "delete"
        ? [
            "Deletion is irreversible: no retained copy of removed paths.",
            input.gitHead
              ? `Recover tracked files: git restore --source=${input.gitHead} -- ${relList}`
              : "Recover tracked files: git restore -- <relative-path> (no repo HEAD captured)",
            "Untracked files are unrecoverable.",
          ]
        : [
            "Rollback: move each item from quarantineDir/<rel> back to <rel>.",
            `Rescue root: ${input.quarantineDir ?? "<none>"}`,
          ],
  };
  const hash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, hash };
}

function writeJson(file: string, receipt: CleanupReceipt): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n", "utf8");
}

function gitHeadOf(repoRoot: string): string | null {
  try {
    const output = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}

function moveTo(destination: string, source: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    fs.cpSync(source, destination, { recursive: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
}

/** B05 rescue: move exact-named items into quarantine, receipt = rollback path. */
export function rescuePaths(
  targets: string[],
  ctx: { repoRoot: string; quarantineRoot: string; dryRun: boolean }
): CleanupReceipt {
  targets.forEach(assertExactNamed);
  const items = targets.map((target) => classifyPath(target, ctx.repoRoot));
  for (const item of items) {
    if (!fs.existsSync(item.path)) {
      throw new Error(`Cannot rescue missing path: ${item.path}`);
    }
    if (item.classification === "keep") {
      throw new Error(
        `Rescue guard: refusing "${item.path}" — ${item.reason}. Protected paths are never moved.`
      );
    }
  }
  const id = receiptId();
  const quarantineDir = ctx.dryRun ? null : path.join(ctx.quarantineRoot, id);
  if (!ctx.dryRun && quarantineDir !== null) {
    for (const item of items) {
      moveTo(path.join(quarantineDir, "items", item.rel), item.path);
    }
  }
  const receipt = buildReceipt({
    mode: "rescue",
    repoRoot: ctx.repoRoot,
    items,
    dryRun: ctx.dryRun,
    irreversible: false,
    quarantineDir,
    gitHead: gitHeadOf(ctx.repoRoot),
  });
  if (!ctx.dryRun && quarantineDir !== null) {
    writeJson(path.join(quarantineDir, "receipt.json"), receipt);
  }
  return receipt;
}

/**
 * B05 guarded delete: exact named, existing, classified `delete` only.
 * Protected/rescue-classified targets fail closed. Receipt marks
 * irreversibility and records rollback (git restore) before removal.
 */
export function deletePaths(
  targets: string[],
  ctx: { repoRoot: string; receiptsDir: string; dryRun: boolean }
): CleanupReceipt {
  targets.forEach(assertExactNamed);
  const items = targets.map((target) => classifyPath(target, ctx.repoRoot));
  for (const item of items) {
    if (!fs.existsSync(item.path)) {
      throw new Error(`Cannot delete missing path: ${item.path}`);
    }
    if (item.classification !== "delete") {
      throw new Error(
        `Deletion guard: refusing "${item.path}" — classified ${item.classification} (${item.reason}). ` +
          "Only exact-named non-production junk targets are deletable; rescue unclassified items first."
      );
    }
  }
  if (!ctx.dryRun) {
    for (const item of items) {
      fs.rmSync(item.path, { recursive: true, force: true });
    }
  }
  const receipt = buildReceipt({
    mode: "delete",
    repoRoot: ctx.repoRoot,
    items,
    dryRun: ctx.dryRun,
    irreversible: true,
    quarantineDir: null,
    gitHead: gitHeadOf(ctx.repoRoot),
  });
  if (!ctx.dryRun) {
    writeJson(path.join(ctx.receiptsDir, `${receipt.receiptId}.json`), receipt);
  }
  return receipt;
}
