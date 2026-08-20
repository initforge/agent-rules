import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadIntegrationInventory } from "../integration/inventory.js";
import { resolveGlobalMcpProfile, type GlobalMcpProfile } from "../integration/mcp-profile.js";

/**
 * REQ-008/REQ-009 — host-config convergence to the idle-zero default.
 *
 * Three concepts are separated: installed package (disk), host exposure
 * (entries in global host configs), and process activation (spawned servers).
 * The default global MCP profile is `none`, so agent-rules-owned MCP entries
 * must not remain enabled in host configs:
 *   - owned entries (known server name AND known fingerprint) -> removed, or
 *     disabled when the host supports a disabled descriptor (codex enabled=false,
 *     opencode disabled=true);
 *   - legacy entries with an exact known fingerprint -> backed up then migrated
 *     (same as owned);
 *   - entries the user modified (name matches but content does not) -> NEEDS_USER,
 *     never blind-deleted;
 *   - unrelated user entries -> untouched.
 * Every mutation is preceded by a full config backup with a receipt. Read-only
 * classification is available for doctor.
 */

export type HostName = "codex" | "claude" | "cursor" | "antigravity" | "grok" | "opencode";

export const HOST_CONFIG_FILES: Record<HostName, string> = {
  codex: "config.toml",
  grok: "mcp.json",
  antigravity: "mcp_config.json",
  cursor: "mcp.json",
  opencode: "opencode.json",
  claude: ".claude.json",
};

export function hostHome(host: HostName, env: NodeJS.ProcessEnv = process.env): string {
  const userHome = env.USERPROFILE || env.HOME || "";
  switch (host) {
    case "codex": return env.CODEX_HOME || path.join(userHome, ".codex");
    case "grok": return env.GROK_HOME || path.join(userHome, ".grok");
    case "antigravity": return path.join(userHome, ".gemini", "config");
    case "cursor": return path.join(userHome, ".cursor");
    case "opencode": return env.OPENCODE_HOME || path.join(userHome, ".config", "opencode");
    case "claude": return env.CLAUDE_CONFIG_DIR || path.join(userHome, ".claude");
  }
}

export type EntryDisposition = "owned-remove" | "owned-disable" | "legacy-migrate" | "user-modified" | "user-owned";

export interface ConvergedEntry {
  id: string;
  disposition: EntryDisposition;
  reason: string;
  backed_up?: boolean;
}

export interface HostConvergenceResult {
  host: HostName;
  config_path: string;
  exists: boolean;
  status: "CLEAN" | "CONVERGED" | "NEEDS_USER" | "SKIPPED";
  entries: ConvergedEntry[];
  backup_path?: string;
  backup_receipt?: string;
  error?: string;
}

export interface ConvergenceOptions {
  dryRun?: boolean;
  globalMcpProfile?: GlobalMcpProfile;
  env?: NodeJS.ProcessEnv;
}

export interface KnownAdapterFingerprint {
  serverName: string;
  /** sha256 of the adapter body after placeholder expansion (machine-local). */
  sha256: string;
  /** sha256 of the raw adapter body with placeholders unexpanded. */
  rawSha256: string;
  integrationId: string;
  host: string;
  body: string;
}

export interface ConvergenceModel {
  profile: GlobalMcpProfile;
  knownNames: Set<string>;
  fingerprints: KnownAdapterFingerprint[];
  /** Strong legacy signals: agent-rules managed roots or exact pkg@version. */
  legacyCommandPatterns: RegExp[];
}

