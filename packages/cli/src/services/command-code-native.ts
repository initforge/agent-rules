import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import { getStandardMcpServers } from "../runtime/mcp-convergence.js";

const MANAGED_MOD_BEGIN = "// agent-rules:managed:command-code BEGIN";
const MANAGED_MOD_END = "// agent-rules:managed:command-code END";

export interface CommandCodeNativeReadback {
  modPath: string;
  modPresent: boolean;
  modManaged: boolean;
  mcpPath: string;
  mcpPresent: boolean;
  mcpValid: boolean;
  mcpServerNames: string[];
  expectedMcpServerNames: string[];
  mcpComplete: boolean;
}

export interface CommandCodeBackupEntry {
  path: string;
  backupFile: string | null;
  mode: number | null;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function commandCodeHome(env: NodeJS.ProcessEnv = process.env, userHome = os.homedir()): string {
  return env.COMMAND_CODE_HOME || path.join(userHome, ".commandcode");
}

export function commandCodeModPath(home = commandCodeHome()): string {
  return path.join(home, "mods", "agent-rules.ts");
}

export function commandCodeMcpPath(home = commandCodeHome()): string {
  return path.join(home, "mcp.json");
}

export function commandCodeModSourcePath(repoRoot = process.cwd()): string {
  const direct = path.join(repoRoot, "platforms", "command-code", "agent-rules.ts");
  if (fs.existsSync(direct)) return direct;
  // Focused workspace tests run with packages/cli as cwd; resolve the
  // repository root without relying on the caller's current directory.
  return path.join(path.resolve(repoRoot, "..", ".."), "platforms", "command-code", "agent-rules.ts");
}

function atomicWrite(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID().slice(0, 8)}`;
  try {
    fs.writeFileSync(temporary, content, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* preserve the write failure */ }
    throw error;
  }
}

function findRepositoryRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, "skills"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function commandCodeMcpServers(_home: string, ids?: readonly string[]): Record<string, Record<string, unknown>> {
  const requested = ids ? new Set(ids) : null;
  return Object.fromEntries(
    Object.entries(getStandardMcpServers(os.homedir()))
      .filter(([name]) => !requested || requested.has(name))
      .map(([name, server]) => [name, { ...server }]),
  );
}

function sameMcpCommand(left: unknown, right: unknown): boolean {
  if (!left || typeof left !== "object" || !right || typeof right !== "object") return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return a.command === b.command
    && JSON.stringify(a.args ?? []) === JSON.stringify(b.args ?? [])
    && JSON.stringify(a.env ?? {}) === JSON.stringify(b.env ?? {});
}

function loadJson(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Command Code MCP config must be a JSON object: ${file}`);
  return parsed as Record<string, unknown>;
}

/**
 * Write the host-native Command Code MCP surface. Existing same-name entries
 * are replaced only when their command identity matches the managed provider;
 * unrelated or user-modified entries fail closed instead of being overwritten.
 */
export function writeCommandCodeMcpConfig(home = commandCodeHome(), ids?: readonly string[]): string {
  const mcpPath = commandCodeMcpPath(home);
  const legacyPath = path.join(path.dirname(home), ".command-code", "mcp.json");
  let existingPath = mcpPath;
  let existing = loadJson(mcpPath);
  if (!fs.existsSync(mcpPath) && fs.existsSync(legacyPath)) {
    existingPath = legacyPath;
    existing = loadJson(legacyPath);
  }

  const currentServers = existing.mcpServers;
  if (currentServers !== undefined && (!currentServers || typeof currentServers !== "object" || Array.isArray(currentServers))) {
    throw new Error(`Command Code MCP config has invalid mcpServers: ${existingPath}`);
  }
  const nextServers: Record<string, unknown> = { ...((currentServers ?? {}) as Record<string, unknown>) };
  const managed = commandCodeMcpServers(home, ids);
  for (const [name, definition] of Object.entries(managed)) {
    const current = nextServers[name];
    if (current !== undefined && !sameMcpCommand(current, definition)) {
      throw new Error(`Refusing to overwrite user-modified Command Code MCP server: ${name}`);
    }
    nextServers[name] = definition;
  }

  atomicWrite(mcpPath, JSON.stringify({ ...existing, mcpServers: nextServers }, null, 2) + "\n");
  return mcpPath;
}

