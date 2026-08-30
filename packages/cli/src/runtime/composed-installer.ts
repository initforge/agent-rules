import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { RUNTIME_PLATFORMS, type RuntimePlatform } from "./contracts.js";
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
  candidateSha256: string;
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
  candidateSha256: string;
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
  candidateSha256: string;
  manifestSha256: string;
  globalManifestPath: string;
  workspaceManifestPath?: string;
  projections: Record<RuntimePlatform, PlatformInstallResult>;
  status: "PASS" | "PARTIAL" | "FAILED";
}

interface SkillProjectionBackupManifest {
  schema: "agent-rules/skill-projection-backup/v1";
  platform: RuntimePlatform;
  harnessHome: string;
  previousProjections: GlobalOwnershipManifest['projections'];
  entries: Array<{ target: string; backupDirectory: string | null }>;
}

async function skillProjectionHash(root: string): Promise<string> {
  if (!(await exists(root))) return crypto.createHash("sha256").update("").digest("hex");
  const files = (await fs.readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath || root, entry.name)))
    .sort((left, right) => left.localeCompare(right));
  const combined = (await Promise.all(files.map(async (relativePath) => {
    const content = await fs.readFile(path.join(root, relativePath));
    return crypto.createHash("sha256").update(content).digest("hex");
  }))).join("");
  return crypto.createHash("sha256").update(combined).digest("hex");
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

