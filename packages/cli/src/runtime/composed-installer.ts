import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { RUNTIME_PLATFORMS, type RuntimePlatform, type SourceManifest } from "./contracts.js";
import { exists, fsyncDirectory, fsyncRegularFile, hash, readRegularFileNoFollow, writeJsonDurable } from "./filesystem.js";
import { resolveOmpAgentHome } from "../native/omp.js";

export interface SkillProjection {
  id: string;
  sourceDir: string;
  destinationDir: string;
  representationFormat: "directory_skill_md" | "single_file_overlay" | "manifest_entry" | "custom_package";
  files: Array<{ relativePath: string; sha256: string }>;
}

export interface GlobalOwnershipManifest {
  schema: "agent-rules/global-ownership-manifest/v1";
  version: 1;
  updatedAt: string;
  effectivePlanSha256: string;
  projections: Record<string, {
    platform: string;
    surface?: string;
    path: string;
    kind: "rule" | "skill" | "config" | "agent";
    sha256: string;
    sourceHash?: string;
  }>;
}

export interface WorkspaceOwnershipManifest {
  schema: "agent-rules/workspace-ownership-manifest/v1";
  version: 1;
  repositoryRoot: string;
  updatedAt: string;
  effectivePlanSha256: string;
  projections: Record<string, {
    platform: string;
    surface?: string;
    path: string;
    kind: "rule" | "skill" | "config" | "agent";
    sha256: string;
    sourceHash?: string;
  }>;
}

export interface PlatformInstallResult {
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  root: string;
  rulesCount: number;
  skillsCount: number;
  skillsProjected: string[];
  collisionsSkipped?: string[];
  activationKind?: string;
  error?: string;
}

export interface ComposedInstallReceipt {
  schema: "agent-rules/composed-install-receipt/v1";
  version: 1;
  installedAt: string;
  effectivePlanSha256: string;
  manifestSha256: string;
  globalManifestPath: string;
  workspaceManifestPath?: string;
  projections: Record<RuntimePlatform, PlatformInstallResult>;
  status: "PASS" | "PARTIAL" | "FAILED";
}

export function getGlobalSkillRoots(): Record<RuntimePlatform, string[]> {
  const home = os.homedir();
  return {
    codex: [process.env.CODEX_SKILLS_DIR ?? path.join(home, ".agents", "skills")],
    claude: [path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude"), "skills")],
    opencode: [path.join(process.env.OPENCODE_HOME ?? path.join(home, ".config", "opencode"), "skills")],
    antigravity: [
      path.join(home, ".gemini", "config", "skills"), // Antigravity IDE
      path.join(home, ".gemini", "antigravity-cli", "skills"), // Antigravity CLI
    ],
    cursor: [path.join(home, ".cursor", "skills")],
    grok: [path.join(process.env.GROK_HOME ?? path.join(home, ".grok"), "skills")],
    "deepseek-harness": [path.join(process.env.DSH_HOME ?? path.join(home, ".dsh"), "skills")],
    "command-code": [path.join(process.env.COMMAND_CODE_HOME ?? path.join(home, ".commandcode"), "skills")],
    omp: [path.join(resolveOmpAgentHome(process.env, home), "skills")],
  };
}

export function getHarnessHome(): string {
  const home = os.homedir();
  return process.env.AGENT_RULES_HOME ?? path.join(home, ".agent-rules");
}

export async function readGlobalOwnershipManifest(): Promise<GlobalOwnershipManifest | null> {
  const manifestPath = path.join(getHarnessHome(), "ownership-manifest.json");
  if (!(await exists(manifestPath))) return null;
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(content) as GlobalOwnershipManifest;
  } catch {
    return null;
  }
}

/**
 * Early releases predate the per-skill ownership manifest but wrote a signed
 * host-level install receipt.  We can adopt only that exact shape, and only
 * when it names the same host root.  A directory that merely happens to have
 * a `SKILL.md` remains user-owned and blocks the projection.
 */
async function hasLegacyManagedSkillReceipt(platform: RuntimePlatform, targetRoot: string): Promise<boolean> {
  const hostRoot = path.dirname(targetRoot);
  const receiptPath = path.join(hostRoot, "agent-rules-receipt.json");
  // v3-native hosts created a marked AGENTS block before the ownership
  // manifest existed. The exact host marker is sufficient to adopt their own
  // sibling `skills/` directory; it never applies to the shared ~/.agents
  // root, where a user may legitimately maintain the same skill names.
  const instructionPath = path.join(hostRoot, "AGENTS.md");
  if (await exists(instructionPath)) {
    try {
      const instruction = await fs.readFile(instructionPath, "utf8");
      if (instruction.includes(`agent-rules:managed:${platform}`)) return true;
    } catch { /* receipt check below remains available */ }
  }
  if (!(await exists(receiptPath))) return false;
  try {
    const parsed = JSON.parse(await fs.readFile(receiptPath, "utf8")) as {
      schema?: string; host?: string; target_dir?: string;
    };
    return parsed.schema === "agent-rules/install-receipt"
      && parsed.host === platform
      && typeof parsed.target_dir === "string"
      && path.resolve(parsed.target_dir) === path.resolve(hostRoot);
  } catch {
    return false;
  }
}

