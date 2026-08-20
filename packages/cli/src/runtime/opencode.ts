import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import type { Sha256 } from "@initforge/agent-rules-engine/plan-identity";

// F1: opencode.ts has zero module-load side effects. Policy resolution is lazy,
// root-aware, and fail-closed only at use time. Importing this module anywhere
// (including a packaged node_modules layout without automation/) never throws.
const modelCache = new Map<string, Promise<string>>();

export function resolveOpenCodeModel(root: string): Promise<string> {
  const resolved = path.resolve(root);
  let pending = modelCache.get(resolved);
  if (!pending) {
    pending = loadOpenCodeModel(resolved);
    modelCache.set(resolved, pending);
  }
  return pending;
}

async function loadOpenCodeModel(root: string): Promise<string> {
  const policyPath = path.join(root, "automation", "model-policy.json");
  const modelPolicy = JSON.parse(await fs.readFile(policyPath, "utf8")) as {
    platforms?: { opencode?: { standard?: { selector?: unknown } } };
  };
  const selector = modelPolicy.platforms?.opencode?.standard?.selector;
  if (typeof selector !== "string" || selector.length === 0) {
    throw new Error(`model-policy.json platforms.opencode.standard.selector must be a non-empty string: ${policyPath}`);
  }
  // Single selector owner: automation/model-policy.json declares the opencode
  // platform as user-configured with the `__user_mapped__` sentinel. The adapter
  // renders that policy value and never hardcodes a concrete model ID anywhere.
  return selector;
}

type FileEntry = { path: string; sha256: string };
export type OpenCodeArtifact = { version: 1; platform: "opencode"; requested_model: string; resolved_model: string; observed_model: string | null; effective_identity: string; attestation_status: "UNVERIFIED"; native_capability: "UNAVAILABLE"; files: FileEntry[] };
const hash = (v: Buffer | string) => crypto.createHash("sha256").update(v).digest("hex");
async function walk(dir: string, base = dir): Promise<string[]> { const out: string[] = []; for (const e of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...await walk(p, base)); else if (e.isFile()) out.push(path.relative(base, p).replaceAll("\\", "/")); } return out.sort(); }

async function currentEffectiveIdentity(root: string): Promise<Sha256> {
  const fixtureRoot = path.join(root, "packages/engine/test/fixtures/plan-identity");
  const provenance = JSON.parse(await fs.readFile(path.join(fixtureRoot, "provenance.json"), "utf8")) as { path: string; sha256: string; bytes: number };
  const fixtureOriginal = await fs.readFile(path.join(fixtureRoot, provenance.path));
  if (fixtureOriginal.length !== provenance.bytes || hash(fixtureOriginal) !== provenance.sha256) throw new Error("canonical plan fixture integrity mismatch");
  const ledger = JSON.parse(await fs.readFile(path.join(fixtureRoot, "ledger.json"), "utf8")) as Record<string, any>;
  if (hash(fixtureOriginal) !== ledger.original_plan?.sha256) throw new Error("canonical plan fixture ledger mismatch");
  for (const amendment of ledger.amendments ?? []) {
    const bytes = await fs.readFile(path.join(fixtureRoot, amendment.path));
    if (hash(bytes) !== amendment.sha256) throw new Error(`canonical amendment fixture mismatch: ${amendment.path}`);
  }
  const identity = ledger.effective_plan_identity?.sha256;
  if (typeof identity !== "string") throw new Error("canonical plan fixture identity missing");
  return identity as Sha256;
}

