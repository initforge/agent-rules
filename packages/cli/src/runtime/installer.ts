import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { assertDirectoryNotLinked, exists, fsyncDirectory, fsyncRegularFile, hash, readRegularFileNoFollow, removeIfExists, writeJsonDurable } from "./filesystem.js";
import { RUNTIME_PLATFORMS, type ActivationRecord, type RuntimeFile, type RuntimeInstallerOptions, type RuntimeLifecycleResult, type RuntimePlatform, type RuntimeReceipt, type SourceManifest } from "./contracts.js";
import { resolveOpenCodeModel } from "./opencode.js";
import { readCurrentPointer } from "@initforge/agent-rules-kernel/state/current-pointer.js";
import { previewRecovery as previewTransactionRecovery, recover as recoverTransaction, writeJournal as writeTransactionJournal, type TransactionJournal } from "./recovery.js";

export { fsyncDirectory, fsyncRegularFile } from "./filesystem.js";
export { RUNTIME_PLATFORMS } from "./contracts.js";
export type { RuntimeFile, RuntimeInstallerOptions, RuntimeLifecycleResult, RuntimePlatform, RuntimeReceipt } from "./contracts.js";

const execFileAsync = promisify(execFile);

async function repositoryRoot(candidate: string): Promise<string> {
  let current = path.resolve(candidate);
  while (true) {
    if (await exists(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(candidate);
    current = parent;
  }
}

const RUNTIME_DIRECTORY = "agent-rules-runtime";
const RECEIPT_FILE = "agent-rules-runtime-receipt.json";
const JOURNAL_FILE = ".agent-rules-runtime.transaction.json";
const ROLLBACK_DIRECTORY = ".agent-rules-runtime.rollback";
const LEGACY_MANIFEST_FILE = "agent-rules-manifest.json";
const LEGACY_MIGRATION_JOURNAL_FILE = ".agent-rules-legacy-migration.json";
const LEGACY_MIGRATION_RECEIPT_FILE = "agent-rules-legacy-migration-receipt.json";
const LEGACY_ARCHIVE_PREFIX = ".agent-rules-legacy-archive-";

interface LegacyOwnedFile {
  path: string;
  sha256: string;
}

interface LegacyMigrationJournal {
  schema: "agent-rules/legacy-migration-journal";
  version: 1;
  operation: "migrate" | "rollback";
  phase: "moving" | "archived" | "restoring";
  platform: RuntimePlatform;
  archive: string;
  legacyManifestSha256: string;
  movedCount: number;
  files: LegacyOwnedFile[];
}

interface LegacyMigrationReceipt {
  schema: "agent-rules/legacy-migration-receipt";
  version: 1;
  platform: RuntimePlatform;
  archive: string;
  legacyManifestSha256: string;
  migratedAt: string;
  files: LegacyOwnedFile[];
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.startsWith("/")) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== ".." && !path.isAbsolute(part));
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertSafeSourceFile(sourceRoot: string, relativePath: string): Promise<string> {
  const candidate = path.resolve(sourceRoot, ...relativePath.split("/"));
  if (!inside(sourceRoot, candidate)) throw new Error(`Source path escapes build root: ${relativePath}`);

  let cursor = sourceRoot;
  for (const part of relativePath.split("/")) {
    cursor = path.join(cursor, part);
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlinked source path: ${relativePath}`);
  }
  const stat = await fs.lstat(candidate);
  if (!stat.isFile()) throw new Error(`Manifest entry is not a regular file: ${relativePath}`);
  return candidate;
}

function defaultPlatformRoots(): Record<RuntimePlatform, string> {
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
  };
}

async function gitProvenance(repositoryRoot: string): Promise<{ gitHead: string; gitTree: string }> {
  try {
    const [{ stdout: head }, { stdout: tree }] = await Promise.all([
      execFileAsync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"]),
      execFileAsync("git", ["-C", repositoryRoot, "rev-parse", "HEAD^{tree}"]),
    ]);
    const gitHead = head.trim();
    const gitTree = tree.trim();
    if (!/^[a-f0-9]{40,64}$/i.test(gitHead) || !/^[a-f0-9]{40,64}$/i.test(gitTree)) {
      throw new Error("git returned an invalid revision");
    }
    return { gitHead, gitTree };
  } catch (error) {
    throw new Error(`Runtime installation requires a Git-bound source repository: ${(error as Error).message}`);
  }
}

async function readEffectivePlanBinding(repositoryRoot: string): Promise<{
  effectivePlanSha256: string;
  effectivePlanLedger: string;
  effectivePlanLedgerSha256: string;
}> {
  const ledgerRoot = path.join(repositoryRoot, ".agent", "ledger");
  await assertDirectoryNotLinked(repositoryRoot);
  await assertDirectoryNotLinked(path.join(repositoryRoot, ".agent"));
  let ledgerNames: string[];
  try {
    await assertDirectoryNotLinked(ledgerRoot);
    ledgerNames = (await fs.readdir(ledgerRoot)).filter((name) => name.endsWith(".json")).sort();
  } catch (error: unknown) {
    if ((error as Error).message.startsWith("Refusing linked")) throw error;
    throw new Error("Runtime installation requires exactly one canonical .agent/ledger/*.json effective-plan identity");
  }
  const pointer = readCurrentPointer(repositoryRoot);
  const pointerLedger = pointer?.canonical_ledger?.path;
  const ledgerName = pointerLedger && pointerLedger.startsWith(".agent/ledger/")
    ? path.basename(pointerLedger)
    : ledgerNames.length === 1 ? ledgerNames[0] : null;
  if (!ledgerName || !ledgerNames.includes(ledgerName)) {
    throw new Error("Runtime installation requires the current pointer to bind exactly one canonical .agent/ledger/*.json effective-plan identity");
  }
  const ledgerPath = path.join(ledgerRoot, ledgerName);
  if (pointer?.canonical_ledger?.sha256 && hash(await readRegularFileNoFollow(ledgerPath)) !== pointer.canonical_ledger.sha256) {
    throw new Error(`Current pointer ledger hash mismatch: ${pointerLedger}`);
  }
  const body = await readRegularFileNoFollow(ledgerPath);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid effective-plan ledger JSON: ${ledgerPath}`);
  }
  const identity = parsed.effective_plan_identity as Record<string, unknown> | undefined;
  const effectivePlanSha256 = typeof identity?.sha256 === "string" ? identity.sha256.toLowerCase() : "";
  const canonical = typeof identity?.canonical_json_utf8 === "string" ? identity.canonical_json_utf8 : "";
  if (!/^[a-f0-9]{64}$/.test(effectivePlanSha256) || canonical.length === 0 || hash(canonical) !== effectivePlanSha256) {
    throw new Error(`Unverified effective_plan_identity in ${ledgerPath}`);
  }
  return {
    effectivePlanSha256,
    effectivePlanLedger: path.relative(repositoryRoot, ledgerPath).replace(/\\/g, "/"),
    effectivePlanLedgerSha256: hash(body),
  };
}