/** Resolve the codebase-memory-mcp binary path the adapters expand to. */
export function resolveCodebaseMemoryBin(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs", "codebase-memory-mcp", "codebase-memory-mcp.exe") : null,
    env.HOME ? path.join(env.HOME, ".local", "share", "codebase-memory-mcp", "codebase-memory-mcp") : null,
    env.HOME ? path.join(env.HOME, "Library", "Application Support", "codebase-memory-mcp", "codebase-memory-mcp") : null,
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function expandPlaceholders(body: string, env: NodeJS.ProcessEnv): string {
  const bin = resolveCodebaseMemoryBin(env);
  if (bin) return body.replaceAll("${CODEBASE_MEMORY_MCP_BIN}", bin.replaceAll("\\", "/"));
  return body;
}

const ADAPTER_FILES: Record<HostName, string> = {
  codex: "codex.toml",
  grok: "grok.json",
  antigravity: "antigravity.json",
  cursor: "cursor.json",
    opencode: "opencode.json",
  claude: ".claude.json",
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function integrationDirs(repoRoot: string): string[] {
  return ["required", "recommended", "optional", "manual"].map((bucket) => path.join(repoRoot, "integrations", bucket));
}

function findAdapterFile(repoRoot: string, integrationId: string, host: HostName): string | null {
  for (const dir of integrationDirs(repoRoot)) {
    const candidate = path.join(dir, integrationId, "adapters", ADAPTER_FILES[host]);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Server keys written by a JSON adapter body under mcpServers. */
function jsonServerKeys(body: string): string[] {
  try {
    const parsed = JSON.parse(body) as { mcpServers?: Record<string, unknown>; mcp?: Record<string, unknown> };
    return Object.keys(parsed.mcpServers ?? parsed.mcp ?? {});
  } catch {
    return [];
  }
}

/** Server keys written by a codex TOML adapter body ([mcp_servers.<name>]). */
function tomlServerKeys(body: string): string[] {
  const keys: string[] = [];
  for (const match of body.matchAll(/\[mcp_servers\.([^\]]+)\]/g)) {
    const name = match[1]?.trim();
    if (name) keys.push(name);
  }
  return keys;
}

/**
 * Per-server fingerprints: the same representation parseHostConfig produces
 * for a host config entry, so owned entries match exactly. For JSON adapters
 * that is the canonical JSON of the server definition; for codex TOML it is
 * the `[mcp_servers.<name>]` block text.
 */
function serverDefinitionBodies(host: HostName, body: string): Array<{ name: string; definition: string }> {
  const out: Array<{ name: string; definition: string }> = [];
  if (host === "codex") {
    const sections = body.matchAll(/^\s*\[mcp_servers\.([^\]]+)\]\s*$/gm);
    const starts: Array<{ name: string; index: number }> = [];
    for (const match of sections) starts.push({ name: match[1]!.trim(), index: match.index! });
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index]!;
      const end = starts[index + 1]?.index ?? body.length;
      out.push({ name: start.name, definition: body.slice(start.index, end).trim() });
    }
    return out;
  }
  try {
    const parsed = JSON.parse(body) as { mcpServers?: Record<string, unknown>; mcp?: Record<string, unknown> };
    for (const [name, definition] of Object.entries(parsed.mcpServers ?? parsed.mcp ?? {})) {
      out.push({ name, definition: JSON.stringify(definition) });
    }
  } catch {
    /* malformed adapter */
  }
  return out;
}

/** Build the known-fingerprint model for a host from the canonical registry. */
export async function buildConvergenceModel(repoRoot: string, host: HostName, env: NodeJS.ProcessEnv = process.env, profileOverride?: GlobalMcpProfile): Promise<ConvergenceModel> {
  const inventory = await loadIntegrationInventory(repoRoot);
  const fingerprints: KnownAdapterFingerprint[] = [];
  const knownNames = new Set<string>();
  const legacyCommandPatterns: RegExp[] = [];
  for (const entry of inventory.mcps) {
    const adapter = findAdapterFile(repoRoot, entry.id, host);
    if (!adapter) continue;
    const raw = fs.readFileSync(adapter, "utf8");
    const expanded = expandPlaceholders(raw, env);
    const definitions = serverDefinitionBodies(host, expanded);
    for (const { name, definition } of definitions) {
      knownNames.add(name);
      fingerprints.push({
        serverName: name,
        sha256: sha256(definition),
        rawSha256: sha256(raw),
        integrationId: entry.id,
        host,
        body: definition,
      });
    }
    const source = entry.source as { package?: string; version?: string; type?: string } | undefined;
    // Exact pkg@version is a strong legacy signal (an older installer wrote it).
    if (source?.package && source.version && source.version !== "host-managed") {
      const pkg = source.package.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const version = source.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      legacyCommandPatterns.push(new RegExp(`${pkg}@${version}(?![\\w])`, "i"));
    }
  }
  // agent-rules managed install roots are always owned regardless of name.
  const managedRoots = [
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs", "codebase-memory-mcp") : null,
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "agent-rules") : null,
    env.HOME ? path.join(env.HOME, ".local", "share", "agent-rules") : null,
    env.HOME ? path.join(env.HOME, ".local", "share", "codebase-memory-mcp") : null,
  ].filter((value): value is string => Boolean(value));
  for (const root of managedRoots) {
    // TOML configs escape backslashes as double backslashes (C:\\Users), so
    // match one-or-more backslash/slash separators.
    legacyCommandPatterns.push(new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\/g, "[\\\\/]+"), "i"));
  }
  return {
    profile: profileOverride ?? resolveGlobalMcpProfile(env),
    knownNames,
    fingerprints,
    legacyCommandPatterns,
  };
}