async function canonicalFiles(root: string, model: string): Promise<FileEntry[]> {
  const source = path.join(root, "platforms", "opencode");
  const files: FileEntry[] = [];
  for (const name of ["agents", "opencode-overlay.md"]) {
    const sourcePath = path.join(source, name);
    if ((await fs.stat(sourcePath)).isDirectory()) for (const p of await walk(sourcePath, source)) {
      const bytes = await fs.readFile(path.join(source, p));
      files.push({ path: `native/${p}`, sha256: hash(bytes.toString("utf8").replaceAll("__OPENCODE_MODEL_CLASS__", model)) });
    }
    else files.push({ path: name, sha256: hash(await fs.readFile(sourcePath)) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export async function buildOpenCodeArtifact(root: string, buildRoot: string): Promise<OpenCodeArtifact> {
  const model = await resolveOpenCodeModel(root);
  const target = path.join(buildRoot, "opencode");
  // The generic runtime builder materializes a canonical runtime-contract.json
  // before the OpenCode-specific native artifact is sealed. Preserve that
  // evidence across the artifact rebuild without adding it to the host-owned
  // OpenCode payload. Standalone artifact builds remain backward-compatible.
  const runtimeContract = await fs.readFile(path.join(target, "runtime-contract.json")).catch(() => null);
  await fs.rm(target, { recursive: true, force: true }); await fs.mkdir(target, { recursive: true });
  await fs.mkdir(path.join(target, "native", "agents"), { recursive: true });
  await fs.cp(path.join(root, "platforms", "opencode", "agents"), path.join(target, "native", "agents"), { recursive: true });
  for (const file of await walk(path.join(target, "native", "agents"))) { const p = path.join(target, "native", "agents", file); await fs.writeFile(p, (await fs.readFile(p, "utf8")).replaceAll("__OPENCODE_MODEL_CLASS__", model)); }
  await fs.copyFile(path.join(root, "platforms", "opencode", "opencode-overlay.md"), path.join(target, "opencode-overlay.md"));
  const files: FileEntry[] = []; for (const rel of await walk(target)) files.push({ path: rel, sha256: hash(await fs.readFile(path.join(target, rel))) }); files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const identity = await currentEffectiveIdentity(root);
  const artifact: OpenCodeArtifact = { version: 1, platform: "opencode", requested_model: model, resolved_model: model, observed_model: null, effective_identity: identity, attestation_status: "UNVERIFIED", native_capability: "UNAVAILABLE", files };
  await fs.writeFile(path.join(target, "manifest.json"), JSON.stringify(artifact, null, 2) + "\n");
  if (runtimeContract) await fs.writeFile(path.join(target, "runtime-contract.json"), runtimeContract);
  return artifact;
}

// F2: refuse any symlink along a destination path component (lstat walk from the
// filesystem root, tolerant of not-yet-created components) before writing.
async function assertDestinationNotLinked(target: string): Promise<void> {
  const components: string[] = [];
  let cursor = target;
  while (true) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    components.unshift(path.basename(cursor));
    cursor = parent;
  }
  let probe = path.parse(target).root;
  for (const part of components) {
    probe = path.join(probe, part);
    try {
      const stat = await fs.lstat(probe);
      if (stat.isSymbolicLink()) throw new Error(`Refusing linked destination path: ${probe}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
}

export async function installOpenCodeArtifact(root: string, projectRoot: string) {
  const build = path.join(root, "generated", "runtime-build", "opencode"); const artifact = JSON.parse(await fs.readFile(path.join(build, "manifest.json"), "utf8")) as OpenCodeArtifact;
  await validateOpenCodeArtifact(root, build, artifact);
  const home = path.join(projectRoot, ".opencode");
  const homeExisted = await fs.lstat(home).then(() => true).catch(() => false);
  try {
    for (const entry of artifact.files) {
      const src = path.join(build, entry.path); if (hash(await fs.readFile(src)) !== entry.sha256) throw new Error(`OpenCode artifact hash mismatch: ${entry.path}`);
      const dst = path.join(home, entry.path); await assertDestinationNotLinked(dst); await fs.mkdir(path.dirname(dst), { recursive: true }); await fs.copyFile(src, dst);
    }
    const manifestPath = path.join(home, "agent-rules-manifest.json"); const ownedPath = path.join(home, "agent-rules-owned.json");
    await assertDestinationNotLinked(manifestPath); await assertDestinationNotLinked(ownedPath);
    await fs.writeFile(manifestPath, JSON.stringify(artifact, null, 2) + "\n"); await fs.writeFile(ownedPath, JSON.stringify(artifact.files.map(f => f.path).sort(), null, 2) + "\n");
    return { home, artifact };
  } catch (error) {
    // Best-effort cleanup of a freshly created, incompletely written .opencode.
    if (!homeExisted) await fs.rm(home, { recursive: true, force: true });
    throw error;
  }
}

async function validateOpenCodeArtifact(root: string, build: string, artifact: OpenCodeArtifact): Promise<void> {
  const model = await resolveOpenCodeModel(root);
  const identity = await currentEffectiveIdentity(root);
  const expectedFiles = await canonicalFiles(root, model);
  if (artifact.platform !== "opencode" || artifact.requested_model !== model || artifact.resolved_model !== model || artifact.observed_model !== null || artifact.attestation_status !== "UNVERIFIED" || artifact.native_capability !== "UNAVAILABLE" || artifact.effective_identity !== identity || JSON.stringify(artifact.files) !== JSON.stringify(expectedFiles)) throw new Error("OpenCode artifact identity invalid: model or canonical source contract mismatch");
  for (const entry of artifact.files) if (hash(await fs.readFile(path.join(build, entry.path))) !== entry.sha256) throw new Error(`OpenCode artifact hash mismatch: build/${entry.path}`);
}

export async function doctorOpenCode(root: string, projectRoot: string) {
  try {
    const build = path.join(root, "generated", "runtime-build", "opencode");
    const artifact = JSON.parse(await fs.readFile(path.join(build, "manifest.json"), "utf8")) as OpenCodeArtifact;
    await validateOpenCodeArtifact(root, build, artifact);
    for (const entry of artifact.files) if (hash(await fs.readFile(path.join(projectRoot, ".opencode", entry.path))) !== entry.sha256) throw new Error(`OpenCode installed hash mismatch: ${entry.path}`);
    return { status: "UNVERIFIED", detail: `native host capability unavailable; requested=${artifact.requested_model}; resolved=${artifact.resolved_model}; observed=${artifact.observed_model ?? "unobserved"}; identity=${artifact.effective_identity}` };
  } catch (error) { return { status: "NOT_LIVE", detail: error instanceof Error ? error.message : String(error) }; }
}