export async function readGlobalOwnershipManifest(harnessHome = getHarnessHome()): Promise<GlobalOwnershipManifest | null> {
  const manifestPath = path.join(harnessHome, "ownership-manifest.json");
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

async function backupLegacySkillRoot(targetRoot: string, platform: RuntimePlatform, harnessHome: string): Promise<void> {
  const backupRoot = path.join(harnessHome, 'rollback', platform, 'legacy-skills');
  const priorReceipt = path.join(backupRoot, 'receipt.json');
  if (await exists(backupRoot)) {
    let owned = false;
    try {
      const parsed = JSON.parse(await fs.readFile(priorReceipt, 'utf8')) as { schema?: string; platform?: string };
      owned = parsed.schema === 'agent-rules/legacy-skill-migration-backup/v1' && parsed.platform === platform;
    } catch { /* unowned collision remains fail-closed */ }
    if (!owned) throw new Error(`Refusing to replace unowned rollback state: ${backupRoot}`);
    await fs.rm(backupRoot, { recursive: true, force: true });
  }
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
    if (!(await exists(skillRoot))) continue;
    if (!(await exists(skillMd))) return false;
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
  options: { candidateSha256?: string; targetRoots?: string[]; harnessHome?: string; rollbackRoot?: string } = {}
): Promise<{ projected: string[]; collisions: string[]; updatedManifest: GlobalOwnershipManifest }> {
  const harnessHome = options.harnessHome ?? getHarnessHome();
  const skillRootsList = getGlobalSkillRoots();
  const targetRoots = options.targetRoots ?? (skillRootsList[platform] ?? []);
  const projected: string[] = [];
  const collisions: string[] = [];
  const legacyManagedRoots = new Set<string>();

  const existingManifest = (await readGlobalOwnershipManifest(harnessHome)) ?? {
    schema: "agent-rules/global-ownership-manifest/v1",
    version: 1,
    updatedAt: new Date().toISOString(),
    candidateSha256: options.candidateSha256 ?? "0".repeat(64),
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
  const desiredNames = new Set(skillNames);
  const targetRootSet = new Set(targetRoots.map((root) => path.resolve(root)));
  const staleOwned = Object.entries(existingManifest.projections).filter(([, projection]) =>
    projection.platform === platform
    && projection.kind === 'skill'
    && targetRootSet.has(path.dirname(path.resolve(projection.path)))
    && !desiredNames.has(path.basename(projection.path)),
  );

  // Preflight every destination before writing anything.  A partial sync that
  // silently leaves one user-owned/stale skill alongside fresh copies makes
  // routing nondeterministic and cannot be certified as a complete bundle.
  for (const targetRoot of targetRoots) {
    const legacyAdoptable = await hasLegacyManagedSkillReceipt(platform, targetRoot)
      || await hasLegacyManagedSkillBundle(targetRoot, skillNames);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillTargetDir = path.join(targetRoot, entry.name);
      const manifestKey = ownedProjectionKey(skillTargetDir) ?? `${platform}:${path.resolve(skillTargetDir)}`;
      if (await exists(skillTargetDir) && !existingManifest.projections[manifestKey]) {
        if (legacyAdoptable) {
          legacyManagedRoots.add(path.resolve(targetRoot));
        } else {
          collisions.push(`${entry.name} @ ${skillTargetDir}`);
        }
      }
    }
  }
  for (const [, projection] of staleOwned) {
    if (await exists(projection.path) && await skillProjectionHash(projection.path) !== projection.sha256) {
      collisions.push(`stale owned skill was user-modified @ ${projection.path}`);
    }
  }
  if (collisions.length > 0) return { projected, collisions, updatedManifest: existingManifest };

  if (options.rollbackRoot) {
    const rollbackRoot = path.resolve(options.rollbackRoot);
    const entriesBackup: SkillProjectionBackupManifest['entries'] = [];
    await fs.mkdir(rollbackRoot, { recursive: true });
    let index = 0;
    for (const targetRoot of targetRoots) {
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const target = path.join(targetRoot, entry.name);
        let backupDirectory: string | null = null;
        if (await exists(target)) {
          backupDirectory = path.join('skill-projections', String(index++), entry.name);
          await fs.mkdir(path.dirname(path.join(rollbackRoot, backupDirectory)), { recursive: true });
          await fs.cp(target, path.join(rollbackRoot, backupDirectory), { recursive: true, force: false, errorOnExist: true });
        }
        entriesBackup.push({ target, backupDirectory });
      }
    }
    for (const [, projection] of staleOwned) {
      if (entriesBackup.some((entry) => path.resolve(entry.target) === path.resolve(projection.path))) continue;
      let backupDirectory: string | null = null;
      if (await exists(projection.path)) {
        backupDirectory = path.join('skill-projections', String(index++), path.basename(projection.path));
        await fs.mkdir(path.dirname(path.join(rollbackRoot, backupDirectory)), { recursive: true });
        await fs.cp(projection.path, path.join(rollbackRoot, backupDirectory), { recursive: true, force: false, errorOnExist: true });
      }
      entriesBackup.push({ target: projection.path, backupDirectory });
    }
    const backup: SkillProjectionBackupManifest = {
      schema: 'agent-rules/skill-projection-backup/v1',
      platform,
      harnessHome,
      previousProjections: Object.fromEntries(Object.entries(existingManifest.projections).filter(([, projection]) => projection.platform === platform)),
      entries: entriesBackup,
    };
    await fs.writeFile(path.join(rollbackRoot, '.skill-projection-backup.json'), `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  }

  try {
    for (const [key, projection] of staleOwned) {
      await fs.rm(projection.path, { recursive: true, force: true });
      delete existingManifest.projections[key];
    }
    for (const targetRoot of targetRoots) {
      await fs.mkdir(targetRoot, { recursive: true });
      if (legacyManagedRoots.has(path.resolve(targetRoot))) {
        await backupLegacySkillRoot(targetRoot, platform, harnessHome);
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillName = entry.name;
        const skillSourceDir = path.join(sourceSkillsRoot, skillName);
        const skillTargetDir = path.join(targetRoot, skillName);

      // The collision preflight above ensures this write set is owned or a
      // parity-proven legacy bundle. There is no generic force bypass.
        const manifestKey = ownedProjectionKey(skillTargetDir) ?? `${platform}:${path.resolve(skillTargetDir)}`;

        if (await exists(skillTargetDir)) {
          const isOwned = Boolean(existingManifest.projections[manifestKey]) || legacyManagedRoots.has(path.resolve(targetRoot));
        // An owned projection is a complete bundle, not a collection of
        // individual files.  Clear only that owned directory before copying so
        // removed references/scripts cannot remain as a stale, selectable
        // skill after an update.  Unowned directories remain protected above.
          if (isOwned) await fs.rm(skillTargetDir, { recursive: true, force: true });
        }

        await fs.mkdir(skillTargetDir, { recursive: true });

        const skillFiles = await fs.readdir(skillSourceDir, { recursive: true, withFileTypes: true });

        for (const f of skillFiles) {
          if (!f.isFile()) continue;
          const relPath = path.relative(skillSourceDir, path.join(f.parentPath || skillSourceDir, f.name));
          const srcFile = path.join(skillSourceDir, relPath);
          const dstFile = path.join(skillTargetDir, relPath);

          await fs.mkdir(path.dirname(dstFile), { recursive: true });
          const fileContent = await fs.readFile(srcFile);
          await fs.writeFile(dstFile, fileContent);
        }

        const totalSha256 = await skillProjectionHash(skillTargetDir);
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
    await writeGlobalOwnershipManifest(existingManifest, harnessHome);

    return { projected, collisions, updatedManifest: existingManifest };
  } catch (error) {
    if (options.rollbackRoot && !await restoreSkillProjectionBackup(options.rollbackRoot, true)) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}; skill projection rollback was not byte-safe`);
    }
    throw error;
  }
}

