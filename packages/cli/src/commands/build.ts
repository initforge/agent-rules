import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/powershell.js";
import fs from "node:fs/promises";
import * as crypto from "node:crypto";
import path from "node:path";
import { buildContextGraph } from "../services/context-graph.js";

interface BuildManifest {
  version: number;
  platform: string;
  generatedFrom: Record<string, string>;
  files: { path: string; sha256: string }[];
}

export const OPENCODE_MODEL = "qwencoder/qwen3.7-max";

async function sha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function verifyCanonicalFixture(root: string): Promise<void> {
  const fixture = path.join(root, "packages", "engine", "test", "fixtures", "plan-identity", "original.md");
  const provenance = path.join(root, "packages", "engine", "test", "fixtures", "plan-identity", "provenance.json");
  const meta = JSON.parse(await fs.readFile(provenance, "utf8")) as { sha256?: string; bytes?: number };
  const bytes = await fs.readFile(fixture);
  if (bytes.length !== meta.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== meta.sha256) {
    throw new Error("canonical plan fixture integrity mismatch");
  }
}

function escapePath(p: string): string {
  return p.replace(/\\/g, "/");
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

export async function verifyUiTasteSourcePack(root: string): Promise<void> {
  const lockPath = path.join(root, "skills", "ui-taste", "references", "upstream-lock.json");
  if (!await fs.stat(lockPath).then(() => true).catch(() => false)) return;
  const lock = JSON.parse(await fs.readFile(lockPath, "utf-8")) as {
    content?: { files?: Record<string, string>; packaged_paths?: Record<string, string>; git_blob_sha1?: Record<string, string>; aggregate_sha256?: string; tree_listing_sha256?: string };
  };
  const content = lock.content;
  if (!content?.files || !content.packaged_paths || !content.git_blob_sha1 || !content.aggregate_sha256 || !content.tree_listing_sha256) {
    throw new Error("ui-taste source-pack lock is incomplete");
  }
  const upstreamRoot = path.join(root, "skills", "ui-taste", "references", "upstream");
  const originals = Object.keys(content.files).sort();
  const expectedPackaged = originals.map(original => content.packaged_paths![original]).sort();
  if (expectedPackaged.some(entry => !entry) || new Set(expectedPackaged).size !== expectedPackaged.length) {
    throw new Error("ui-taste source-pack lock has invalid packaged paths");
  }
  const actualPackaged = (await walkDir(upstreamRoot)).map(file => escapePath(path.relative(upstreamRoot, file))).sort();
  if (JSON.stringify(actualPackaged) !== JSON.stringify(expectedPackaged)) {
    throw new Error("ui-taste source-pack files do not match lock");
  }
  const aggregateLines: string[] = [];
  const treeLines: string[] = [];
  for (const original of originals) {
    const packaged = content.packaged_paths[original];
    const bytes = await fs.readFile(path.join(upstreamRoot, packaged));
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (digest !== content.files[original]) throw new Error(`ui-taste source-pack hash mismatch: ${original}`);
    const blob = crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
    if (blob !== content.git_blob_sha1[original]) throw new Error(`ui-taste source-pack blob mismatch: ${original}`);
    aggregateLines.push(`${digest}  .agent/source-lock-cache/taste-skill/skills/${original}\n`);
    treeLines.push(`100644 blob ${blob}\tskills/${original}\n`);
  }
  const aggregate = crypto.createHash("sha256").update(aggregateLines.join("")).digest("hex");
  const listing = crypto.createHash("sha256").update(treeLines.join("")).digest("hex");
  if (aggregate !== content.aggregate_sha256 || listing !== content.tree_listing_sha256) {
    throw new Error("ui-taste source-pack aggregate integrity mismatch");
  }
}

export async function writeContextGraph(root: string, outputPath: string): Promise<void> {
  const graph = buildContextGraph(root);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(graph, null, 2) + "\n", "utf-8");
}

async function replaceTokensInDir(
  dir: string,
  tokens: Record<string, string>
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) { await replaceTokensInDir(fp, tokens); continue; }
    if (!entry.isFile()) continue;
    let content = await fs.readFile(fp, "utf-8");
    for (const [key, val] of Object.entries(tokens)) {
      content = content.replaceAll(key, val);
    }
    await fs.writeFile(fp, content, "utf-8");
  }
}