export interface ParsedHostConfig {
  serverEntries: Array<{ id: string; body: string; raw: string; disabled: boolean }>;
  /** Whether the entry currently carries a disabled marker (codex enabled=false, opencode disabled=true). */
  disabled: boolean;
}

function parseCodexSections(content: string): ParsedHostConfig {
  const serverEntries: ParsedHostConfig["serverEntries"] = [];
  const sections = content.matchAll(/^\s*\[mcp_servers\.([^\]]+)\]\s*$/gm);
  const starts: Array<{ id: string; index: number }> = [];
  for (const match of sections) {
    starts.push({ id: match[1]!.trim(), index: match.index! });
  }
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]!;
    const end = starts[index + 1]?.index ?? content.length;
    const block = content.slice(start.index, end).trim();
    const disabled = /^\s*enabled\s*=\s*false\s*$/m.test(block);
    serverEntries.push({ id: start.id, body: block, raw: block, disabled });
  }
  return { serverEntries, disabled: serverEntries.some((entry) => entry.disabled) };
}

function parseJsonServers(content: string, key: "mcpServers" | "mcp"): ParsedHostConfig {
  const serverEntries: ParsedHostConfig["serverEntries"] = [];
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const servers = parsed[key] as Record<string, Record<string, unknown>> | undefined;
    if (!servers) return { serverEntries, disabled: false };
    for (const [id, definition] of Object.entries(servers)) {
      if (typeof definition !== "object" || definition === null) continue;
      serverEntries.push({
        id,
        body: JSON.stringify(definition),
        raw: JSON.stringify(definition),
        disabled: definition.enabled === false || definition.disabled === true,
      });
    }
  } catch {
    /* malformed config: caller reports error */
  }
  return { serverEntries, disabled: serverEntries.some((entry) => entry.disabled) };
}

export function parseHostConfig(host: HostName, content: string): ParsedHostConfig {
  if (host === "codex") return parseCodexSections(content);
  if (host === "opencode") return parseJsonServers(content, "mcp");
  return parseJsonServers(content, "mcpServers");
}

function classifyEntry(entry: { id: string; body: string; disabled: boolean }, model: ConvergenceModel): EntryDisposition {
  if (entry.disabled) return "owned-disable";
  const fingerprint = model.fingerprints.find((known) => known.serverName === entry.id && known.sha256 === sha256(entry.body));
  if (fingerprint) return model.profile === "none" ? "owned-remove" : "owned-disable";
  const strongLegacy = model.legacyCommandPatterns.some((pattern) => pattern.test(entry.body));
  if (model.knownNames.has(entry.id)) {
    // REQ-008: an entry whose name is a known agent-rules MCP and whose content
    // references the EXACT agent-rules artifact (managed install root or
    // registry pkg@version) was written by an earlier installer — backed up
    // then removed/disabled. A known name with a different/unknown version or
    // no agent-rules reference is user-modified -> NEEDS_USER, never deleted.
    return strongLegacy ? "legacy-migrate" : "user-modified";
  }
  return strongLegacy ? "legacy-migrate" : "user-owned";
}

function backupConfig(configPath: string, rootDir: string): { backupPath: string; receiptPath: string } {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(rootDir, ".agent-rules-convergence", stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, path.basename(configPath));
  const bytes = fs.readFileSync(configPath);
  fs.writeFileSync(backupPath, bytes);
  const receipt = {
    schema: "agent-rules/mcp-convergence-backup",
    version: 1,
    backed_up_at: new Date().toISOString(),
    config_path: configPath,
    backup_path: backupPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    reason: "pre-convergence backup before agent-rules MCP entry removal/disable",
  };
  const receiptPath = path.join(backupDir, "receipt.json");
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  return { backupPath, receiptPath };
}

