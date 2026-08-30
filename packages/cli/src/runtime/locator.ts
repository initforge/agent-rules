import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOmpAgentHome } from "../native/omp.js";
import type { RuntimePlatform } from "./contracts.js";

const TEST_REPOSITORY_ROOT = process.env.AGENT_RULES_REPOSITORY_ROOT;
const TEST_STATE_ROOT = process.env.AGENT_RULES_STATE_ROOT;
if (TEST_REPOSITORY_ROOT && process.env.NODE_ENV !== "test") {
  throw new Error("AGENT_RULES_REPOSITORY_ROOT is test-only and unavailable in production");
}
if (TEST_STATE_ROOT && process.env.NODE_ENV !== "test") {
  throw new Error("AGENT_RULES_STATE_ROOT is test-only and unavailable in production");
}

function packageRootFromModule(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

function hasPackedAssets(root: string): boolean {
  return fs.existsSync(path.join(root, "runtime-assets", "manifest.json"));
}

function testOnlySourceRoot(): string | null {
  if (process.env.NODE_ENV !== "test") return null;
  if (TEST_REPOSITORY_ROOT) return path.resolve(TEST_REPOSITORY_ROOT);
  let current = packageRootFromModule();
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(current, "rules", "manifest.yaml")) && fs.existsSync(path.join(current, "platforms", "platform-contracts.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Production runtime assets resolve from the installed package URL/manifest.
 * Cwd, source checkout and test env injection are not production fallbacks.
 */
export function resolvePackageRoot(): string {
  return packageRootFromModule();
}

export function resolveRuntimeAssetsRoot(): string {
  const packed = path.join(packageRootFromModule(), "runtime-assets");
  if (hasPackedAssets(packageRootFromModule())) return packed;
  const testRoot = testOnlySourceRoot();
  if (testRoot) return testRoot;
  throw new Error("runtime assets missing from package; production cannot fall back to cwd or source checkout");
}

/** Writable lifecycle state is separate from immutable packed runtime assets. */
export function resolveRuntimeStateRoot(): string {
  if (process.env.NODE_ENV === "test") {
    return TEST_STATE_ROOT ? path.resolve(TEST_STATE_ROOT) : path.join(os.tmpdir(), "agent-rules-tests", String(process.pid));
  }
  return path.join(os.homedir(), ".agent-rules");
}

export function defaultPlatformRoots(): Record<RuntimePlatform, string> {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) throw new Error("Cannot resolve a user home directory for runtime installation");
  return {
    codex: process.env.CODEX_HOME || path.join(home, ".codex"),
    grok: process.env.GROK_HOME || path.join(home, ".grok"),
    antigravity: path.join(home, ".gemini", "config"),
    cursor: path.join(home, ".cursor"),
    opencode: process.env.OPENCODE_HOME || path.join(home, ".config", "opencode"),
    claude: process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"),
    "deepseek-harness": process.env.DSH_HOME || path.join(home, ".dsh"),
    "command-code": process.env.COMMAND_CODE_HOME || path.join(home, ".commandcode"),
    omp: resolveOmpAgentHome(process.env, home),
  };
}

export function resolveRuntimeAsset(relativePath: string): string {
  const root = resolveRuntimeAssetsRoot();
  const target = path.resolve(root, ...relativePath.split("/"));
  if (!target.startsWith(path.resolve(root))) throw new Error(`runtime asset path escapes package: ${relativePath}`);
  if (!fs.existsSync(target)) throw new Error(`runtime asset missing: ${relativePath}`);
  return target;
}

export function hashFile(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function packedRuntimeAvailable(): boolean {
  return hasPackedAssets(packageRootFromModule());
}