async function backupLegacySkillRoot(targetRoot: string, platform: RuntimePlatform): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = path.join(getHarnessHome(), "legacy-skill-backups", `${platform}-${stamp}`);
  await fs.mkdir(backupRoot, { recursive: true });
  for (const entry of await fs.readdir(targetRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = path.join(targetRoot, entry.name);
    await fs.cp(source, path.join(backupRoot, entry.name), { recursive: true, force: false, errorOnExist: true });
  }
  await fs.writeFile(path.join(backupRoot, "receipt.json"), JSON.stringify({
    schema: "agent-rules/legacy-skill-migration-backup/v1",
    platform,
    source: targetRoot,
    created_at: new Date().toISOString(),
  }, null, 2) + "\n", "utf8");
}

/** A retired ROUTE.json was emitted only by the old agent-rules skill
 * projector.  A whole root must carry the expected route record for every
 * existing canonical skill before it may be adopted; one matching directory
 * never grants ownership of its neighbours. */
async function hasLegacyManagedSkillBundle(targetRoot: string, skillNames: readonly string[]): Promise<boolean> {
  let sawLegacySkill = false;
  for (const name of skillNames) {
    const skillRoot = path.join(targetRoot, name);
    const skillMd = path.join(skillRoot, "SKILL.md");
    if (!(await exists(skillMd))) continue;
    sawLegacySkill = true;
    const routePath = path.join(skillRoot, "ROUTE.json");
    if (!(await exists(routePath))) {
      // Some final legacy projections had already folded ROUTE.json into
      // SKILL.md. Its explicit provenance marker is the only alternate
      // adoption signal accepted here.
      try {
        const skill = await fs.readFile(skillMd, "utf8");
        if (/source:\s*["']?ROUTE\.json migrated["']?/i.test(skill)
          && /platform_scope:\s*["']?all["']?/i.test(skill)) continue;
      } catch { /* fall through to unowned */ }
      return false;
    }
    try {
      const route = JSON.parse(await fs.readFile(routePath, "utf8")) as { loads?: unknown; platform_scope?: unknown };
      if (!Array.isArray(route.loads) || !route.loads.includes(`skill:${name}`) || route.platform_scope !== "all") return false;
    } catch {
      return false;
    }
  }
  return sawLegacySkill;
}

export async function projectSkillsToGlobal(
  sourceSkillsRoot: string,
  platform: RuntimePlatform,
  options: { effectivePlanSha256?: string; targetRoots?: string[]; force?: boolean } = {}
): Promise<{ projected: string[]; collisions: string[]; updatedManifest: GlobalOwnershipManifest }> {
  const skillRootsList = getGlobalSkillRoots();
  const targetRoots = options.targetRoots ?? (skillRootsList[platform] ?? []);
  const projected: string[] = [];
  const collisions: string[] = [];
  const legacyManagedRoots = new Set<string>();

  const existingManifest = (await readGlobalOwnershipManifest()) ?? {
    schema: "agent-rules/global-ownership-manifest/v1",
    version: 1,
    updatedAt: new Date().toISOString(),
    effectivePlanSha256: options.effectivePlanSha256 ?? "0".repeat(64),
    projections: {},
  };
  const ownedProjectionKey = (skillTargetDir: string): string | undefined => {
    const resolved = path.resolve(skillTargetDir);
    return Object.entries(existingManifest.projections).find(([, projection]) =>
      projection.kind === "skill" && path.resolve(projection.path) === resolved,
    )?.[0];
  };

  if (!(await exists(sourceSkillsRoot))) {
    return { projected, collisions, updatedManifest: existingManifest };
  }

  const entries = await fs.readdir(sourceSkillsRoot, { withFileTypes: true });
  const skillNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  // Preflight every destination before writing anything.  A partial sync that
  // silently leaves one user-owned/stale skill alongside fresh copies makes
  // routing nondeterministic and cannot be certified as a complete bundle.
  for (const targetRoot of targetRoots) {
    const legacyAdoptable = await hasLegacyManagedSkillReceipt(platform, targetRoot)
      || await hasLegacyManagedSkillBundle(targetRoot, skillNames);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillTargetDir = path.join(targetRoot, entry.name);
      const skillMdTarget = path.join(skillTargetDir, "SKILL.md");
      const manifestKey = ownedProjectionKey(skillTargetDir) ?? `${platform}:${path.resolve(skillTargetDir)}`;
      if (await exists(skillMdTarget) && !existingManifest.projections[manifestKey] && !options.force) {
        if (legacyAdoptable) {
          legacyManagedRoots.add(path.resolve(targetRoot));
        } else {
          collisions.push(`${entry.name} @ ${skillTargetDir}`);
        }
      }
    }
  }
  if (collisions.length > 0) return { projected, collisions, updatedManifest: existingManifest };

  for (const targetRoot of targetRoots) {
    await fs.mkdir(targetRoot, { recursive: true });
    if (legacyManagedRoots.has(path.resolve(targetRoot))) {
      await backupLegacySkillRoot(targetRoot, platform);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillName = entry.name;
      const skillSourceDir = path.join(sourceSkillsRoot, skillName);
      const skillTargetDir = path.join(targetRoot, skillName);

      // The collision preflight above ensures this write set is either wholly
      // owned or explicitly forced by the owner.
      const skillMdTarget = path.join(skillTargetDir, "SKILL.md");
      const manifestKey = ownedProjectionKey(skillTargetDir) ?? `${platform}:${path.resolve(skillTargetDir)}`;

      if (await exists(skillMdTarget)) {
        const isOwned = Boolean(existingManifest.projections[manifestKey]) || legacyManagedRoots.has(path.resolve(targetRoot));
        // An owned projection is a complete bundle, not a collection of
        // individual files.  Clear only that owned directory before copying so
        // removed references/scripts cannot remain as a stale, selectable
        // skill after an update.  Unowned directories remain protected above.
        if (isOwned || options.force) await fs.rm(skillTargetDir, { recursive: true, force: true });
      }

      await fs.mkdir(skillTargetDir, { recursive: true });

      const skillFiles = await fs.readdir(skillSourceDir, { recursive: true, withFileTypes: true });
      let combinedHash = "";

      for (const f of skillFiles) {
        if (!f.isFile()) continue;
        const relPath = path.relative(skillSourceDir, path.join(f.parentPath || skillSourceDir, f.name));
        const srcFile = path.join(skillSourceDir, relPath);
        const dstFile = path.join(skillTargetDir, relPath);

        await fs.mkdir(path.dirname(dstFile), { recursive: true });
        const fileContent = await fs.readFile(srcFile);
        const fileHash = crypto.createHash("sha256").update(fileContent).digest("hex");
        combinedHash += fileHash;
        await fs.writeFile(dstFile, fileContent);
      }

      const totalSha256 = crypto.createHash("sha256").update(combinedHash).digest("hex");
      existingManifest.projections[manifestKey] = {
        platform,
        surface: targetRoot.includes("antigravity-cli") ? "cli" : "global",
        path: skillTargetDir,
        kind: "skill",
        sha256: totalSha256,
      };

      if (!projected.includes(skillName)) {
        projected.push(skillName);
      }
    }
  }

  existingManifest.updatedAt = new Date().toISOString();
  await writeGlobalOwnershipManifest(existingManifest);

  return { projected, collisions, updatedManifest: existingManifest };
}

export async function writeGlobalOwnershipManifest(
  manifest: GlobalOwnershipManifest
): Promise<string> {
  const harnessHome = getHarnessHome();
  await fs.mkdir(harnessHome, { recursive: true });
  const manifestPath = path.join(harnessHome, "ownership-manifest.json");
  await writeJsonDurable(manifestPath, manifest);
  return manifestPath;
}

export async function writeWorkspaceOwnershipManifest(
  repoRoot: string,
  manifest: WorkspaceOwnershipManifest
): Promise<string> {
  const agentDir = path.join(repoRoot, ".agent");
  await fs.mkdir(agentDir, { recursive: true });
  const manifestPath = path.join(agentDir, "ownership-manifest.json");
  await writeJsonDurable(manifestPath, manifest);
  return manifestPath;
}

export async function uninstallOwnedGlobalProjections(
  platform?: RuntimePlatform
): Promise<{ removed: string[]; retained: string[] }> {
  const manifest = await readGlobalOwnershipManifest();
  if (!manifest) return { removed: [], retained: [] };

  const removed: string[] = [];
  const retained: string[] = [];
  const remainingProjections: typeof manifest.projections = {};

  for (const [key, record] of Object.entries(manifest.projections)) {
    if (platform && record.platform !== platform) {
      remainingProjections[key] = record;
      continue;
    }

    try {
      if (await exists(record.path)) {
        await fs.rm(record.path, { recursive: true, force: true });
        removed.push(record.path);
      }
    } catch {
      retained.push(record.path);
      remainingProjections[key] = record;
    }
  }

  manifest.projections = remainingProjections;
  manifest.updatedAt = new Date().toISOString();
  await writeGlobalOwnershipManifest(manifest);

  return { removed, retained };
}