function applyConvergence(host: HostName, configPath: string, entries: Array<{ id: string; body: string; disabled: boolean }>, dispositions: Map<string, EntryDisposition>): { changed: boolean } {
  let content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  let changed = false;
  if (host === "codex") {
    // Locate [mcp_servers.<id>] sections by index (like parseCodexSections),
    // bounded by the NEXT top-level section of ANY kind (or EOF) so trailing
    // sections (e.g. [projects...]) are never swallowed.
    const sectionStarts: Array<{ id: string; index: number }> = [];
    for (const match of content.matchAll(/^\s*\[mcp_servers\.([^\]]+)\]\s*$/gm)) {
      sectionStarts.push({ id: match[1]!.trim(), index: match.index! });
    }
    const allSectionStarts: number[] = [];
    for (const match of content.matchAll(/^\s*\[[^\]]*\]\s*$/gm)) {
      allSectionStarts.push(match.index!);
    }
    const targets = entries.filter((entry) => {
      const disposition = dispositions.get(entry.id);
      return disposition === "owned-remove" || disposition === "owned-disable" || disposition === "legacy-migrate";
    });
    const edits: Array<{ start: number; end: number; replacement: string }> = [];
    for (const target of targets) {
      const startIndex = sectionStarts.findIndex((section) => section.id === target.id);
      if (startIndex === -1) continue;
      const start = sectionStarts[startIndex]!.index;
      const nextAny = allSectionStarts.find((sectionStart) => sectionStart > start);
      const end = nextAny ?? content.length;
      const block = content.slice(start, end);
      const disposition = dispositions.get(target.id);
      if (disposition === "owned-disable") {
        const disabledBlock = `${block.replace(/\s+$/, "")}\nenabled = false\n`;
        edits.push({ start, end, replacement: disabledBlock });
      } else {
        edits.push({ start, end, replacement: "" });
      }
    }
    if (edits.length > 0) {
      let out = "";
      let cursor = 0;
      for (const edit of edits.sort((a, b) => a.start - b.start)) {
        out += content.slice(cursor, edit.start) + edit.replacement;
        cursor = edit.end;
      }
      out += content.slice(cursor);
      content = out;
      changed = true;
    }
  } else {
    const key = host === "opencode" ? "mcp" : "mcpServers";
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const servers = parsed[key] as Record<string, Record<string, unknown>> | undefined;
      if (servers) {
        for (const entry of entries) {
          const disposition = dispositions.get(entry.id);
          if (disposition !== "owned-remove" && disposition !== "owned-disable" && disposition !== "legacy-migrate") continue;
          if (disposition === "owned-disable" && host === "opencode") {
            servers[entry.id] = { ...servers[entry.id], enabled: false, disabled: true };
          } else {
            delete servers[entry.id];
          }
          changed = true;
        }
        if (Object.keys(servers).length === 0) delete parsed[key];
      }
      content = JSON.stringify(parsed, null, 2) + "\n";
    } catch {
      throw new Error(`cannot rewrite malformed JSON host config: ${configPath}`);
    }
  }
  if (changed) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, content, "utf8");
  }
  return { changed };
}

/**
 * Classify the MCP entries of one host config (read-only; never mutates).
 */
export async function classifyHostMcpConfig(repoRoot: string, host: HostName, options: ConvergenceOptions = {}): Promise<HostConvergenceResult> {
  const env = options.env ?? process.env;
  const configPath = path.join(hostHome(host, env), HOST_CONFIG_FILES[host]);
  const base: HostConvergenceResult = { host, config_path: configPath, exists: false, status: "SKIPPED", entries: [] };
  if (!fs.existsSync(configPath)) return { ...base, status: "CLEAN" };
  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    return { ...base, error: (error as Error).message };
  }
  let parsed: ParsedHostConfig;
  try {
    parsed = parseHostConfig(host, content);
  } catch (error) {
    return { ...base, error: (error as Error).message };
  }
  const profile = options.globalMcpProfile ?? resolveGlobalMcpProfile(env);
  const model = await buildConvergenceModel(repoRoot, host, env, profile);
  const entries: ConvergedEntry[] = [];
  let needsUser = false;
  for (const entry of parsed.serverEntries) {
    const disposition = classifyEntry(entry, model);
    if (disposition === "user-modified") needsUser = true;
    const reason = dispositionReason(disposition, profile);
    entries.push({ id: entry.id, disposition, reason });
  }
  const touched = entries.filter((entry) => entry.disposition !== "user-owned");
  const status = needsUser ? "NEEDS_USER" : touched.length === 0 ? "CLEAN" : "CONVERGED";
  return { ...base, exists: true, status, entries };
}