export async function build(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const root = getRepoRoot();
  const buildRoot = path.join(root, "generated", "runtime-build");
  const platforms = ["codex", "grok", "antigravity", "cursor", "opencode"];
  const errors: string[] = [];

  if (options.dryRun) {
    console.log(`[dry-run] Would build to ${buildRoot} for platforms: ${platforms.join(", ")}`);
    return { exitCode: ExitCode.Success, message: "Dry-run: build skipped" };
  }

  try {
    await verifyCanonicalFixture(root);
    await verifyUiTasteSourcePack(root);
  } catch (e) {
    return { exitCode: ExitCode.GeneralError, message: e instanceof Error ? e.message : String(e) };
  }

  // Step 1: Build context graph (TypeScript, no Python dependency)
  const graphDir = path.dirname(path.join(root, "generated", "context-graph.json"));
  try {
    await fs.mkdir(graphDir, { recursive: true });
    const graphOutput = path.join(graphDir, "context-graph.json");
    await writeContextGraph(root, graphOutput);
    if (options.verbose) {
      console.log(`Context graph built: ${buildContextGraph(root).nodes.length} nodes`);
    }
  } catch (e) {
    errors.push(`Context graph build failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Remove existing build
  try {
    await fs.rm(buildRoot, { recursive: true, force: true });
  } catch { /* ok */ }

  // Load model policy
  const modelPolicyPath = path.join(root, "automation", "model-policy.json");
  let modelPolicy: Record<string, unknown>;
  try {
    modelPolicy = JSON.parse(await fs.readFile(modelPolicyPath, "utf-8"));
  } catch {
    return {
      exitCode: ExitCode.GeneralError,
      message: "Cannot read model-policy.json",
    };
  }

  // Read manifest.yaml for load order
  const manifestPath = path.join(root, "rules", "manifest.yaml");
  let manifestText = "";
  try {
    manifestText = await fs.readFile(manifestPath, "utf-8");
  } catch { errors.push("Cannot read manifest.yaml"); }

  const manifestRules: string[] = [];
  const loadRegex = /^\s+-\s+(\S+\.md)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = loadRegex.exec(manifestText)) !== null) {
    manifestRules.push(match[1]);
  }
  const generatedCoreImports = manifestRules
    .map((r) => `@__CODEX_HOME__/rules/${r}`)
    .join("\n");

  const userHome = process.env.USERPROFILE || process.env.HOME || "";
  const codexHome = process.env.CODEX_HOME || path.join(userHome, ".codex");

  const policy = modelPolicy as Record<string, any>;

  for (const platform of platforms) {
    const target = path.join(buildRoot, platform);
    const rulesDir = path.join(target, "rules");
    const skillsDir = path.join(target, "skills");
    const scriptsDir = path.join(target, "scripts");
    const docsDir = path.join(target, "docs");
    const nativeDir = path.join(target, "native");
    const toolsDir = path.join(target, "agent-rules-tools");

    for (const d of [rulesDir, skillsDir, scriptsDir, docsDir, nativeDir, toolsDir]) {
      await fs.mkdir(d, { recursive: true });
    }

    // Copy portable tools
    const toolNames = ["workctl.py", "workctl.ps1", "workctl.sh", "work-ledger.schema.json"];
    for (const tool of toolNames) {
      const src = path.join(root, "automation", tool);
      try {
        await fs.access(src);
        await fs.copyFile(src, path.join(toolsDir, tool));
      } catch {
        errors.push(`Missing tool: ${tool}`);
      }
    }

    // Copy model policy
    try {
      await fs.copyFile(modelPolicyPath, path.join(target, "model-policy.json"));
    } catch { errors.push("Cannot copy model-policy.json"); }

    // Copy platform native agent definitions
    const agentsSrc = path.join(root, "platforms", platform, "agents");
    const agentsDst = path.join(nativeDir, "agents");
    try {
      await fs.access(agentsSrc);
      await copyDir(agentsSrc, agentsDst);
    } catch { errors.push(`Missing agents for ${platform}`); }
    // Remove README from native agents
    const readmePath = path.join(agentsDst, "README.md");
    try { await fs.rm(readmePath); } catch { /* ok */ }

    // Grok also has personas
    if (platform === "grok") {
      const personasSrc = path.join(root, "platforms", "grok", "personas");
      const personasDst = path.join(nativeDir, "personas");
      try {
        await fs.access(personasSrc);
        await copyDir(personasSrc, personasDst);
      } catch { /* ok */ }
    }

    // Replace tokens in native agent definitions
    const platformPolicy = policy.platforms?.[platform]?.adapter_defaults?.model_selectors;
    if (platformPolicy) {
      const tokens: Record<string, string> = {};
      if (platformPolicy.standard) {
        tokens["__CODEX_STANDARD_MODEL__"] = String(platformPolicy.standard.selector ?? "");
        tokens["__CODEX_STANDARD_EFFORT__"] = String(platformPolicy.standard.effort ?? "");
      }
      if (platform === "opencode") tokens["__OPENCODE_MODEL_CLASS__"] = OPENCODE_MODEL;
      if (platformPolicy.implementation) {
        tokens["__CURSOR_IMPLEMENTATION_MODEL__"] = String(platformPolicy.implementation.selector ?? "");
      }
      if (platformPolicy.research_review) {
        tokens["__CURSOR_RESEARCH_REVIEW_MODEL__"] = String(platformPolicy.research_review.selector ?? "");
      }
      if (platformPolicy.base) {
        tokens["__GROK_BASE_MODEL__"] = String(platformPolicy.base.selector ?? "");
      }
      if (policy.platforms?.[platform]?.adapter_defaults?.minimum_effort) {
        tokens["__GROK_MINIMUM_EFFORT__"] = String(policy.platforms[platform].adapter_defaults.minimum_effort);
      }
      try {
        await replaceTokensInDir(nativeDir, tokens);
      } catch { errors.push(`Token replacement failed for ${platform}`); }
    } else if (platform === "opencode") {
      try { await replaceTokensInDir(nativeDir, { "__OPENCODE_MODEL_CLASS__": OPENCODE_MODEL }); }
      catch { errors.push("Token replacement failed for opencode"); }
    }

    // Copy shared scripts
    const sharedScripts = path.join(root, "platforms", "shared", "scripts");
    try {
      await fs.access(sharedScripts);
      const scripts = await fs.readdir(sharedScripts, { withFileTypes: true });
      for (const s of scripts) {
        if (s.isFile() && s.name.endsWith(".py")) {
          await fs.copyFile(
            path.join(sharedScripts, s.name),
            path.join(scriptsDir, s.name)
          );
        }
      }
    } catch { /* ok */ }

    // Copy context graph
    const cgPath = path.join(root, "generated", "context-graph.json");
    try {
      await fs.access(cgPath);
      await fs.copyFile(cgPath, path.join(target, "context-graph.json"));
    } catch { /* ok */ }

    // Copy route contracts
    for (const rc of ["context-route-cases.json", "context-route-cases.schema.json", "efficiency-policy.json"]) {
      const rcPath = path.join(root, "automation", rc);
      try {
        await fs.access(rcPath);
        await fs.copyFile(rcPath, path.join(target, rc));
      } catch { /* ok */ }
    }

    // Copy platform AGENTS.md with token replacement
    const platformAgents = path.join(root, "platforms", platform, "AGENTS.md");
    try {
      await fs.access(platformAgents);
      let body = await fs.readFile(platformAgents, "utf-8");
      if (platform === "codex") {
        body = body.replaceAll("@__GENERATED_CORE_IMPORTS__", generatedCoreImports);
        body = body.replaceAll("__CODEX_HOME__", escapePath(codexHome));
        body = body.replaceAll("__AGENT_RULES_ROOT__", escapePath(root));
      }
      await fs.writeFile(path.join(target, "AGENTS.md"), body, "utf-8");
    } catch { /* ok */ }

    // Copy rules (all .md except README)
    const rulesEntries = await fs.readdir(path.join(root, "rules"), { withFileTypes: true });
    for (const entry of rulesEntries) {
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
        await fs.copyFile(
          path.join(root, "rules", entry.name),
          path.join(rulesDir, entry.name)
        );
      }
    }

    // Copy manifest.yaml
    try {
      await fs.copyFile(manifestPath, path.join(rulesDir, "manifest.yaml"));
    } catch { /* ok */ }

    // Copy platform overlay
    const overlay = path.join(root, "platforms", platform, `${platform}-overlay.md`);
    try {
      await fs.access(overlay);
      await fs.copyFile(overlay, path.join(rulesDir, `${platform}-overlay.md`));
    } catch { /* ok */ }

    // Copy skills (each subdirectory with SKILL.md)
    const skillsEntries = await fs.readdir(path.join(root, "skills"), { withFileTypes: true });
    for (const entry of skillsEntries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(root, "skills", entry.name, "SKILL.md");
      try {
        await fs.access(skillFile);
        await copyDir(
          path.join(root, "skills", entry.name),
          path.join(skillsDir, entry.name)
        );
      } catch { /* ok */ }
    }

    // Copy guides/docs
    try {
      const guidesDir = path.join(root, "docs", "guides");
      const guideFiles = await fs.readdir(guidesDir, { withFileTypes: true });
      for (const g of guideFiles) {
        if (g.isFile()) {
          await fs.copyFile(path.join(guidesDir, g.name), path.join(docsDir, g.name));
        }
      }
    } catch { errors.push("Cannot copy guides"); }

    // Build manifest
    const manifestItems: { path: string; sha256: string }[] = [];
    const allFiles = await walkDir(target);

    for (const filePath of allFiles) {
      const rel = escapePath(path.relative(target, filePath));
      try {
        const hash = await sha256(filePath);
        manifestItems.push({ path: rel, sha256: hash });
      } catch { errors.push(`Cannot hash: ${rel}`); }
    }

    manifestItems.sort((a, b) => a.path.localeCompare(b.path, "en"));

    const manifest: BuildManifest = {
      version: 1,
      platform: platform,
      generatedFrom: {
        docs: "guides",
        core: "rules",
        skills: "skills",
        overlays: `platforms/${platform}`,
      },
      files: manifestItems,
    };

    await fs.writeFile(
      path.join(target, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf-8"
    );
  }

  if (errors.length > 0) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Build completed with errors: ${errors.join("; ")}`,
      data: { buildRoot, errors },
    };
  }

  console.log(`Runtime builds created: ${buildRoot}`);
  return {
    exitCode: ExitCode.Success,
    message: "Build completed",
    data: { buildRoot },
  };
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}