export async function writeGlobalOwnershipManifest(
  manifest: GlobalOwnershipManifest,
  harnessHome = getHarnessHome(),
): Promise<string> {
  await fs.mkdir(harnessHome, { recursive: true });
  const manifestPath = path.join(harnessHome, "ownership-manifest.json");
  await writeJsonDurable(manifestPath, manifest);
  return manifestPath;
}

export async function restoreSkillProjectionBackup(
  rollbackRoot: string,
  allowUnmanifestedCurrent = false,
): Promise<boolean> {
  const root = path.resolve(rollbackRoot);
  const marker = path.join(root, '.skill-projection-backup.json');
  if (!(await exists(marker))) return true;
  let backup: SkillProjectionBackupManifest;
  try {
    backup = JSON.parse(await fs.readFile(marker, 'utf8')) as SkillProjectionBackupManifest;
  } catch {
    return false;
  }
  if (backup.schema !== 'agent-rules/skill-projection-backup/v1'
    || !RUNTIME_PLATFORMS.includes(backup.platform)
    || !Array.isArray(backup.entries)
    || !backup.previousProjections
    || typeof backup.previousProjections !== 'object') return false;

  const current = (await readGlobalOwnershipManifest(backup.harnessHome)) ?? {
    schema: 'agent-rules/global-ownership-manifest/v1' as const,
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    candidateSha256: '0'.repeat(64),
    projections: {},
  };
  for (const entry of backup.entries) {
    if (!entry || typeof entry.target !== 'string' || (entry.backupDirectory !== null && typeof entry.backupDirectory !== 'string')) return false;
    if (entry.backupDirectory) {
      const source = path.resolve(root, entry.backupDirectory);
      if (!source.startsWith(`${root}${path.sep}`) || !(await exists(source))) return false;
    }
    if (!(await exists(entry.target)) || allowUnmanifestedCurrent) continue;
    const projection = Object.values(current.projections).find((record) => record.platform === backup.platform && path.resolve(record.path) === path.resolve(entry.target));
    if (!projection || projection.kind !== 'skill' || await skillProjectionHash(entry.target) !== projection.sha256) return false;
  }

  for (const entry of backup.entries) {
    await fs.rm(entry.target, { recursive: true, force: true });
    if (entry.backupDirectory) {
      await fs.mkdir(path.dirname(entry.target), { recursive: true });
      const source = path.resolve(root, entry.backupDirectory);
      await fs.cp(source, entry.target, { recursive: true, force: false, errorOnExist: true });
      if (await skillProjectionHash(source) !== await skillProjectionHash(entry.target)) return false;
    }
  }
  current.projections = {
    ...Object.fromEntries(Object.entries(current.projections).filter(([, projection]) => projection.platform !== backup.platform)),
    ...backup.previousProjections,
  };
  current.updatedAt = new Date().toISOString();
  await writeGlobalOwnershipManifest(current, backup.harnessHome);
  return true;
}

export async function uninstallOwnedGlobalProjections(
  platform?: RuntimePlatform,
  harnessHome = getHarnessHome(),
): Promise<{ removed: string[]; retained: string[] }> {
  const manifest = await readGlobalOwnershipManifest(harnessHome);
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
        if (record.kind === 'skill' && await skillProjectionHash(record.path) !== record.sha256) {
          retained.push(record.path);
          remainingProjections[key] = record;
          continue;
        }
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
  await writeGlobalOwnershipManifest(manifest, harnessHome);

  return { removed, retained };
}