export function readCommandCodeNative(home = commandCodeHome()): CommandCodeNativeReadback {
  const modPath = commandCodeModPath(home);
  const mcpPath = commandCodeMcpPath(home);
  let mcpValid = false;
  let mcpServerNames: string[] = [];
  let mcpComplete = false;
  try {
    const parsed = loadJson(mcpPath);
    const servers = parsed.mcpServers;
    if (servers && typeof servers === "object" && !Array.isArray(servers)) {
      mcpValid = true;
      mcpServerNames = Object.keys(servers as Record<string, unknown>).sort();
      const serverMap = servers as Record<string, unknown>;
      const expected = commandCodeMcpServers(home);
      mcpComplete = Object.entries(expected).every(([name, definition]) => {
        const observed = serverMap[name];
        if (!sameMcpCommand(observed, definition) || !observed || typeof observed !== "object") return false;
        const record = observed as Record<string, unknown>;
        return (record.transport === undefined || record.transport === "stdio") && record.enabled !== false;
      });
    }
  } catch {
    mcpValid = false;
  }
  const expectedMcpServerNames = Object.keys(commandCodeMcpServers(home)).sort();
  const modPresent = fs.existsSync(modPath);
  const modBody = modPresent ? fs.readFileSync(modPath, "utf8") : "";
  const modManaged = modBody.includes(MANAGED_MOD_BEGIN) && modBody.includes(MANAGED_MOD_END);
  return {
    modPath,
    modPresent,
    modManaged,
    mcpPath,
    mcpPresent: fs.existsSync(mcpPath),
    mcpValid,
    mcpServerNames,
    expectedMcpServerNames,
    mcpComplete: mcpValid && mcpComplete && expectedMcpServerNames.every((name) => mcpServerNames.includes(name)),
  };
}

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  visit(root);
  return files.sort();
}

export function commandCodeSkillParity(userHome = os.homedir(), repositoryRoot = findRepositoryRoot()): { ok: boolean; count: number; expected: number; sha256: string } {
  const sourceRoot = path.join(repositoryRoot, "skills");
  const targetRoot = path.join(commandCodeHome(process.env, userHome), "skills");
  const sourceDirs = fs.existsSync(sourceRoot)
    ? fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  const sourceFiles = sourceDirs.flatMap((name) => listFiles(path.join(sourceRoot, name)));
  const hashes: string[] = [];
  let count = 0;
  for (const source of sourceFiles) {
    const relative = path.relative(sourceRoot, source);
    const target = path.join(targetRoot, relative);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
    const sourceBytes = fs.readFileSync(source);
    const targetBytes = fs.readFileSync(target);
    if (!sourceBytes.equals(targetBytes)) continue;
    count += 1;
    hashes.push(`${relative.replace(/\\/g, "/")}:${sha256(targetBytes)}`);
  }
  return {
    ok: sourceDirs.length > 0 && count === sourceFiles.length,
    count,
    expected: sourceFiles.length,
    sha256: sha256(hashes.sort().join("\n")),
  };
}

function resolveCanonicalRepoRoot(start = process.cwd()): string {
  let candidate = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(candidate, "rules", "manifest.yaml"))) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error(`canonical rules manifest missing above: ${start}`);
}

export function installCommandCodeMod(home = commandCodeHome(), repoRoot = process.cwd()): string {
  repoRoot = resolveCanonicalRepoRoot(repoRoot);
  const source = commandCodeModSourcePath(repoRoot);
  if (!fs.existsSync(source)) throw new Error(`Command Code managed mod source is missing: ${source}`);
  const destination = commandCodeModPath(home);
  const existing = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : "";
  if (existing.trim() && (!existing.includes(MANAGED_MOD_BEGIN) || !existing.includes(MANAGED_MOD_END))) {
    throw new Error(`Refusing to overwrite user-owned Command Code mod: ${destination}`);
  }
  const manifest = path.join(repoRoot, "rules", "manifest.yaml");
  const names = fs.readFileSync(manifest, "utf8").split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+([\w.-]+\.md)\s*$/)?.[1])
    .filter((name): name is string => Boolean(name));
  if (names.length !== 5) throw new Error(`canonical rules manifest must name exactly five rules; found ${names.length}`);
  const rules = names.map((name) => fs.readFileSync(path.join(repoRoot, "rules", name), "utf8").trim()).join("\n\n");
  const template = fs.readFileSync(source, "utf8");
  if (!template.includes("__AGENT_RULES_RULES__")) throw new Error(`Command Code mod template lacks canonical rule placeholder: ${source}`);
  atomicWrite(destination, template.replace("__AGENT_RULES_RULES__", rules));
  return destination;
}

