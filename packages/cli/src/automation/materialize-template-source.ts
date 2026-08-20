import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface SourceLock {
  sourceLock: {
    repository: string;
    commitSha: string;
    templatePath?: string;
  };
  moduleIndex?: Record<string, string>;
}

interface MaterializeOptions {
  sourceLockPath?: string;
  projectRoot?: string;
  module?: string;
  outputDir?: string;
  allowNetwork?: boolean;
  dryRun?: boolean;
  clean?: boolean;
  validateOnly?: boolean;
  repoRoot: string;
}

interface MaterializeResult {
  ok: boolean;
  message: string;
  cacheDir?: string;
  materializedPath?: string;
}

export async function materializeTemplateSource(options: MaterializeOptions): Promise<MaterializeResult> {
  const { sourceLockPath, projectRoot, module, outputDir, dryRun, clean, validateOnly, repoRoot } = options;

  // Resolve lock data
  const lock = await resolveLockData(sourceLockPath, projectRoot, repoRoot);
  if (!lock) {
    return { ok: false, message: "No source-lock.json found" };
  }

  const cacheDir = getCacheDir(lock, outputDir, projectRoot);

  if (clean) {
    if (dryRun) {
      console.log(`[dry-run] Would clean: ${cacheDir}`);
    } else {
      await fs.rm(cacheDir, { recursive: true, force: true });
      console.log(`Cleaned cache: ${cacheDir}`);
    }
    return { ok: true, message: "Cache cleaned" };
  }

  // Check cache
  const cacheExists = await dirExists(cacheDir);
  if (cacheExists && !validateOnly) {
    console.log(`Cache hit: ${cacheDir}`);
    return { ok: true, message: "Already materialized", cacheDir };
  }

  if (validateOnly) {
    if (!cacheExists) {
      return { ok: false, message: `Cache not found: ${cacheDir}` };
    }
    return { ok: true, message: "Cache valid" };
  }

  // Git clone/fetch
  const tempDir = `${cacheDir}.tmp`;
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });

    if (dryRun) {
      console.log(`[dry-run] Would clone ${lock.sourceLock.repository} @ ${lock.sourceLock.commitSha.substring(0, 12)}`);
      return { ok: true, message: "Dry run complete" };
    }

    await execFileAsync("git", [
      "clone",
      "--depth", "1",
      lock.sourceLock.repository,
      tempDir,
    ], { timeout: 120_000 });

    // Checkout pinned commit
    await execFileAsync("git", [
      "fetch", "origin", lock.sourceLock.commitSha,
    ], { cwd: tempDir, timeout: 60_000 });

    await execFileAsync("git", [
      "checkout", lock.sourceLock.commitSha,
    ], { cwd: tempDir, timeout: 30_000 });

    // Move to cache dir
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.rename(tempDir, cacheDir);

    console.log(`Materialized: ${cacheDir}`);
    return { ok: true, message: "Materialized successfully", cacheDir };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    return { ok: false, message: `Materialization failed: ${(error as Error).message}` };
  }
}

async function resolveLockData(sourceLockPath?: string, projectRoot?: string, repoRoot?: string): Promise<SourceLock | null> {
  if (sourceLockPath) {
    try {
      return JSON.parse(await fs.readFile(sourceLockPath, "utf8"));
    } catch {
      return null;
    }
  }

  if (projectRoot) {
    const candidates = [
      path.join(projectRoot, "context/5fedu/source-lock.json"),
      path.join(projectRoot, "source-lock.json"),
      path.join(projectRoot, ".agent/source-lock.json"),
    ];
    for (const candidate of candidates) {
      try {
        return JSON.parse(await fs.readFile(candidate, "utf8"));
      } catch {
        // Continue
      }
    }
  }

  // Fallback to harness default
  if (repoRoot) {
    const harnessLock = path.join(repoRoot, "profiles/5fedu/projects/5fedu/source-lock.json");
    try {
      console.log("WARN: Using harness default source-lock.json");
      return JSON.parse(await fs.readFile(harnessLock, "utf8"));
    } catch {
      // Continue
    }
  }

  return null;
}

function getCacheDir(lock: SourceLock, outputDir?: string, projectRoot?: string): string {
  const repoHash = sha256(lock.sourceLock.repository);
  const commitPrefix = lock.sourceLock.commitSha.substring(0, 12);
  if (outputDir) {
    return path.join(outputDir, "source-lock-cache", repoHash, commitPrefix);
  }
  if (projectRoot) {
    return path.join(projectRoot, ".agent", "source-lock-cache", repoHash, commitPrefix);
  }
  return path.join(".agent", "source-lock-cache", repoHash, commitPrefix);
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
