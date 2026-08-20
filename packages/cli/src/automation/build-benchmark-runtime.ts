import fs from "node:fs/promises";
import path from "node:path";

interface BuildBenchmarkOptions {
  repoRoot: string;
  outputRoot?: string;
  force?: boolean;
}

export async function buildBenchmarkRuntime(options: BuildBenchmarkOptions): Promise<{ ok: boolean; message: string }> {
  const { repoRoot, force = false } = options;
  // Benchmark homes are disposable command output, not durable plan state.
  const outputRoot = options.outputRoot ?? path.join(repoRoot, ".agent/tmp/benchmarks/runtime");

  // Safety check: must be under .agent/
  const agentRoot = path.resolve(repoRoot, ".agent");
  if (!path.resolve(outputRoot).startsWith(agentRoot)) {
    return { ok: false, message: `Benchmark runtime must stay under ${agentRoot}` };
  }

  if (await dirExists(outputRoot) && !force) {
    return { ok: false, message: `Output already exists; pass force to rebuild: ${outputRoot}` };
  }

  if (await dirExists(outputRoot)) {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }

  const baseline = path.join(outputRoot, "baseline");
  const core = path.join(outputRoot, "core");
  const full = path.join(outputRoot, "full");

  await fs.mkdir(baseline, { recursive: true });
  await fs.mkdir(core, { recursive: true });
  await fs.mkdir(full, { recursive: true });

  // Parse manifest for core rules
  const manifestText = await fs.readFile(path.join(repoRoot, "rules/manifest.yaml"), "utf8");
  const manifestRules = [...manifestText.matchAll(/^\s+-\s+(\S+\.md)\s*$/gm)].map((m) => m[1]);
  if (manifestRules.length === 0) {
    return { ok: false, message: "No core rules found in rules/manifest.yaml" };
  }

  // Copy core rules
  const coreRules = path.join(core, "rules");
  await fs.mkdir(coreRules, { recursive: true });
  for (const rule of manifestRules) {
    await fs.copyFile(path.join(repoRoot, `rules/${rule}`), path.join(coreRules, rule));
  }
  await fs.copyFile(path.join(repoRoot, "rules/manifest.yaml"), path.join(coreRules, "manifest.yaml"));
  await fs.copyFile(path.join(repoRoot, "platforms/codex/codex-overlay.md"), path.join(coreRules, "codex-overlay.md"));

  // Generate AGENTS.md for core
  const coreImports = manifestRules.map((r) => `@${core.replace(/\\/g, "/")}/rules/${r}`);
  coreImports.push(`@${core.replace(/\\/g, "/")}/rules/codex-overlay.md`);
  const coreBody = coreImports.join("\n") + "\n\n# Benchmark core runtime\n\n- Isolated empirical benchmark home. Never read or mutate the canonical runtime.\n- Do not commit, push, or deploy.\n- Report PASS, PARTIAL, or BLOCKED with verification evidence.\n";
  await fs.writeFile(path.join(core, "AGENTS.md"), coreBody, "utf8");

  // Build full variant (copy from generated runtime build)
  const generatedCodex = path.join(repoRoot, "generated/runtime-build/codex");
  if (await dirExists(generatedCodex)) {
    await copyDir(generatedCodex, full);
  }

  // Safety check: no credential material
  for (const variant of [baseline, core, full]) {
    if (await fileExists(path.join(variant, "auth.json"))) {
      return { ok: false, message: `Credential material must not exist in persistent benchmark home: ${variant}` };
    }
  }

  // Write metadata
  const metadata = {
    version: 1,
    generated_at: new Date().toISOString(),
    source_root: path.resolve(repoRoot),
    variants: {
      baseline: { context: "none", path: baseline },
      core: { context: "manifest core rules plus Codex overlay", path: core },
      full: { context: "generated Codex rules, skills, scripts, and docs", path: full },
    },
    credential_material_persisted: false,
  };
  await fs.writeFile(path.join(outputRoot, "runtime.json"), JSON.stringify(metadata, null, 2), "utf8");

  return { ok: true, message: `PASS: isolated benchmark runtimes built at ${outputRoot}` };
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