export function captureCommandCodeBackup(home = commandCodeHome(), backupDir: string): CommandCodeBackupEntry[] {
  const files = [commandCodeModPath(home), commandCodeMcpPath(home)];
  fs.mkdirSync(backupDir, { recursive: true });
  const entries: CommandCodeBackupEntry[] = [];
  for (const file of files) {
    const exists = fs.existsSync(file);
    const content = exists ? fs.readFileSync(file) : null;
    const backupFile = content ? `${sha256(file).slice(0, 12)}-${path.basename(file)}` : null;
    if (content && backupFile) atomicWrite(path.join(backupDir, backupFile), content);
    entries.push({ path: file, backupFile, mode: exists ? fs.statSync(file).mode & 0o7777 : null });
  }
  atomicWrite(path.join(backupDir, ".command-code-backup.json"), JSON.stringify({ schema: "agent-rules/command-code-backup/v1", entries }, null, 2) + "\n");
  return entries;
}

export function restoreCommandCodeBackup(backupDir: string): boolean {
  const manifestPath = path.join(backupDir, ".command-code-backup.json");
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { entries?: CommandCodeBackupEntry[] };
  if (!Array.isArray(manifest.entries)) throw new Error("invalid Command Code backup manifest");
  for (const entry of manifest.entries) {
    if (!entry.path || !path.isAbsolute(entry.path)) throw new Error("Command Code backup path must be absolute");
    if (entry.backupFile) {
      atomicWrite(entry.path, fs.readFileSync(path.join(backupDir, entry.backupFile)));
      if (entry.mode !== null) fs.chmodSync(entry.path, entry.mode);
    } else if (fs.existsSync(entry.path)) {
      fs.rmSync(entry.path, { force: true });
    }
  }
  return true;
}

export function verifyCommandCodeBackup(backupDir: string): boolean {
  const manifestPath = path.join(backupDir, ".command-code-backup.json");
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { entries?: CommandCodeBackupEntry[] };
  if (!Array.isArray(manifest.entries)) return false;
  return manifest.entries.every((entry) => {
    const expected = entry.backupFile ? fs.readFileSync(path.join(backupDir, entry.backupFile)) : null;
    const actual = fs.existsSync(entry.path) ? fs.readFileSync(entry.path) : null;
    if (expected === null ? actual !== null : actual === null || !expected.equals(actual)) return false;
    if (actual !== null && entry.mode !== null && (fs.statSync(entry.path).mode & 0o7777) !== entry.mode) return false;
    return true;
  });
}

export function removeManagedCommandCodeMod(home = commandCodeHome()): boolean {
  const file = commandCodeModPath(home);
  if (!fs.existsSync(file)) return false;
  const body = fs.readFileSync(file, "utf8");
  if (!body.includes(MANAGED_MOD_BEGIN) || !body.includes(MANAGED_MOD_END)) return false;
  fs.rmSync(file, { force: true });
  return true;
}

export function removeManagedCommandCodeMcp(home = commandCodeHome(), ids?: readonly string[]): boolean {
  const file = commandCodeMcpPath(home);
  if (!fs.existsSync(file)) return false;
  const parsed = loadJson(file);
  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)) return false;
  const servers = parsed.mcpServers as Record<string, unknown>;
  const managed = commandCodeMcpServers(home, ids);
  let changed = false;
  for (const [name, definition] of Object.entries(managed)) {
    if (servers[name] !== undefined && sameMcpCommand(servers[name], definition)) {
      delete servers[name];
      changed = true;
    }
  }
  if (changed) atomicWrite(file, JSON.stringify({ ...parsed, mcpServers: servers }, null, 2) + "\n");
  return changed;
}

export const commandCodeManagedModMarkers = { begin: MANAGED_MOD_BEGIN, end: MANAGED_MOD_END } as const;
