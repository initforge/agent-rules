import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadIntegrationInventory } from "../integration/inventory.js";
import { resolveGlobalMcpProfile, selectGlobalAdapterEntries, type GlobalMcpProfile } from "../integration/mcp-profile.js";
import { resolveOmpAgentHome } from "../native/omp.js";

/**
 * REQ-008/REQ-009 — native host MCP registration and the legacy migration.
 *
 * Three concepts are separated: installed package (disk), host exposure
 * (entries in global host configs), and process activation (a server selected
 * by a host for a real task).  Normal setup registers the approved standard
 * MCPs. `convergeHostMcpConfig` remains the explicit `none` migration path:
 *   - owned entries (known server name AND known fingerprint) -> removed when
 *     the user explicitly selects `none`;
 *   - legacy entries with an exact known fingerprint -> backed up then migrated;
 *   - entries the user modified (name matches but content does not) -> NEEDS_USER,
 *     never blind-deleted;
 *   - unrelated user entries -> untouched.
 * Every mutation is preceded by a full config backup with a receipt.  A
 * registered provider is never a claim that a host session has connected or
 * called its tools.
 */

export type HostName = "codex" | "claude" | "cursor" | "antigravity" | "grok" | "opencode" | "deepseek-harness" | "command-code" | "omp";

export const HOST_CONFIG_FILES: Record<HostName, string> = {
  codex: "config.toml",
  grok: "mcp.json",
  antigravity: "mcp_config.json",
  cursor: "mcp.json",
  opencode: "opencode.json",
  claude: ".claude.json",
  "deepseek-harness": "config.json",
  "command-code": "mcp.json",
  omp: "mcp.json",
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
    case "deepseek-harness": return env.DSH_HOME || path.join(userHome, ".dsh");
    case "command-code": return env.COMMAND_CODE_HOME || path.join(userHome, ".commandcode");
    case "omp": return resolveOmpAgentHome(env, userHome);
  }
}

/** The Claude user MCP registry is a sibling of `CLAUDE_CONFIG_DIR`, not a
 * file inside it. Keeping this resolver central prevents a plausible but
 * unused `~/.claude/.claude.json` shadow config. */
export function hostMcpConfigPath(host: HostName, env: NodeJS.ProcessEnv = process.env): string {
  const userHome = env.USERPROFILE || env.HOME || "";
  if (host === "claude") return path.join(userHome, ".claude.json");
  return path.join(hostHome(host, env), HOST_CONFIG_FILES[host]);
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
  /** Limit an explicit enable/disable operation to these integration ids. */
  integrationIds?: readonly string[];
}

interface RegistrationPreferences {
  schema: "agent-rules/mcp-registration-preferences/v1";
  disabled: string[];
}

function registrationPreferencesPath(env: NodeJS.ProcessEnv): string {
  const home = env.USERPROFILE || env.HOME || "";
  return path.join(home, ".agent-rules", "mcp-registration-preferences.json");
}

