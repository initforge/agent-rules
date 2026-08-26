import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { RUNTIME_PLATFORMS, type RuntimePlatform, type SourceManifest } from "./contracts.js";
import { exists, fsyncDirectory, fsyncRegularFile, hash, readRegularFileNoFollow, writeJsonDurable } from "./filesystem.js";
import { reconcileOpenCodeConfigFile } from "@initforge/agent-rules-kernel";

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

export async function projectSkillsToGlobal(
  sourceSkillsRoot: string,
  platform: RuntimePlatform,
  options: { effectivePlanSha256?: string; targetRoots?: string[]; force?: boolean } = {}
): Promise<{ projected: string[]; collisions: string[]; updatedManifest: GlobalOwnershipManifest }> {
  const skillRootsList = getGlobalSkillRoots();
  const targetRoots = options.targetRoots ?? (skillRootsList[platform] ?? []);
  const projected: string[] = [];
  const collisions: string[] = [];

  const existingManifest = (await readGlobalOwnershipManifest()) ?? {
    schema: "agent-rules/global-ownership-manifest/v1",
    version: 1,
    updatedAt: new Date().toISOString(),
    effectivePlanSha256: options.effectivePlanSha256 ?? "0".repeat(64),
    projections: {},
  };

  if (!(await exists(sourceSkillsRoot))) {
    return { projected, collisions, updatedManifest: existingManifest };
  }

  const entries = await fs.readdir(sourceSkillsRoot, { withFileTypes: true });

  for (const targetRoot of targetRoots) {
    await fs.mkdir(targetRoot, { recursive: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillName = entry.name;
      const skillSourceDir = path.join(sourceSkillsRoot, skillName);
      const skillTargetDir = path.join(targetRoot, skillName);

      // Check if target directory exists and is unowned
      const skillMdTarget = path.join(skillTargetDir, "SKILL.md");
      const manifestKey = `${platform}:${path.resolve(skillTargetDir)}`;

      if (await exists(skillMdTarget)) {
        const isOwned = Boolean(existingManifest.projections[manifestKey]);
        if (!isOwned) {
          // Unowned user skill collision: do not overwrite!
          collisions.push(`${skillName} @ ${skillTargetDir}`);
          continue;
        }
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

export function getStandardMcpServers(home: string): Record<string, { command: string; args: string[]; env?: Record<string, string> }> {
  return {
    "codebase-memory": {
      command: path.join(home, "AppData", "Local", "Programs", "codebase-memory-mcp", "codebase-memory-mcp.exe"),
      args: [],
    },
    playwright: {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npx",
        "-y",
        "@playwright/mcp@0.0.78",
        "--isolated",
        "--executable-path",
        path.join(home, "AppData", "Local", "ms-playwright", "chromium-1232", "chrome-win64", "chrome.exe"),
      ],
    },
    "chrome-devtools": {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npx",
        "-y",
        "chrome-devtools-mcp@1.7.0",
        "--isolated",
        "--executablePath",
        path.join(home, "AppData", "Local", "ms-playwright", "chromium-1232", "chrome-win64", "chrome.exe"),
      ],
      env: {
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1",
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
      },
    },
    context7: {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npx",
        "-y",
        "@upstash/context7-mcp@3.2.5",
      ],
    },
  };
}

export async function syncCursorMcpConfig(): Promise<void> {
  const home = os.homedir();
  const cursorConfig = path.join(home, ".cursor", "mcp.json");
  const standardMcp = getStandardMcpServers(home);
  let existingParsed: Record<string, unknown> = {};
  if (await exists(cursorConfig)) {
    try {
      existingParsed = JSON.parse(await fs.readFile(cursorConfig, "utf8"));
    } catch { /* ignore */ }
  }
  const updatedConfig = {
    ...existingParsed,
    mcpServers: {
      ...(typeof existingParsed.mcpServers === "object" && existingParsed.mcpServers !== null ? (existingParsed.mcpServers as Record<string, unknown>) : {}),
      ...standardMcp,
    },
  };
  await fs.mkdir(path.dirname(cursorConfig), { recursive: true });
  await fs.writeFile(cursorConfig, JSON.stringify(updatedConfig, null, 2) + "\n", "utf8");
}

export async function syncGrokMcpConfig(): Promise<void> {
  const home = os.homedir();
  const grokConfig = path.join(process.env.GROK_HOME ?? path.join(home, ".grok"), "mcp.json");
  const standardMcp = getStandardMcpServers(home);
  let existingParsed: Record<string, unknown> = {};
  if (await exists(grokConfig)) {
    try {
      existingParsed = JSON.parse(await fs.readFile(grokConfig, "utf8"));
    } catch { /* ignore */ }
  }
  const updatedConfig = {
    ...existingParsed,
    mcpServers: {
      ...(typeof existingParsed.mcpServers === "object" && existingParsed.mcpServers !== null ? (existingParsed.mcpServers as Record<string, unknown>) : {}),
      ...standardMcp,
    },
  };
  await fs.mkdir(path.dirname(grokConfig), { recursive: true });
  await fs.writeFile(grokConfig, JSON.stringify(updatedConfig, null, 2) + "\n", "utf8");
}

export async function syncClaudeMcpConfig(): Promise<void> {
  const home = os.homedir();
  const standardMcp = getStandardMcpServers(home);
  const targets = [
    path.join(home, ".claude.json"),
    path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude"), "mcp.json"),
    path.join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
  ];
  for (const target of targets) {
    let existingParsed: Record<string, unknown> = {};
    if (await exists(target)) {
      try {
        existingParsed = JSON.parse(await fs.readFile(target, "utf8"));
      } catch { /* ignore */ }
    }
    const updatedConfig = {
      ...existingParsed,
      mcpServers: {
        ...(typeof existingParsed.mcpServers === "object" && existingParsed.mcpServers !== null ? (existingParsed.mcpServers as Record<string, unknown>) : {}),
        ...standardMcp,
      },
    };
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(updatedConfig, null, 2) + "\n", "utf8");
  }
}

export async function syncDeepSeekHarnessMcpConfig(): Promise<void> {
  // DSH is a Cordis/plugin host. Its generic $DSH_HOME/mcp.json is not an
  // official active surface, so the core skill projection must never compose
  // it. DSH MCP is installed and read back through its native plugin/profile
  // lifecycle (platforms/deepseek-harness/adapter.ts).
}

export async function syncCommandCodeMcpConfig(): Promise<void> {
  const home = os.homedir();
  const commandCodeHome = process.env.COMMAND_CODE_HOME ?? path.join(home, ".commandcode");
  const cmdcConfig = path.join(commandCodeHome, "mcp.json");
  const legacyConfig = path.join(home, ".command-code", "mcp.json");
  const standardMcp = getStandardMcpServers(home);
  let existingParsed: Record<string, unknown> = {};
  if (await exists(cmdcConfig)) {
    try {
      existingParsed = JSON.parse(await fs.readFile(cmdcConfig, "utf8"));
    } catch { /* ignore */ }
  } else if (await exists(legacyConfig)) {
    // The previous installer wrote this legacy path. Read it only as a
    // migration source; never delete or overwrite the legacy file.
    try {
      existingParsed = JSON.parse(await fs.readFile(legacyConfig, "utf8"));
    } catch { /* ignore */ }
  }
  const currentServers = existingParsed.mcpServers;
  if (currentServers !== undefined && (!currentServers || typeof currentServers !== "object" || Array.isArray(currentServers))) {
    throw new Error(`Command Code MCP config has invalid mcpServers: ${cmdcConfig}`);
  }
  const managedMcp = Object.fromEntries(Object.entries(standardMcp).map(([name, server]) => [name, { ...server }]));
  const nextServers: Record<string, unknown> = { ...((currentServers ?? {}) as Record<string, unknown>) };
  for (const [name, definition] of Object.entries(managedMcp)) {
    const current = nextServers[name];
    if (current !== undefined && (!current || typeof current !== "object" || Array.isArray(current))) {
      throw new Error(`Refusing to overwrite user-modified Command Code MCP server: ${name}`);
    }
    if (current !== undefined) {
      const candidate = current as Record<string, unknown>;
      const sameCommand = candidate.command === definition.command
        && JSON.stringify(candidate.args ?? []) === JSON.stringify(definition.args ?? [])
        && JSON.stringify(candidate.env ?? {}) === JSON.stringify(definition.env ?? {});
      if (!sameCommand) throw new Error(`Refusing to overwrite user-modified Command Code MCP server: ${name}`);
    }
    nextServers[name] = definition;
  }
  const updatedConfig = {
    ...existingParsed,
    mcpServers: nextServers,
  };
  await fs.mkdir(path.dirname(cmdcConfig), { recursive: true });
  const temporary = `${cmdcConfig}.tmp-${crypto.randomUUID().slice(0, 8)}`;
  try {
    await fs.writeFile(temporary, JSON.stringify(updatedConfig, null, 2) + "\n", "utf8");
    await fs.rename(temporary, cmdcConfig);
  } catch (error) {
    try { await fs.rm(temporary, { force: true }); } catch { /* preserve the mutation error */ }
    throw error;
  }
}

export async function syncOpenCodeMcpConfig(): Promise<void> {
  const home = os.homedir();
  const opencodeDir = process.env.OPENCODE_HOME ?? path.join(home, ".config", "opencode");
  const opencodeConfig = path.join(opencodeDir, "opencode.json");
  const standardMcp = getStandardMcpServers(home);

  reconcileOpenCodeConfigFile(opencodeConfig, standardMcp, { backup: true });

  const opencodeJsonc = path.join(opencodeDir, "opencode.jsonc");
  if (await exists(opencodeJsonc)) {
    reconcileOpenCodeConfigFile(opencodeJsonc, standardMcp, { backup: true });
  }
}

export async function syncAntigravityMcpConfig(): Promise<void> {
  const home = os.homedir();
  const centralConfig = path.join(home, ".gemini", "config", "mcp_config.json");
  const engineConfig = path.join(home, ".gemini", "antigravity", "mcp_config.json");

  let sourceContent: string | null = null;
  if (await exists(engineConfig)) {
    try {
      const raw = await fs.readFile(engineConfig, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.mcpServers && Object.keys(parsed.mcpServers).length > 0) {
        sourceContent = raw;
      }
    } catch { /* ignore */ }
  }

  if (sourceContent) {
    let centralNeedsSync = true;
    if (await exists(centralConfig)) {
      try {
        const parsed = JSON.parse(await fs.readFile(centralConfig, "utf8"));
        if (parsed.mcpServers && Object.keys(parsed.mcpServers).length > 0) {
          centralNeedsSync = false;
        }
      } catch { centralNeedsSync = true; }
    }
    if (centralNeedsSync) {
      await fs.mkdir(path.dirname(centralConfig), { recursive: true });
      await fs.writeFile(centralConfig, sourceContent, "utf8");
    }
  }
}

export async function syncPlatformMcpConfig(platform: RuntimePlatform): Promise<void> {
  switch (platform) {
    case "antigravity":
      await syncAntigravityMcpConfig();
      break;
    case "opencode":
      await syncOpenCodeMcpConfig();
      break;
    case "cursor":
      await syncCursorMcpConfig();
      break;
    case "grok":
      await syncGrokMcpConfig();
      break;
    case "claude":
      await syncClaudeMcpConfig();
      break;
    case "deepseek-harness":
      await syncDeepSeekHarnessMcpConfig();
      break;
    case "command-code":
      await syncCommandCodeMcpConfig();
      break;
    case "codex":
      // Codex config.toml managed by mcp-convergence
      break;
  }
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