async function readSourceManifest(repositoryRoot: string, platform: RuntimePlatform): Promise<{ manifest: SourceManifest; sourceRoot: string; manifestSha256: string }> {
  const candidates = [
    path.resolve(repositoryRoot, "generated", "runtime-build", platform),
    path.resolve(repositoryRoot, "..", "generated", "runtime-build", platform),
    path.resolve(repositoryRoot, "..", "..", "generated", "runtime-build", platform),
  ];
  const sourceRoot = (await Promise.all(candidates.map(async (candidate) => (await exists(candidate)) ? candidate : null))).find(Boolean) ?? candidates[0];
  await assertDirectoryNotLinked(sourceRoot);
  const manifestPath = path.join(sourceRoot, "manifest.json");
  const body = await readRegularFileNoFollow(manifestPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error(`Invalid built runtime manifest: ${manifestPath}`);
  }
  const value = parsed as Partial<SourceManifest>;
  if (value.version !== 1 || value.platform !== platform || !Array.isArray(value.files)) {
    throw new Error(`Invalid built runtime manifest contract: ${manifestPath}`);
  }
  const files: RuntimeFile[] = [];
  const seen = new Set<string>();
  for (const file of value.files) {
    if (!isSafeRelativePath(file?.path) || typeof file?.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(file.sha256)) {
      throw new Error(`Unsafe manifest entry in ${manifestPath}`);
    }
    if (seen.has(file.path)) throw new Error(`Duplicate manifest entry: ${file.path}`);
    seen.add(file.path);
    files.push({ path: file.path, sha256: file.sha256.toLowerCase() });
  }
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path, "en"));
  if (JSON.stringify(files) !== JSON.stringify(sorted)) throw new Error(`Runtime manifest is not deterministically ordered: ${manifestPath}`);
  for (const file of files) {
    const sourcePath = await assertSafeSourceFile(sourceRoot, file.path);
    if (hash(await fs.readFile(sourcePath)) !== file.sha256) throw new Error(`Source hash mismatch for ${file.path}`);
  }
  const ignoredEvidenceFiles = platform === "opencode" ? new Set(["manifest.json", "runtime-contract.json"]) : new Set(["manifest.json"]);
  const observed = (await listRuntimeFiles(sourceRoot)).filter((file) => !ignoredEvidenceFiles.has(file)).sort();
  const listed = files.map((file) => file.path).sort();
  if (JSON.stringify(observed) !== JSON.stringify(listed)) throw new Error(`Built runtime manifest missing or extra files: ${manifestPath}`);
  if (platform === "opencode") {
    const openCodeModel = await resolveOpenCodeModel(repositoryRoot);
    const sourceAgents = (await Promise.all([
      path.resolve(repositoryRoot, "platforms", "opencode", "agents"),
      path.resolve(repositoryRoot, "..", "platforms", "opencode", "agents"),
      path.resolve(repositoryRoot, "..", "..", "platforms", "opencode", "agents"),
    ].map(async (candidate) => (await exists(candidate)) ? candidate : null))).find(Boolean) ?? path.resolve(repositoryRoot, "platforms", "opencode", "agents");
    const sourceFiles = await listRuntimeFiles(sourceAgents);
    const expectedAgents = sourceFiles.filter((file) => file !== "README.md").sort();
    const builtAgents = files.map((file) => file.path.replace(/^native\/agents\//, "")).filter((file) => expectedAgents.includes(file)).sort();
    if (JSON.stringify(expectedAgents) !== JSON.stringify(builtAgents)) throw new Error("OpenCode source/build agent set mismatch");
    for (const relative of expectedAgents) {
      const sourcePath = await assertSafeSourceFile(sourceAgents, relative);
      const builtPath = await assertSafeSourceFile(sourceRoot, `native/agents/${relative}`);
      const rawSource = await fs.readFile(sourcePath, "utf8");
      if (!rawSource.includes("model: __OPENCODE_MODEL_CLASS__")) throw new Error(`OpenCode source identity mismatch: ${relative}`);
      const source = rawSource.replaceAll("__OPENCODE_MODEL_CLASS__", openCodeModel);
      const built = await fs.readFile(builtPath, "utf8");
      if (!built.includes(`model: ${openCodeModel}`)) throw new Error(`OpenCode artifact identity mismatch: ${relative}`);
      if (source !== built) throw new Error(`OpenCode source/build tamper: ${relative}`);
    }
  }
  return { manifest: { version: 1, platform, files }, sourceRoot, manifestSha256: hash(body) };
}

interface ActivationSpec extends ActivationRecord {
  destination: string;
  content?: string;
}

function activationPayload(platform: RuntimePlatform, runtimePath: string, manifest: SourceManifest): RuntimeFile | undefined {
  if (platform !== "codex" && platform !== "antigravity") return undefined;
  const rules = manifest.files
    .map((file) => file.path)
    .filter((filePath) => /^rules\/[^/]+\.md$/.test(filePath))
    .sort((left, right) => left.localeCompare(right, "en"));
  if (rules.length === 0) throw new Error(`Built runtime for ${platform} has no discoverable rule files`);
  const name = platform === "codex" ? "AGENTS.md" : "GEMINI.md";
  const content = [
    "# Managed agent-rules runtime imports",
    ...rules.map((filePath) => `@${path.join(runtimePath, ...filePath.split("/")).replace(/\\/g, "/")}`),
    "",
  ].join("\n");
  return { path: `.activation/${name}`, sha256: hash(content) };
}

function activationPayloadContent(platform: RuntimePlatform, runtimePath: string, manifest: SourceManifest): string | undefined {
  const payload = activationPayload(platform, runtimePath, manifest);
  if (!payload) return undefined;
  const rules = manifest.files
    .map((file) => file.path)
    .filter((filePath) => /^rules\/[^/]+\.md$/.test(filePath))
    .sort((left, right) => left.localeCompare(right, "en"));
  return [
    "# Managed agent-rules runtime imports",
    ...rules.map((filePath) => `@${path.join(runtimePath, ...filePath.split("/")).replace(/\\/g, "/")}`),
    "",
  ].join("\n");
}

function activationSpec(platform: RuntimePlatform, root: string, runtimePath: string): ActivationSpec {
  if (platform === "codex") {
    const content = `# Managed by agent-rules\n@${path.join(runtimePath, ".activation", "AGENTS.md").replace(/\\/g, "/")}\n`;
    return { id: "global-instructions", kind: "managed-file", destination: path.join(root, "AGENTS.md"), content, sha256: hash(content) };
  }
  if (platform === "antigravity") {
    const content = `# Managed by agent-rules\n@${path.join(runtimePath, ".activation", "GEMINI.md").replace(/\\/g, "/")}\n`;
    return { id: "global-instructions", kind: "managed-file", destination: path.join(path.dirname(root), "GEMINI.md"), content, sha256: hash(content) };
  }
  if (platform === "opencode") {
    const content = `# Managed by agent-rules\n@${path.join(runtimePath, "AGENTS.md").replace(/\\/g, "/")}\n`;
    return { id: "global-instructions", kind: "managed-file", destination: path.join(root, "AGENTS.md"), content, sha256: hash(content) };
  }
  const destination = platform === "grok" ? path.join(root, ".grok", "rules") : path.join(root, "rules");
  return { id: "global-rules", kind: "managed-directory-link", destination, linkTarget: path.join(runtimePath, "rules") };
}

async function assertActivationOwned(spec: ActivationSpec, receipt: RuntimeReceipt): Promise<void> {
  const recorded = receipt.activation;
  if (recorded.id !== spec.id || recorded.kind !== spec.kind || recorded.sha256 !== spec.sha256 || recorded.linkTarget !== spec.linkTarget) {
    throw new Error(`Runtime activation receipt does not match ${spec.destination}`);
  }
  const stat = await fs.lstat(spec.destination);
  if (spec.kind === "managed-file") {
    if (!stat.isFile() || stat.isSymbolicLink() || hash(await fs.readFile(spec.destination)) !== spec.sha256) {
      throw new Error(`Owned runtime activation drift: ${spec.destination}`);
    }
  } else {
    if (!stat.isSymbolicLink()) throw new Error(`Owned runtime activation is not a managed link: ${spec.destination}`);
    const [actual, expected] = await Promise.all([fs.realpath(spec.destination), fs.realpath(spec.linkTarget!)]);
    if (path.resolve(actual) !== path.resolve(expected)) throw new Error(`Owned runtime activation target drift: ${spec.destination}`);
  }
}

async function createActivation(spec: ActivationSpec): Promise<void> {
  if (await exists(spec.destination)) throw new Error(`Refusing to overwrite unowned host activation: ${spec.destination}`);
  const parent = path.dirname(spec.destination);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  await assertDirectoryNotLinked(parent);
  const temporary = path.join(parent, `.agent-rules-activation-${randomUUID()}`);
  try {
    if (spec.kind === "managed-file") {
      await fs.writeFile(temporary, spec.content!, { mode: 0o600 });
      await fsyncRegularFile(temporary);
    } else {
      await fs.symlink(spec.linkTarget!, temporary, process.platform === "win32" ? "junction" : "dir");
    }
    await fs.rename(temporary, spec.destination);
    await fsyncDirectory(parent);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function removeActivation(spec: ActivationSpec, receipt: RuntimeReceipt): Promise<void> {
  await assertActivationOwned(spec, receipt);
  await fs.unlink(spec.destination);
  await fsyncDirectory(path.dirname(spec.destination));
}

async function readReceipt(runtimePath: string): Promise<RuntimeReceipt | undefined> {
  const receiptPath = path.join(runtimePath, RECEIPT_FILE);
  if (!(await exists(receiptPath))) return undefined;
  try {
    const receipt = JSON.parse((await readRegularFileNoFollow(receiptPath)).toString("utf8")) as RuntimeReceipt;
    const source = receipt.source;
    const repository = source?.repositoryContext;
    const activation = receipt.activation;
    const activationValid = activation?.kind === "managed-file"
      ? activation.id === "global-instructions" && /^[a-f0-9]{64}$/.test(activation.sha256 ?? "") && activation.linkTarget === undefined
      : activation?.kind === "managed-directory-link" &&
        activation.id === "global-rules" && activation.sha256 === undefined &&
        typeof activation.linkTarget === "string" && path.isAbsolute(activation.linkTarget);
    if (receipt.schema !== "agent-rules/runtime-receipt" || receipt.version !== 1 || !RUNTIME_PLATFORMS.includes(receipt.platform) || !Array.isArray(receipt.files) ||
        typeof receipt.installedAt !== "string" || !Number.isFinite(Date.parse(receipt.installedAt)) ||
        !source || !/^[a-f0-9]{64}$/.test(source.manifestSha256) ||
        !/^[a-f0-9]{64}$/.test(source.artifactSha256) ||
        !/^[a-f0-9]{64}$/.test(source.effectivePlanSha256) ||
        !/^[a-f0-9]{64}$/.test(source.effectivePlanLedgerSha256) ||
        !isSafeRelativePath(source.effectivePlanLedger) || !source.effectivePlanLedger.startsWith(".agent/ledger/") ||
        !repository || !/^[a-f0-9]{40,64}$/i.test(repository.gitHead) ||
        !/^[a-f0-9]{40,64}$/i.test(repository.gitTree) ||
        repository.relation !== "context-only-not-artifact-attestation" || !activationValid) return undefined;
    const seen = new Set<string>();
    for (const file of receipt.files) {
      if (!isSafeRelativePath(file.path) || !/^[a-f0-9]{64}$/i.test(file.sha256) || seen.has(file.path)) return undefined;
      seen.add(file.path);
    }
    const sorted = [...receipt.files].sort((left, right) => left.path.localeCompare(right.path, "en"));
    if (JSON.stringify(sorted) !== JSON.stringify(receipt.files)) return undefined;
    return receipt;
  } catch {
    return undefined;
  }
}

async function assertOwnedRuntime(runtimePath: string, platform?: RuntimePlatform, verifyActivation = true): Promise<RuntimeReceipt> {
  await assertDirectoryNotLinked(runtimePath);
  const receipt = await readReceipt(runtimePath);
  if (!receipt || (platform && receipt.platform !== platform)) throw new Error(`Refusing to modify unowned runtime directory: ${runtimePath}`);
  for (const file of receipt.files) {
    const candidate = path.resolve(runtimePath, ...file.path.split("/"));
    if (!inside(runtimePath, candidate)) throw new Error(`Unsafe owned receipt path: ${file.path}`);
    const stat = await fs.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Owned runtime file is missing or linked: ${file.path}`);
    if (hash(await fs.readFile(candidate)) !== file.sha256) throw new Error(`Owned runtime hash drift: ${file.path}`);
  }
  const expected = new Set([...receipt.files.map((file) => file.path), RECEIPT_FILE]);
  const observed = await listRuntimeFiles(runtimePath);
  for (const relativePath of observed) {
    if (!expected.has(relativePath)) throw new Error(`Refusing to modify runtime containing an unowned file: ${relativePath}`);
  }
  if (verifyActivation) {
    const root = path.dirname(runtimePath);
    const logicalRuntimePath = path.join(root, RUNTIME_DIRECTORY);
    await assertActivationOwned(activationSpec(receipt.platform, root, logicalRuntimePath), receipt);
  }
  return receipt;
}

async function listRuntimeFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    const stat = await fs.lstat(fullPath);
    if (stat.isSymbolicLink()) throw new Error(`Refusing linked runtime path: ${relativePath}`);
    if (stat.isDirectory()) files.push(...(await listRuntimeFiles(fullPath, relativePath)));
    else if (stat.isFile()) files.push(relativePath);
    else throw new Error(`Refusing non-regular runtime path: ${relativePath}`);
  }
  return files;
}

async function assertSafeDestinationParents(root: string, relativePath: string): Promise<string> {
  if (!isSafeRelativePath(relativePath)) throw new Error(`Unsafe legacy path: ${relativePath}`);
  const candidate = path.resolve(root, ...relativePath.split("/"));
  if (!inside(root, candidate) || candidate === root) throw new Error(`Legacy path escapes platform root: ${relativePath}`);
  let cursor = root;
  const parts = relativePath.split("/");
  for (const part of parts.slice(0, -1)) {
    cursor = path.join(cursor, part);
    if (await exists(cursor)) {
      const stat = await fs.lstat(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing linked legacy path component: ${relativePath}`);
    }
  }
  return candidate;
}

async function readLegacyManifest(root: string, platform: RuntimePlatform): Promise<{
  files: LegacyOwnedFile[];
  legacyManifestSha256: string;
}> {
  if (platform !== "codex") throw new Error("Legacy migration is currently supported only for the codex runtime");
  const manifestPath = path.join(root, LEGACY_MANIFEST_FILE);
  const body = await readRegularFileNoFollow(manifestPath);
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid legacy runtime manifest: ${manifestPath}`);
  }
  if (value.version !== 1 || value.platform !== platform || !Array.isArray(value.files)) {
    throw new Error(`Legacy manifest platform/contract mismatch: ${manifestPath}`);
  }
  const seen = new Set<string>();
  const files: LegacyOwnedFile[] = [];
  for (const raw of value.files as Array<Record<string, unknown>>) {
    const relativePath = raw.path ?? raw.Path;
    const sha = raw.sha256 ?? raw.Sha256;
    if (!isSafeRelativePath(relativePath) || typeof sha !== "string" || !/^[a-f0-9]{64}$/i.test(sha) || seen.has(relativePath)) {
      throw new Error(`Unsafe or duplicate legacy manifest entry in ${manifestPath}`);
    }
    if (relativePath === LEGACY_MANIFEST_FILE) {
      throw new Error(`Legacy manifest cannot claim itself: ${manifestPath}`);
    }
    seen.add(relativePath);
    const sourcePath = await assertSafeSourceFile(root, relativePath);
    const normalizedHash = sha.toLowerCase();
    if (hash(await readRegularFileNoFollow(sourcePath)) !== normalizedHash) {
      throw new Error(`Legacy runtime drift for ${relativePath}`);
    }
    files.push({ path: relativePath, sha256: normalizedHash });
  }
  if (!seen.has("AGENTS.md")) throw new Error("Legacy codex manifest does not own the required AGENTS.md activation");
  files.push({ path: LEGACY_MANIFEST_FILE, sha256: hash(body) });
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path, "en")),
    legacyManifestSha256: hash(body),
  };
}

function validateLegacyFileList(files: unknown, legacyManifestSha256: string): files is LegacyOwnedFile[] {
  if (!Array.isArray(files) || files.length < 2) return false;
  const seen = new Set<string>();
  let previous = "";
  let hasActivation = false;
  let hasManifest = false;
  for (const value of files) {
    const file = value as Partial<LegacyOwnedFile>;
    if (!isSafeRelativePath(file.path) || typeof file.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(file.sha256) || seen.has(file.path) ||
        (previous && previous.localeCompare(file.path, "en") >= 0)) return false;
    seen.add(file.path);
    previous = file.path;
    if (file.path === "AGENTS.md") hasActivation = true;
    if (file.path === LEGACY_MANIFEST_FILE) {
      hasManifest = file.sha256 === legacyManifestSha256;
    }
  }
  return hasActivation && hasManifest;
}

function validateLegacyArchivePath(root: string, archive: unknown): archive is string {
  if (typeof archive !== "string") return false;
  const name = path.basename(archive);
  const suffix = name.slice(LEGACY_ARCHIVE_PREFIX.length);
  return path.dirname(archive) === root && archive === path.join(root, name) &&
    name.startsWith(LEGACY_ARCHIVE_PREFIX) &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(suffix);
}

async function validateLegacyArchive(archive: string, files: LegacyOwnedFile[]): Promise<void> {
  await assertDirectoryNotLinked(archive);
  const expected = new Set(files.map((file) => file.path));
  const observed = await listRuntimeFiles(archive);
  if (observed.length !== expected.size || observed.some((filePath) => !expected.has(filePath))) {
    throw new Error(`Legacy migration archive contains unowned or missing files: ${archive}`);
  }
  for (const file of files) {
    const archivedPath = await assertSafeSourceFile(archive, file.path);
    if (hash(await readRegularFileNoFollow(archivedPath)) !== file.sha256) throw new Error(`Legacy archive drift for ${file.path}`);
  }
}

async function restoreLegacyFiles(root: string, archive: string, files: LegacyOwnedFile[]): Promise<void> {
  for (const file of files) {
    const archivedPath = path.join(archive, ...file.path.split("/"));
    const destination = await assertSafeDestinationParents(root, file.path);
    const archivedExists = await exists(archivedPath);
    const destinationExists = await exists(destination);
    if (archivedExists && destinationExists) throw new Error(`Refusing to overwrite runtime file while restoring legacy path: ${file.path}`);
    if (archivedExists) {
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await fs.rename(archivedPath, destination);
      await fsyncDirectory(path.dirname(destination));
    } else if (destinationExists) {
      const stat = await fs.lstat(destination);
      if (!stat.isFile() || stat.isSymbolicLink() || hash(await readRegularFileNoFollow(destination)) !== file.sha256) {
        throw new Error(`Legacy restoration drift for ${file.path}`);
      }
    } else {
      throw new Error(`Legacy restoration lost owned file: ${file.path}`);
    }
  }
  if (await exists(archive)) {
    const remaining = await listRuntimeFiles(archive);
    if (remaining.length > 0) throw new Error(`Refusing to delete unowned files from legacy archive: ${remaining.join(", ")}`);
    await removeIfExists(archive);
  }
}

async function readLegacyMigrationReceipt(root: string, platform: RuntimePlatform): Promise<LegacyMigrationReceipt | undefined> {
  const receiptPath = path.join(root, LEGACY_MIGRATION_RECEIPT_FILE);
  if (!(await exists(receiptPath))) return undefined;
  try {
    const receipt = JSON.parse((await readRegularFileNoFollow(receiptPath)).toString("utf8")) as LegacyMigrationReceipt;
    if (receipt.schema !== "agent-rules/legacy-migration-receipt" || receipt.version !== 1 ||
        receipt.platform !== platform || !validateLegacyArchivePath(root, receipt.archive) ||
        !/^[a-f0-9]{64}$/.test(receipt.legacyManifestSha256) ||
        !validateLegacyFileList(receipt.files, receipt.legacyManifestSha256) ||
        !Number.isFinite(Date.parse(receipt.migratedAt))) return undefined;
    return receipt;
  } catch {
    return undefined;
  }
}

async function recoverLegacyMigration(root: string, platform: RuntimePlatform): Promise<void> {
  const journalPath = path.join(root, LEGACY_MIGRATION_JOURNAL_FILE);
  if (!(await exists(journalPath))) return;
  const journal = JSON.parse((await readRegularFileNoFollow(journalPath)).toString("utf8")) as LegacyMigrationJournal;
  if (journal.schema !== "agent-rules/legacy-migration-journal" || journal.version !== 1 ||
      !["migrate", "rollback"].includes(journal.operation) || !["moving", "archived", "restoring"].includes(journal.phase) ||
      journal.platform !== platform || !validateLegacyArchivePath(root, journal.archive) ||
      !/^[a-f0-9]{64}$/.test(journal.legacyManifestSha256) ||
      !validateLegacyFileList(journal.files, journal.legacyManifestSha256) ||
      !Number.isInteger(journal.movedCount) || journal.movedCount < 0 || journal.movedCount > journal.files.length) {
    throw new Error(`Refusing unsafe legacy migration journal: ${journalPath}`);
  }
  const target = path.join(root, RUNTIME_DIRECTORY);
  if (journal.operation === "rollback") {
    if (await exists(target)) {
      const runtimeReceipt = await assertOwnedRuntime(target, platform);
      await validateLegacyArchive(journal.archive, journal.files);
      await removeActivation(activationSpec(platform, root, target), runtimeReceipt);
      await removeIfExists(target);
      await fsyncDirectory(root);
    }
    await restoreLegacyFiles(root, journal.archive, journal.files);
    await fs.unlink(path.join(root, LEGACY_MIGRATION_RECEIPT_FILE)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  } else if (await exists(target)) {
    await assertOwnedRuntime(target, platform);
    await validateLegacyArchive(journal.archive, journal.files);
    const receipt: LegacyMigrationReceipt = {
      schema: "agent-rules/legacy-migration-receipt",
      version: 1,
      platform,
      archive: journal.archive,
      legacyManifestSha256: journal.legacyManifestSha256,
      migratedAt: new Date().toISOString(),
      files: journal.files,
    };
    await writeJsonDurable(path.join(root, LEGACY_MIGRATION_RECEIPT_FILE), receipt);
  } else {
    await restoreLegacyFiles(root, journal.archive, journal.files);
  }
  await fs.unlink(journalPath);
  await fsyncDirectory(root);
}

async function validateJournal(root: string, expectedPlatform: RuntimePlatform, journalPath: string, journal: TransactionJournal): Promise<void> {
  const journalStat = await fs.lstat(journalPath);
  const target = path.join(root, RUNTIME_DIRECTORY);
  const rollback = path.join(root, ROLLBACK_DIRECTORY);
  const operations = ["install", "update", "rollback"] as const;
  const phases = ["prepared", "backed-up", "committed"] as const;
  const prefix = journal.operation === "rollback" ? `.${RUNTIME_DIRECTORY}.rollback-` : `.${RUNTIME_DIRECTORY}.stage-`;
  const stagingName = typeof journal.staging === "string" ? path.basename(journal.staging) : "";
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const stagingExact = typeof journal.staging === "string" &&
    path.dirname(journal.staging) === root &&
    journal.staging === path.join(root, stagingName) &&
    stagingName.startsWith(prefix) &&
    uuid.test(stagingName.slice(prefix.length));
  if (!journalStat.isFile() || journalStat.isSymbolicLink() ||
      journal.schema !== "agent-rules/runtime-transaction" || journal.version !== 1 ||
      !operations.includes(journal.operation) || !phases.includes(journal.phase) ||
      !RUNTIME_PLATFORMS.includes(journal.platform) || journal.platform !== expectedPlatform ||
      journal.target !== target || journal.backup !== rollback || !stagingExact ||
      journal.staging === root || journal.staging === target || journal.staging === rollback ||
      (journal.operation !== "rollback" &&
        (!/^[a-f0-9]{64}$/.test(journal.expectedPlanSha256 ?? "") ||
         !/^[a-f0-9]{64}$/.test(journal.expectedArtifactSha256 ?? "")))) {
    throw new Error(`Refusing recovery from unsafe transaction journal: ${journalPath}`);
  }
  for (const candidate of [target, rollback, journal.staging]) {
    if (await exists(candidate)) {
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) throw new Error(`Refusing linked recovery path: ${candidate}`);
    }
  }
  if (await exists(journal.staging)) {
    const staged = await assertOwnedRuntime(journal.staging, expectedPlatform, false);
    if (journal.operation === "rollback" && journal.phase === "prepared" && await exists(target)) {
      throw new Error(`Refusing ambiguous prepared rollback staging path: ${journal.staging}`);
    }
    if (journal.operation !== "rollback" &&
        (staged.source.effectivePlanSha256 !== journal.expectedPlanSha256 ||
         staged.source.artifactSha256 !== journal.expectedArtifactSha256)) {
      throw new Error(`Staged runtime does not match transaction identity: ${journal.staging}`);
    }
  }
  if (await exists(rollback)) await assertOwnedRuntime(rollback, expectedPlatform, false);
  if (await exists(target)) {
    const activationMayBeMissing = journal.operation === "install" && journal.phase === "backed-up" && !(await exists(rollback));
    await assertOwnedRuntime(target, expectedPlatform, !activationMayBeMissing);
  }
}

const recoveryOperations = {
  runtimeDirectory: RUNTIME_DIRECTORY,
  journalFile: JOURNAL_FILE,
  rollbackDirectory: ROLLBACK_DIRECTORY,
  validateJournal,
  assertOwnedRuntime,
  readReceipt,
  activationSpec,
  assertActivationOwned,
  createActivation,
};
const writeJournal = (root: string, journal: TransactionJournal) => writeTransactionJournal(root, journal, recoveryOperations);
const recover = (root: string, platform: RuntimePlatform) => recoverTransaction(root, platform, recoveryOperations);
const previewRecovery = (root: string, platform: RuntimePlatform) => previewTransactionRecovery(root, platform, recoveryOperations);

export class RuntimeInstaller {
  private readonly platformRoots: Record<RuntimePlatform, string>;

  constructor(private readonly options: RuntimeInstallerOptions) {
    this.platformRoots = { ...defaultPlatformRoots(), ...options.platformRoots };
  }

  private rootFor(platform: RuntimePlatform): string {
    const root = this.platformRoots[platform];
    if (!root || !path.isAbsolute(root)) throw new Error(`Runtime target override for ${platform} must be an absolute path`);
    return path.resolve(root);
  }

  async install(platform: RuntimePlatform, mode: "install" | "update" = "install", skipLegacyRecovery = false): Promise<RuntimeLifecycleResult> {
    const root = this.rootFor(platform);
    const runtimePath = path.join(root, RUNTIME_DIRECTORY);
    const repo = await repositoryRoot(this.options.repositoryRoot);
    const { manifest, sourceRoot, manifestSha256 } = await readSourceManifest(repo, platform);
    const provenance = await gitProvenance(repo);
    const effectivePlan = await readEffectivePlanBinding(repo);
    const payload = activationPayload(platform, runtimePath, manifest);
    const payloadContent = activationPayloadContent(platform, runtimePath, manifest);
    const installedFiles = [...manifest.files, ...(payload ? [payload] : [])]
      .sort((left, right) => left.path.localeCompare(right.path, "en"));
    const spec = activationSpec(platform, root, runtimePath);
    const receipt: RuntimeReceipt = {
      schema: "agent-rules/runtime-receipt",
      version: 1,
      platform,
      installedAt: new Date().toISOString(),
      source: {
        manifestSha256,
        artifactSha256: hash(JSON.stringify({ platform, files: manifest.files })),
        ...effectivePlan,
        repositoryContext: { ...provenance, relation: "context-only-not-artifact-attestation" },
      },
      activation: { id: spec.id, kind: spec.kind, sha256: spec.sha256, linkTarget: spec.linkTarget },
      files: installedFiles,
    };
    if (this.options.dryRun) return { platform, targetRoot: root, runtimePath, dryRun: true, receipt };

    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await assertDirectoryNotLinked(root);
    await recover(root, platform);
    if (!skipLegacyRecovery) await recoverLegacyMigration(root, platform);
    const runtimeExists = await exists(runtimePath);
    if (mode === "install" && runtimeExists) throw new Error(`Runtime already exists; use update or rollback: ${runtimePath}`);
    if (mode === "update" && !runtimeExists) throw new Error(`No owned runtime to update: ${runtimePath}`);
    if (runtimeExists) await assertOwnedRuntime(runtimePath, platform);
    if (!runtimeExists && await exists(spec.destination)) throw new Error(`Refusing to overwrite unowned host activation: ${spec.destination}`);

    const staging = path.join(root, `.${RUNTIME_DIRECTORY}.stage-${randomUUID()}`);
    const backup = path.join(root, ROLLBACK_DIRECTORY);
    const journal: TransactionJournal = {
      schema: "agent-rules/runtime-transaction", version: 1, operation: mode, phase: "prepared", platform,
      target: runtimePath, staging, backup,
      expectedPlanSha256: receipt.source.effectivePlanSha256,
      expectedArtifactSha256: receipt.source.artifactSha256,
    };
    let journalWritten = false;
    try {
      await fs.mkdir(staging, { mode: 0o700 });
      for (const file of manifest.files) {
        const sourcePath = await assertSafeSourceFile(sourceRoot, file.path);
        const targetPath = path.resolve(staging, ...file.path.split("/"));
        if (!inside(staging, targetPath)) throw new Error(`Stage path escapes target: ${file.path}`);
        await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
        await fs.copyFile(sourcePath, targetPath);
        if (hash(await fs.readFile(targetPath)) !== file.sha256) throw new Error(`Staged hash mismatch for ${file.path}`);
        await fsyncRegularFile(targetPath);
      }
      if (payload && payloadContent) {
        const payloadPath = path.join(staging, ...payload.path.split("/"));
        await fs.mkdir(path.dirname(payloadPath), { recursive: true, mode: 0o700 });
        await fs.writeFile(payloadPath, payloadContent, { mode: 0o600 });
        if (hash(await fs.readFile(payloadPath)) !== payload.sha256) throw new Error(`Generated activation payload hash mismatch for ${payload.path}`);
        await fsyncRegularFile(payloadPath);
      }
      await writeJsonDurable(path.join(staging, RECEIPT_FILE), receipt);
      await fsyncDirectory(staging);
      if (this.options.failpoint === "after-stage") throw new Error("Injected failure after staging");

      await writeJournal(root, journal);
      journalWritten = true;
      if (this.options.failpoint === "after-journal") throw new Error("Injected failure after journal creation");
      if (runtimeExists) {
        if (await exists(backup)) {
          await assertOwnedRuntime(backup, platform);
          await removeIfExists(backup);
        }
        await fs.rename(runtimePath, backup);
      }
      journal.phase = "backed-up";
      await writeJournal(root, journal);
      if (this.options.failpoint === "crash-after-backup") throw new SimulatedCrashError();
      if (this.options.failpoint === "after-backup") throw new Error("Injected failure after backup");

      await fs.rename(staging, runtimePath);
      await fsyncDirectory(root);
      if (this.options.failpoint === "crash-after-swap-before-activation") throw new SimulatedCrashError();
      if (!runtimeExists) await createActivation(spec);
      await assertActivationOwned(spec, receipt);
      journal.phase = "committed";
      await writeJournal(root, journal);
      if (this.options.failpoint === "crash-after-swap") throw new SimulatedCrashError();
      await fs.unlink(path.join(root, JOURNAL_FILE));
      await fsyncDirectory(root);
      return { platform, targetRoot: root, runtimePath, dryRun: false, receipt };
    } catch (error) {
      if (error instanceof SimulatedCrashError) throw error;
      if (journalWritten) {
        if (mode === "install" && await exists(runtimePath) && !(await exists(spec.destination))) {
          await assertOwnedRuntime(runtimePath, platform, false);
          await removeIfExists(runtimePath);
          await fs.unlink(path.join(root, JOURNAL_FILE)).catch(() => undefined);
        } else {
          await recover(root, platform);
        }
      }
      else await removeIfExists(staging);
      throw error;
    }
  }

  async rollback(platform: RuntimePlatform): Promise<RuntimeLifecycleResult> {
    const root = this.rootFor(platform);
    const runtimePath = path.join(root, RUNTIME_DIRECTORY);
    const rollback = path.join(root, ROLLBACK_DIRECTORY);
    if (this.options.dryRun) return { platform, targetRoot: root, runtimePath, dryRun: true };
    if (!(await exists(root))) throw new Error(`No runtime root exists for ${platform}: ${root}`);
    await assertDirectoryNotLinked(root);
    await recover(root, platform);
    await recoverLegacyMigration(root, platform);
    await assertOwnedRuntime(runtimePath, platform);
    if (!(await exists(rollback))) {
      const migrationReceipt = await readLegacyMigrationReceipt(root, platform);
      if (!migrationReceipt) throw new Error(`No rollback snapshot exists for ${platform}: ${rollback}`);
      await validateLegacyArchive(migrationReceipt.archive, migrationReceipt.files);
      const journal: LegacyMigrationJournal = {
        schema: "agent-rules/legacy-migration-journal",
        version: 1,
        operation: "rollback",
        phase: "restoring",
        platform,
        archive: migrationReceipt.archive,
        legacyManifestSha256: migrationReceipt.legacyManifestSha256,
        movedCount: migrationReceipt.files.length,
        files: migrationReceipt.files,
      };
      await writeJsonDurable(path.join(root, LEGACY_MIGRATION_JOURNAL_FILE), journal);
      await recoverLegacyMigration(root, platform);
      return { platform, targetRoot: root, runtimePath, dryRun: false };
    }
    await assertOwnedRuntime(rollback, platform);
    const staging = path.join(root, `.${RUNTIME_DIRECTORY}.rollback-${randomUUID()}`);
    const journal: TransactionJournal = { schema: "agent-rules/runtime-transaction", version: 1, operation: "rollback", phase: "prepared", platform, target: runtimePath, staging, backup: rollback };
    await writeJournal(root, journal);
    try {
      await fs.rename(runtimePath, staging);
      await fsyncDirectory(root);
      if (this.options.failpoint === "crash-rollback-after-target-move") throw new SimulatedCrashError();
      journal.phase = "backed-up";
      await writeJournal(root, journal);
      if (this.options.failpoint === "crash-rollback-after-backed-up-journal") throw new SimulatedCrashError();
      await fs.rename(rollback, runtimePath);
      await fsyncDirectory(root);
      if (this.options.failpoint === "crash-rollback-after-backup-restore") throw new SimulatedCrashError();
      await fs.rename(staging, rollback);
      await fsyncDirectory(root);
      if (this.options.failpoint === "crash-rollback-after-staging-backup") throw new SimulatedCrashError();
      journal.phase = "committed";
      await writeJournal(root, journal);
      if (this.options.failpoint === "crash-rollback-after-commit-journal") throw new SimulatedCrashError();
      await fs.unlink(path.join(root, JOURNAL_FILE));
      await fsyncDirectory(root);
      return { platform, targetRoot: root, runtimePath, dryRun: false, receipt: await assertOwnedRuntime(runtimePath, platform) };
    } catch (error) {
      if (error instanceof SimulatedCrashError) throw error;
      await recover(root, platform);
      throw error;
    }
  }

  async recover(platform: RuntimePlatform): Promise<RuntimeLifecycleResult> {
    const root = this.rootFor(platform);
    const runtimePath = path.join(root, RUNTIME_DIRECTORY);
    if (!(await exists(root))) throw new Error(`No runtime root exists for ${platform}: ${root}`);
    await assertDirectoryNotLinked(root);
    if (this.options.dryRun) {
      const receipt = await previewRecovery(root, platform);
      return { platform, targetRoot: root, runtimePath, dryRun: true, receipt };
    }
    await recover(root, platform);
    await recoverLegacyMigration(root, platform);
    const receipt = await assertOwnedRuntime(runtimePath, platform);
    return { platform, targetRoot: root, runtimePath, dryRun: false, receipt };
  }

  async uninstall(platform: RuntimePlatform): Promise<RuntimeLifecycleResult> {
    const root = this.rootFor(platform);
    const runtimePath = path.join(root, RUNTIME_DIRECTORY);
    if (this.options.dryRun) return { platform, targetRoot: root, runtimePath, dryRun: true };
    if (!(await exists(root))) throw new Error(`No runtime root exists for ${platform}: ${root}`);
    await assertDirectoryNotLinked(root);
    await recover(root, platform);
    await recoverLegacyMigration(root, platform);
    await assertOwnedRuntime(runtimePath, platform);
    const rollback = path.join(root, ROLLBACK_DIRECTORY);
    if (await exists(rollback)) await assertOwnedRuntime(rollback, platform);
    const receipt = await assertOwnedRuntime(runtimePath, platform);
    await removeActivation(activationSpec(platform, root, runtimePath), receipt);
    await removeIfExists(runtimePath);
    await removeIfExists(rollback);
    await fs.unlink(path.join(root, JOURNAL_FILE)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
    await fsyncDirectory(root);
    return { platform, targetRoot: root, runtimePath, dryRun: false };
  }

  async migrateLegacy(platform: RuntimePlatform): Promise<RuntimeLifecycleResult> {
    const root = this.rootFor(platform);
    const runtimePath = path.join(root, RUNTIME_DIRECTORY);
    if (!(await exists(root))) throw new Error(`No legacy runtime root exists for ${platform}: ${root}`);
    await assertDirectoryNotLinked(root);
    if (this.options.dryRun) {
      await readLegacyManifest(root, platform);
      return this.install(platform, "install", true);
    }
    await recover(root, platform);
    await recoverLegacyMigration(root, platform);
    if (await exists(runtimePath)) {
      const receipt = await assertOwnedRuntime(runtimePath, platform);
      const migrationReceipt = await readLegacyMigrationReceipt(root, platform);
      if (!migrationReceipt) throw new Error(`New runtime already exists without a legacy migration receipt: ${runtimePath}`);
      await validateLegacyArchive(migrationReceipt.archive, migrationReceipt.files);
      return {
        platform,
        targetRoot: root,
        runtimePath,
        dryRun: false,
        receipt,
        migration: {
          receiptPath: path.join(root, LEGACY_MIGRATION_RECEIPT_FILE),
          archivePath: migrationReceipt.archive,
          legacyManifestSha256: migrationReceipt.legacyManifestSha256,
          fileCount: migrationReceipt.files.length,
        },
      };
    }

    const legacy = await readLegacyManifest(root, platform);
    const archive = path.join(root, `${LEGACY_ARCHIVE_PREFIX}${randomUUID()}`);
    const journal: LegacyMigrationJournal = {
      schema: "agent-rules/legacy-migration-journal",
      version: 1,
      operation: "migrate",
      phase: "moving",
      platform,
      archive,
      legacyManifestSha256: legacy.legacyManifestSha256,
      movedCount: 0,
      files: legacy.files,
    };
    await fs.mkdir(archive, { mode: 0o700 });
    await writeJsonDurable(path.join(root, LEGACY_MIGRATION_JOURNAL_FILE), journal);
    try {
      for (const file of legacy.files) {
        const source = await assertSafeSourceFile(root, file.path);
        if (hash(await readRegularFileNoFollow(source)) !== file.sha256) throw new Error(`Legacy runtime changed during migration: ${file.path}`);
        const destination = path.join(archive, ...file.path.split("/"));
        await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await fs.rename(source, destination);
        journal.movedCount += 1;
        await writeJsonDurable(path.join(root, LEGACY_MIGRATION_JOURNAL_FILE), journal);
        await fsyncDirectory(path.dirname(source));
        await fsyncDirectory(path.dirname(destination));
      }
      await validateLegacyArchive(archive, legacy.files);
      journal.phase = "archived";
      await writeJsonDurable(path.join(root, LEGACY_MIGRATION_JOURNAL_FILE), journal);
      if (this.options.failpoint === "crash-migration-after-archive") throw new SimulatedCrashError();

      const result = await this.install(platform, "install", true);
      const migrationReceipt: LegacyMigrationReceipt = {
        schema: "agent-rules/legacy-migration-receipt",
        version: 1,
        platform,
        archive,
        legacyManifestSha256: legacy.legacyManifestSha256,
        migratedAt: new Date().toISOString(),
        files: legacy.files,
      };
      const migrationReceiptPath = path.join(root, LEGACY_MIGRATION_RECEIPT_FILE);
      await writeJsonDurable(migrationReceiptPath, migrationReceipt);
      await fs.unlink(path.join(root, LEGACY_MIGRATION_JOURNAL_FILE));
      await fsyncDirectory(root);
      return {
        ...result,
        migration: {
          receiptPath: migrationReceiptPath,
          archivePath: archive,
          legacyManifestSha256: legacy.legacyManifestSha256,
          fileCount: legacy.files.length,
        },
      };
    } catch (error) {
      if (error instanceof SimulatedCrashError) throw error;
      await recover(root, platform);
      await recoverLegacyMigration(root, platform);
      throw error;
    }
  }
}

class SimulatedCrashError extends Error {
  constructor() {
    super("Injected crash; recovery is required before the next runtime operation");
  }
}

export function isRuntimePlatform(value: string): value is RuntimePlatform {
  return (RUNTIME_PLATFORMS as readonly string[]).includes(value);
}

/** The exact receipt/hash check a doctor command can use without mutating a runtime. */
export async function verifyRuntimeReceipt(runtimePath: string, platform?: RuntimePlatform): Promise<RuntimeReceipt> {
  return assertOwnedRuntime(path.resolve(runtimePath), platform);
}