function disabledRegistrationIds(env: NodeJS.ProcessEnv): Set<string> {
  const file = registrationPreferencesPath(env);
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<RegistrationPreferences>;
    return new Set(Array.isArray(value.disabled) ? value.disabled.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Persist an explicit user enable/disable choice separately from provider
 * packages.  Normal install reads this preference and must never re-enable a
 * server the user deliberately disabled. */
export function setMcpRegistrationEnabled(id: string, enabled: boolean, env: NodeJS.ProcessEnv = process.env): void {
  const disabled = disabledRegistrationIds(env);
  if (enabled) disabled.delete(id); else disabled.add(id);
  const file = registrationPreferencesPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next: RegistrationPreferences = {
    schema: "agent-rules/mcp-registration-preferences/v1",
    disabled: [...disabled].sort(),
  };
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
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

/**
 * Canonical stdio definitions for the two hosts whose native APIs accept a
 * server object instead of an adapter document (Command Code and DSH/Cordis).
 * Registration itself remains owned by this module; callers must not write
 * generic MCP config files on their own.
 */
export function getStandardMcpServers(home: string): Record<string, { command: string; args: string[]; env?: Record<string, string> }> {
  return {
    "codebase-memory": {
      command: path.join(home, "AppData", "Local", "Programs", "codebase-memory-mcp", "codebase-memory-mcp.exe"),
      args: [],
    },
    playwright: {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npx", "-y", "@playwright/mcp@0.0.78", "--isolated", "--executable-path", path.join(home, "AppData", "Local", "ms-playwright", "chromium-1232", "chrome-win64", "chrome.exe")],
    },
    "chrome-devtools": {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npx", "-y", "chrome-devtools-mcp@1.7.0", "--isolated", "--executablePath", path.join(home, "AppData", "Local", "ms-playwright", "chromium-1232", "chrome-win64", "chrome.exe")],
      env: {
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1",
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
      },
    },
    context7: {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npx", "-y", "@upstash/context7-mcp@3.2.5"],
    },
  };
}

function expandPlaceholders(host: HostName, body: string, env: NodeJS.ProcessEnv): string {
  const bin = resolveCodebaseMemoryBin(env);
  let expanded = bin
    ? body.replaceAll("${CODEBASE_MEMORY_MCP_BIN}", host === "codex" ? bin.replaceAll("\\", "/") : bin.replaceAll("\\", "\\\\"))
    : body;
  if (host === "opencode") {
    const userHome = env.USERPROFILE || env.HOME || "";
    const chrome = path.join(userHome, "AppData", "Local", "ms-playwright", "chromium-1232", "chrome-win64", "chrome.exe");
    expanded = expanded.replaceAll("${OPENCODE_CHROME_PATH}", chrome.replaceAll("\\", "\\\\"));
  }
  if (host === "command-code") {
    const userHome = env.USERPROFILE || env.HOME || "";
    const codebaseBin = env.CODEBASE_MEMORY_MCP_BIN || path.join(userHome, "AppData", "Local", "Programs", "codebase-memory-mcp", "codebase-memory-mcp.exe");
    const chromeBin = path.join(userHome, "AppData", "Local", "ms-playwright", "chromium-1232", "chrome-win64", "chrome.exe");
    expanded = expanded
      .replaceAll("${COMMAND_CODE_CODEBASE_MEMORY_BIN}", codebaseBin.replaceAll("\\", "\\\\"))
      .replaceAll("${COMMAND_CODE_CHROME_PATH}", chromeBin.replaceAll("\\", "\\\\"));
  }
  return expanded;
}

const ADAPTER_FILES: Record<HostName, string> = {
  codex: "codex.toml",
  grok: "grok.json",
  antigravity: "antigravity.json",
  cursor: "cursor.json",
  opencode: "opencode.json",
  claude: "claude.json",
  "deepseek-harness": "deepseek-harness.json",
  "command-code": "command-code.json",
  omp: "omp.json",
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function normalizedServerDefinition(host: HostName, value: string): string {
  if (host === "codex") {
    return value
      // The section key is compared separately.  Normalizing it here lets a
      // narrowly-declared legacy alias be proven equivalent to its canonical
      // server without accepting differences in command/args/settings.
      .replace(/\[mcp_servers\.[^\]]+\]/, "[mcp_servers.__server__]")
      .replace(/^\s*enabled\s*=\s*false\s*$/gm, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    delete parsed.enabled;
    delete parsed.disabled;
    // Earlier Windows projections used `cmd.exe /c npx …` because native
    // hosts do not consistently resolve npm shims. That is the same provider
    // invocation as the portable adapter's `npx …`, not a user modification.
    if (parsed.command === "cmd.exe" && Array.isArray(parsed.args)) {
      const npx = parsed.args.findIndex((arg) => arg === "npx");
      if (npx >= 0 && parsed.args.slice(0, npx).every((arg) => typeof arg === "string")) {
        parsed.command = "npx";
        parsed.args = parsed.args.slice(npx + 1);
      }
    }
    // The old Windows projection pinned the bundled Playwright Chromium.
    // Preserve a user-selected browser, but regard that exact managed path as
    // equivalent to the portable default so an update does not overwrite it.
    if (Array.isArray(parsed.args)) {
      const args = [...parsed.args];
      for (let index = args.length - 2; index >= 0; index -= 1) {
        const flag = args[index];
        const candidate = args[index + 1];
        if ((flag === "--executable-path" || flag === "--executablePath")
          && typeof candidate === "string"
          && /ms-playwright[\\/]+chromium-\d+[\\/]+chrome-win64[\\/]+chrome\.exe$/i.test(candidate)) {
          args.splice(index, 2);
        }
      }
      parsed.args = args;
    }
    return JSON.stringify(parsed);
  } catch {
    return value.trim();
  }
}

function sameServerDefinition(host: HostName, left: string, right: string): boolean {
  return normalizedServerDefinition(host, left) === normalizedServerDefinition(host, right);
}

/** A user may pin a different version or add harmless host options for the
 * same MCP provider. Keep that entry untouched, but it still counts as a
 * visible native registration; only a different provider is a conflict. */
function isCompatibleProviderOverride(serverName: string, body: string): boolean {
  const signatures: Record<string, string> = {
    context7: "@upstash/context7-mcp",
    playwright: "@playwright/mcp",
    "chrome-devtools": "chrome-devtools-mcp",
    "codebase-memory": "codebase-memory-mcp",
  };
  const signature = signatures[serverName];
  return Boolean(signature) && body.includes(signature);
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
export async function buildConvergenceModel(
  repoRoot: string,
  host: HostName,
  env: NodeJS.ProcessEnv = process.env,
  profileOverride?: GlobalMcpProfile,
  integrationIds?: readonly string[],
): Promise<ConvergenceModel> {
  const inventory = await loadIntegrationInventory(repoRoot);
  const requested = integrationIds ? new Set(integrationIds) : null;
  const fingerprints: KnownAdapterFingerprint[] = [];
  const knownNames = new Set<string>();
  const legacyCommandPatterns: RegExp[] = [];
  for (const entry of inventory.mcps) {
    if (requested && !requested.has(entry.id)) continue;
    const adapter = findAdapterFile(repoRoot, entry.id, host);
    if (!adapter) continue;
    const raw = fs.readFileSync(adapter, "utf8");
    const expanded = expandPlaceholders(host, raw, env);
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
  const allSectionStarts = [...content.matchAll(/^\s*\[[^\]]+\]\s*$/gm)].map((match) => match.index!);
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]!;
    // A TOML MCP table ends at *any* subsequent section, not just another
    // mcp_servers table.  Without this, the final MCP falsely absorbs e.g.
    // [projects] and can never be safely recognized or migrated.
    const end = allSectionStarts.find((sectionIndex) => sectionIndex > start.index) ?? content.length;
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
        const cleanBlock = block.replace(/^\s*enabled\s*=.*$/gm, "").replace(/\n{2,}/g, "\n").replace(/\s+$/, "");
        const disabledBlock = `${cleanBlock}\nenabled = false\n\n`;
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
  const configPath = hostMcpConfigPath(host, env);
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
  const model = await buildConvergenceModel(repoRoot, host, env, profile, options.integrationIds);
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
 * Explicitly converge one host config to a selected registration profile.
 * This is no longer called by ordinary setup; it is retained for controlled
 * migration/disable operations and always backs up before mutation.
 * User-modified entries produce NEEDS_USER and never get deleted.
 */
export async function convergeHostMcpConfig(repoRoot: string, host: HostName, options: ConvergenceOptions = {}): Promise<HostConvergenceResult> {
  const env = options.env ?? process.env;
  const profile = options.globalMcpProfile ?? resolveGlobalMcpProfile(env);
  const configPath = hostMcpConfigPath(host, env);
  const base: HostConvergenceResult = { host, config_path: configPath, exists: false, status: "SKIPPED", entries: [] };
  // The former implementation changed a non-`none` profile into a disabled
  // configuration. That contradicts normal setup, whose job is registration.
  // Keep this legacy API strictly for an explicit removal migration until the
  // public `integration disable` owns a narrowly-scoped disable receipt.
  if (profile !== "none") {
    return {
      ...base,
      exists: fs.existsSync(configPath),
      error: "legacy convergence only supports the explicit global MCP profile none; use native registration for enabled providers",
    };
  }
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

export const ALL_MCP_HOSTS: readonly HostName[] = ["codex", "claude", "cursor", "antigravity", "grok", "opencode", "deepseek-harness", "command-code", "omp"];

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

/** Result of the normal setup-time registration. It deliberately does not
 * claim that a newly-opened GUI session has already connected or called a
 * tool; those are distinct observations made by the native adapter/doctor. */
export interface HostMcpRegistrationResult {
  host: HostName;
  configPath: string | null;
  status: "REGISTERED" | "NO_ADAPTER" | "NEEDS_USER" | "FAILED";
  registered: string[];
  conflicts: string[];
  backupPath?: string;
  backupReceipt?: string;
  error?: string;
}

export interface HostMcpRegistrationInspection {
  id: string;
  status: "MCP_REGISTERED" | "MCP_MISSING" | "MCP_DISABLED" | "MCP_NEEDS_USER";
  detail: string;
}

export interface HostMcpRegistrationInspectionResult {
  host: HostName;
  configPath: string | null;
  status: "REGISTERED" | "MISSING" | "NEEDS_USER" | "NO_ADAPTER" | "INVALID";
  entries: HostMcpRegistrationInspection[];
}

/** Names produced by an older projection which do not match the canonical
 * IntegrationRegistry key.  They are removable only when their complete
 * server definition is byte-for-byte our current adapter after normalization.
 * This avoids treating a user's similarly-named server as ours. */
const LEGACY_SERVER_ALIASES: Partial<Record<HostName, Record<string, string>>> = {
  codex: { chrome_devtools: "chrome-devtools" },
};

async function selectedMcpDefinitions(
  repoRoot: string,
  host: HostName,
  env: NodeJS.ProcessEnv,
  profile: GlobalMcpProfile,
  integrationIds?: readonly string[],
  ignoreExplicitDisable = false,
): Promise<Array<{ id: string; name: string; definition: string }>> {
  const inventory = await loadIntegrationInventory(repoRoot);
  const requested = integrationIds ? new Set(integrationIds) : null;
  const disabled = disabledRegistrationIds(env);
  const definitions: Array<{ id: string; name: string; definition: string }> = [];
  for (const entry of selectGlobalAdapterEntries(inventory, profile)) {
    if ((requested && !requested.has(entry.id)) || (!ignoreExplicitDisable && disabled.has(entry.id))) continue;
    const adapter = findAdapterFile(repoRoot, entry.id, host);
    if (!adapter) continue;
    const raw = expandPlaceholders(host, fs.readFileSync(adapter, "utf8"), env);
    for (const definition of serverDefinitionBodies(host, raw)) {
      definitions.push({ id: entry.id, name: definition.name, definition: definition.definition });
    }
  }
  return definitions;
}

/** Read-only registration inspection.  This deliberately reports config
 * exposure only; connection, registry visibility and a safe tool call remain
 * separate host-session observations. */
export async function inspectHostMcpRegistration(
  repoRoot: string,
  host: HostName,
  options: { env?: NodeJS.ProcessEnv; profile?: GlobalMcpProfile } = {},
): Promise<HostMcpRegistrationInspectionResult> {
  const env = options.env ?? process.env;
  if (host === "command-code") {
    const { readCommandCodeNative } = await import("../services/command-code-native.js");
    const native = readCommandCodeNative(hostHome(host, env));
    const entries = native.expectedMcpServerNames.map((id) => ({
      id,
      status: native.mcpComplete ? "MCP_REGISTERED" as const : "MCP_MISSING" as const,
      detail: native.mcpComplete
        ? `native Command Code config read back from ${native.mcpPath}`
        : `native Command Code registration is missing or incomplete at ${native.mcpPath}`,
    }));
    return { host, configPath: native.mcpPath, status: native.mcpComplete ? "REGISTERED" : "MISSING", entries };
  }
  if (host === "deepseek-harness") {
    const { NativeHostProbe } = await import("../native/probe.js");
    const { inspectDshNativeReadback } = await import("../services/deepseek-native.js");
    const native = inspectDshNativeReadback(await new NativeHostProbe().detect(host));
    const names = ["chrome-devtools", "codebase-memory", "context7", "playwright"];
    const entries = names.map((id) => ({
      id,
      status: native.nativeMcp && native.profiles.length > 0 ? "MCP_REGISTERED" as const : "MCP_MISSING" as const,
      detail: native.nativeMcp
        ? `native DSH Cordis row read back from ${native.profiles.join(", ")}`
        : "DSH native Cordis MCP rows are not fully observable from dump-config",
    }));
    return {
      host,
      configPath: path.join(hostHome(host, env), "profiles"),
      status: native.nativeMcp ? "REGISTERED" : "MISSING",
      entries,
    };
  }
  const profile = options.profile ?? resolveGlobalMcpProfile(env);
  const configPath = hostMcpConfigPath(host, env);
  if (profile === "none") return { host, configPath, status: "REGISTERED", entries: [] };
  try {
    const definitions = await selectedMcpDefinitions(repoRoot, host, env, profile, undefined, true);
    const explicitlyDisabled = disabledRegistrationIds(env);
    if (definitions.length === 0) return { host, configPath, status: "NO_ADAPTER", entries: [] };
    if (!fs.existsSync(configPath)) {
      return { host, configPath, status: "MISSING", entries: definitions.map((definition) => ({ id: definition.name, status: "MCP_MISSING", detail: `native config is absent: ${configPath}` })) };
    }
    const content = fs.readFileSync(configPath, "utf8");
    const observed = new Map(parseHostConfig(host, content).serverEntries.map((entry) => [entry.id, entry]));
    const entries = definitions.map((definition): HostMcpRegistrationInspection => {
      if (explicitlyDisabled.has(definition.id)) {
        return { id: definition.name, status: "MCP_DISABLED", detail: "disabled explicitly by the user through agent-rules integration settings" };
      }
      const entry = observed.get(definition.name);
      if (!entry) return { id: definition.name, status: "MCP_MISSING", detail: `not registered in ${configPath}` };
      if (entry.disabled && sameServerDefinition(host, entry.body, definition.definition)) return { id: definition.name, status: "MCP_DISABLED", detail: `registered but disabled in ${configPath}` };
      if (sameServerDefinition(host, entry.body, definition.definition)) return { id: definition.name, status: "MCP_REGISTERED", detail: `native registration read back from ${configPath}` };
      if (isCompatibleProviderOverride(definition.name, entry.body)) {
        return { id: definition.name, status: "MCP_REGISTERED", detail: `compatible user-owned provider override read back from ${configPath}; left unchanged` };
      }
      return { id: definition.name, status: "MCP_NEEDS_USER", detail: `same server name has user-modified definition in ${configPath}` };
    });
    const status = entries.some((entry) => entry.status === "MCP_NEEDS_USER") ? "NEEDS_USER"
      : entries.some((entry) => entry.status === "MCP_MISSING" || entry.status === "MCP_DISABLED") ? "MISSING"
        : "REGISTERED";
    return { host, configPath, status, entries };
  } catch {
    return { host, configPath, status: "INVALID", entries: [] };
  }
}

/**
 * Register the selected standard MCPs in the host's *native* configuration.
 * It is additive and fail-closed: a same-name entry that is not byte-equivalent
 * to our adapter is user-owned and is never overwritten. DSH and Command Code
 * use their dedicated native projectors, so this generic JSON/TOML writer does
 * not pretend their different lifecycle is interchangeable.
 */
export async function registerHostMcpAdapters(
  repoRoot: string,
  host: HostName,
  options: { env?: NodeJS.ProcessEnv; profile?: GlobalMcpProfile; integrationIds?: readonly string[] } = {},
): Promise<HostMcpRegistrationResult> {
  const env = options.env ?? process.env;
  if (host === "deepseek-harness" || host === "command-code") {
    return { host, configPath: null, status: "NO_ADAPTER", registered: [], conflicts: [] };
  }
  const profile = options.profile ?? resolveGlobalMcpProfile(env);
  if (profile === "none") return { host, configPath: hostMcpConfigPath(host, env), status: "REGISTERED", registered: [], conflicts: [] };
  try {
    const model = await buildConvergenceModel(repoRoot, host, env, profile, options.integrationIds);
    const definitions = await selectedMcpDefinitions(repoRoot, host, env, profile, options.integrationIds);
    const configPath = hostMcpConfigPath(host, env);
    if (definitions.length === 0) return { host, configPath, status: "NO_ADAPTER", registered: [], conflicts: [] };

    const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
    const parsed = content.trim().length === 0
      ? { serverEntries: [], disabled: false }
      : parseHostConfig(host, content);
    const current = new Map(parsed.serverEntries.map((entry) => [entry.id, entry]));
    const conflicts: string[] = [];
    const additions: typeof definitions = [];
    const aliasesToRemove: Array<{ id: string; body: string }> = [];
    for (const definition of definitions) {
      const observed = current.get(definition.name);
      if (!observed) {
        additions.push(definition);
      } else if (!sameServerDefinition(host, observed.body, definition.definition)) {
        // v2's idle-zero migration left agent-rules entries disabled. A
        // disabled entry that still points at an exact managed root/pkg is
        // safely recognizable as that migration, not a user replacement.
        const legacyOwned = observed.disabled
          && (model.fingerprints.some((known) => known.serverName === definition.name && sameServerDefinition(host, observed.body, known.body))
            || model.legacyCommandPatterns.some((pattern) => pattern.test(observed.body)));
        if (!legacyOwned && !isCompatibleProviderOverride(definition.name, observed.body)) conflicts.push(definition.name);
      }
    }
    const aliases = LEGACY_SERVER_ALIASES[host] ?? {};
    for (const observed of parsed.serverEntries) {
      const canonicalName = aliases[observed.id];
      if (!canonicalName) continue;
      const canonical = definitions.find((definition) => definition.name === canonicalName);
      // Normalize the legacy table key to the canonical key before the strict
      // definition comparison.  The key itself is intentionally the one
      // allowed difference; command, arguments and every other field must
      // still match exactly after disabled-marker normalization.
      const aliasAsCanonical = host === "codex"
        ? observed.body.replace(`[mcp_servers.${observed.id}]`, `[mcp_servers.${canonicalName}]`)
        : observed.body;
      if (!canonical || !sameServerDefinition(host, aliasAsCanonical, canonical.definition)) {
        conflicts.push(observed.id);
        continue;
      }
      aliasesToRemove.push({ id: observed.id, body: observed.body });
    }
    const conflictSet = new Set(conflicts);
    // A conflict blocks only that server.  Other managed servers (and a
    // provably-owned legacy alias) can still be repaired without overwriting
    // the user entry that needs a decision.
    const applicable = definitions.filter((definition) => !conflictSet.has(definition.name));
    const applicableAdditions = additions.filter((definition) => !conflictSet.has(definition.name));
    const refreshes = applicable.filter((definition) => current.get(definition.name)?.disabled === true);
    if (applicableAdditions.length === 0 && refreshes.length === 0 && aliasesToRemove.length === 0) {
      return {
        host,
        configPath,
        status: conflicts.length > 0 ? "NEEDS_USER" : "REGISTERED",
        registered: applicable.map((definition) => definition.name),
        conflicts,
      };
    }

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const backup = fs.existsSync(configPath) ? backupConfig(configPath, path.dirname(configPath)) : undefined;
    if (host === "codex") {
      let next = content;
      const starts = [...next.matchAll(/^\s*\[mcp_servers\.([^\]]+)\]\s*$/gm)]
        .map((match) => ({ name: match[1]!.trim(), index: match.index! }));
      const allSections = [...next.matchAll(/^\s*\[[^\]]+\]\s*$/gm)].map((match) => match.index!);
      const edits: Array<{ start: number; end: number; replacement: string }> = [];
      for (const refresh of refreshes) {
        const section = starts.find((candidate) => candidate.name === refresh.name);
        if (!section) continue;
        const end = allSections.find((index) => index > section.index) ?? next.length;
        edits.push({ start: section.index, end, replacement: `${refresh.definition}\n\n` });
      }
      for (const alias of aliasesToRemove) {
        const section = starts.find((candidate) => candidate.name === alias.id);
        if (!section) continue;
        const end = allSections.find((index) => index > section.index) ?? next.length;
        edits.push({ start: section.index, end, replacement: "" });
      }
      if (edits.length > 0) {
        let cursor = 0;
        let rewritten = "";
        for (const edit of edits.sort((left, right) => left.start - right.start)) {
          rewritten += next.slice(cursor, edit.start) + edit.replacement;
          cursor = edit.end;
        }
        next = rewritten + next.slice(cursor);
      }
      const appended = applicableAdditions.map((definition) => definition.definition).join("\n\n");
      fs.writeFileSync(configPath, `${next.trimEnd()}${next.trim() && appended ? "\n\n" : ""}${appended}${appended ? "\n" : ""}`, "utf8");
    } else {
      let config: Record<string, unknown> = {};
      if (content.trim()) {
        const value = JSON.parse(content) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("native MCP config must be a JSON object");
        config = value as Record<string, unknown>;
      }
      const key = host === "opencode" ? "mcp" : "mcpServers";
      const servers = config[key];
      if (servers !== undefined && (!servers || typeof servers !== "object" || Array.isArray(servers))) throw new Error(`native ${key} must be an object`);
      const next = { ...((servers ?? {}) as Record<string, unknown>) };
      for (const addition of [...applicableAdditions, ...refreshes]) next[addition.name] = JSON.parse(addition.definition);
      config[key] = next;
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    }
    const readback = parseHostConfig(host, fs.readFileSync(configPath, "utf8"));
    const missing = applicable.filter((definition) => !readback.serverEntries.some((entry) => entry.id === definition.name));
    if (missing.length > 0) return { host, configPath, status: "FAILED", registered: definitions.map((definition) => definition.name), conflicts: [], error: `readback missing ${missing.map((definition) => definition.name).join(", ")}` };
    return {
      host,
      configPath,
      status: conflicts.length > 0 ? "NEEDS_USER" : "REGISTERED",
      registered: applicable.map((definition) => definition.name),
      conflicts,
      ...(backup ? { backupPath: backup.backupPath, backupReceipt: backup.receiptPath } : {}),
    };
  } catch (error) {
    return { host, configPath: hostMcpConfigPath(host, env), status: "FAILED", registered: [], conflicts: [], error: error instanceof Error ? error.message : String(error) };
  }
}