function dispositionReason(disposition: EntryDisposition, profile: GlobalMcpProfile): string {
  switch (disposition) {
    case "owned-remove": return `agent-rules-owned entry removed (global MCP profile ${profile})`;
    case "owned-disable": return `agent-rules-owned entry kept disabled (global MCP profile ${profile})`;
    case "legacy-migrate": return `legacy agent-rules entry backed up and disabled (global MCP profile ${profile})`;
    case "user-modified": return "entry name matches an agent-rules MCP but content was modified by the user; NEEDS_USER, never deleted blindly";
    case "user-owned": return "user-owned entry; untouched";
  }
}

/**
 * Converge one host config to the idle-zero default. Reads the current state,
 * backs up before any mutation, then removes or disables owned/legacy entries.
 * User-modified entries produce NEEDS_USER and never get deleted.
 */
export async function convergeHostMcpConfig(repoRoot: string, host: HostName, options: ConvergenceOptions = {}): Promise<HostConvergenceResult> {
  const env = options.env ?? process.env;
  const profile = options.globalMcpProfile ?? resolveGlobalMcpProfile(env);
  const configPath = path.join(hostHome(host, env), HOST_CONFIG_FILES[host]);
  const base: HostConvergenceResult = { host, config_path: configPath, exists: false, status: "SKIPPED", entries: [] };
  if (!fs.existsSync(configPath)) return { ...base, status: "CLEAN" };
  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    return { ...base, error: (error as Error).message };
  }
  let parsed: ParsedHostConfig;
  try {
    parsed = parseHostConfig(host, content);
  } catch (error) {
    return { ...base, error: (error as Error).message };
  }
  const model = await buildConvergenceModel(repoRoot, host, env, profile);
  const dispositions = new Map<string, EntryDisposition>();
  const entries: ConvergedEntry[] = [];
  let needsUser = false;
  let touchesAnything = false;
  for (const entry of parsed.serverEntries) {
    const disposition = classifyEntry(entry, model);
    dispositions.set(entry.id, disposition);
    if (disposition === "user-modified") needsUser = true;
    if (disposition !== "user-owned") touchesAnything = true;
    entries.push({ id: entry.id, disposition, reason: dispositionReason(disposition, profile) });
  }
  if (!touchesAnything) return { ...base, exists: true, status: "CLEAN", entries };
  if (options.dryRun) {
    return { ...base, exists: true, status: needsUser ? "NEEDS_USER" : "CONVERGED", entries, error: "dry-run: no mutation applied" };
  }
  if (needsUser) {
    // Still converge what is safely owned, but never touch user-modified entries.
  }
  const backup = backupConfig(configPath, path.dirname(configPath));
  let applied: { changed: boolean };
  try {
    applied = applyConvergence(host, configPath, parsed.serverEntries, dispositions);
  } catch (error) {
    return { ...base, exists: true, status: needsUser ? "NEEDS_USER" : "CONVERGED", entries, backup_path: backup.backupPath, backup_receipt: backup.receiptPath, error: (error as Error).message };
  }
  for (const entry of entries) {
    if (entry.disposition === "owned-remove" || entry.disposition === "owned-disable" || entry.disposition === "legacy-migrate") {
      entry.backed_up = true;
    }
  }
  return {
    ...base,
    exists: true,
    status: needsUser ? "NEEDS_USER" : "CONVERGED",
    entries,
    backup_path: backup.backupPath,
    backup_receipt: backup.receiptPath,
    ...(applied.changed ? {} : { error: "convergence applied but host config unchanged" }),
  };
}

export const ALL_MCP_HOSTS: readonly HostName[] = ["codex", "claude", "cursor", "antigravity", "grok", "opencode"];

export async function convergeAllHostMcpConfigs(repoRoot: string, hosts: readonly HostName[] = ALL_MCP_HOSTS, options: ConvergenceOptions = {}): Promise<HostConvergenceResult[]> {
  const results: HostConvergenceResult[] = [];
  for (const host of hosts) {
    results.push(await convergeHostMcpConfig(repoRoot, host, options));
  }
  return results;
}

export function hostConvergenceBlocking(results: readonly HostConvergenceResult[]): boolean {
  return results.some((result) => result.status === "NEEDS_USER" || result.error?.startsWith("cannot rewrite"));
}
