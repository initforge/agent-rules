import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadIntegrationInventory } from "../integration/inventory.js";
import { resolveGlobalMcpProfile, selectGlobalAdapterEntries, type GlobalMcpProfile } from "../integration/mcp-profile.js";
import { resolveOmpAgentHome } from "../native/omp.js";
import { resolveRuntimeStateRoot } from "./locator.js";
import { resolveDependency } from "./dependency-resolver.js";

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
  return path.join(home, ".agent-rules", "current", "mcp-registration-preferences.json");
}

function legacyRegistrationPreferencesPath(env: NodeJS.ProcessEnv): string {
  const home = env.USERPROFILE || env.HOME || "";
  return path.join(home, ".agent-rules", "mcp-registration-preferences.json");
}

export function disabledRegistrationIds(env: NodeJS.ProcessEnv): Set<string> {
  for (const file of [registrationPreferencesPath(env), legacyRegistrationPreferencesPath(env)]) {
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<RegistrationPreferences>;
      if (value.schema !== "agent-rules/mcp-registration-preferences/v1") continue;
      return new Set(Array.isArray(value.disabled) ? value.disabled.filter((id): id is string => typeof id === "string") : []);
    } catch {
      // Try the legacy path, then default to no disabled registrations.
    }
  }
  return new Set();
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
  const legacy = legacyRegistrationPreferencesPath(env);
  try {
    const previous = JSON.parse(fs.readFileSync(legacy, "utf8")) as Partial<RegistrationPreferences>;
    if (previous.schema === "agent-rules/mcp-registration-preferences/v1") fs.rmSync(legacy, { force: true });
  } catch {
    // Unknown legacy state is retained rather than guessed away.
  }
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
  try {
    return resolveDependency({
      name: 'codebase-memory-mcp',
      env,
      envVar: 'CODEBASE_MEMORY_MCP_BIN',
      knownCandidates: [
        env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs", "codebase-memory-mcp", "codebase-memory-mcp.exe") : '',
        env.HOME ? path.join(env.HOME, ".local", "share", "codebase-memory-mcp", "codebase-memory-mcp") : '',
        env.HOME ? path.join(env.HOME, "Library", "Application Support", "codebase-memory-mcp", "codebase-memory-mcp") : '',
      ].filter(Boolean),
    })?.command ?? null;
  } catch {
    return null;
  }
}

/**
 * Canonical stdio definitions for the two hosts whose native APIs accept a
 * server object instead of an adapter document (Command Code and DSH/Cordis).
 * Registration itself remains owned by this module; callers must not write
 * generic MCP config files on their own.
 */
export function getStandardMcpServers(_home: string): Record<string, { command: string; args: string[]; env?: Record<string, string> }> {
  const codebaseMemory = resolveCodebaseMemoryBin() ?? 'codebase-memory-mcp';
  const npx = (args: string[]): { command: string; args: string[] } => process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npx', ...args] }
    : { command: 'npx', args };
  return {
    "codebase-memory": {
      command: codebaseMemory,
      args: [],
    },
    playwright: {
      ...npx(["-y", "@playwright/mcp@0.0.78", "--isolated"]),
    },
    "chrome-devtools": {
      ...npx(["-y", "chrome-devtools-mcp@1.7.0", "--isolated"]),
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

export function expandPlaceholders(host: HostName, body: string, env: NodeJS.ProcessEnv, repoRoot?: string): string {
  const bin = resolveCodebaseMemoryBin(env);
  let expanded = bin
    ? body.replaceAll("${CODEBASE_MEMORY_MCP_BIN}", host === "codex" ? bin.replaceAll("\\", "/") : bin.replaceAll("\\", "\\\\"))
    : body;
  if (host === "command-code") {
    const codebaseBin = resolveCodebaseMemoryBin(env) ?? 'codebase-memory-mcp';
    expanded = expanded
      .replaceAll("${COMMAND_CODE_CODEBASE_MEMORY_BIN}", codebaseBin.replaceAll("\\", "\\\\"));
  }
  const root = repoRoot ?? path.resolve('P:/agent-rules');
  const launcherPath = path.resolve(root, 'integrations', 'optional', 'pencil-mcp', 'launch.mjs');
  expanded = expanded.replaceAll('__AGENT_RULES_PENCIL_LAUNCHER__', host === 'codex' ? launcherPath.replaceAll('\\', '/') : launcherPath.replaceAll('\\', '\\\\'));
  // Canonical adapter files remain portable (`npx …`) so they can be consumed
  // by Linux/macOS runners and headless task overlays. Windows native clients
  // need an explicit cmd wrapper because npm shims are not reliably spawnable
  // from their stdio launchers; apply that dialect only at native projection.
  if (process.platform === "win32" && host !== "codex") {
    try {
      const parsed = JSON.parse(expanded) as { mcpServers?: Record<string, { command?: unknown; args?: unknown[] }>; mcp?: Record<string, { command?: unknown }> };
      for (const definition of Object.values(parsed.mcpServers ?? {})) {
        if (definition?.command === "npx") {
          definition.command = "cmd.exe";
          definition.args = ["/d", "/s", "/c", "npx", ...(Array.isArray(definition.args) ? definition.args : [])];
        }
      }
      for (const definition of Object.values(parsed.mcp ?? {})) {
        if (Array.isArray(definition?.command) && definition.command[0] === "npx") {
          definition.command = ["cmd.exe", "/d", "/s", "/c", ...definition.command];
        }
      }
      expanded = `${JSON.stringify(parsed, null, 2)}\n`;
    } catch {
      // A malformed adapter is rejected by its normal parser; do not invent a
      // Windows projection from an invalid source document.
    }
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
    // OpenCode's `local` type is implicit in its pre-1.x `command` + `args`
    // form. It is not a semantic provider difference, so omit it while
    // comparing an older managed projection with the current native shape.
    if (host === "opencode" && parsed.type === "local") delete parsed.type;
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
    // OpenCode's current dialect stores the whole argv in `command`, while
    // older projections used `{ command: 'npx', args: [...] }`. Compare both
    // to one portable argv form so a Windows cmd wrapper is still owned rather
    // than misclassified as a user edit.
    if (Array.isArray(parsed.command)) {
      const npx = parsed.command.findIndex((arg) => arg === "npx");
      if (npx >= 0 && parsed.command.slice(0, npx).every((arg) => typeof arg === "string")) {
        parsed.command = ["npx", ...parsed.command.slice(npx + 1)];
      }
    } else if (parsed.command === "npx" && Array.isArray(parsed.args)) {
      parsed.command = ["npx", ...parsed.args];
      delete parsed.args;
    }
    // The old Windows projection pinned the bundled Playwright Chromium.
    // Preserve a user-selected browser, but regard that exact managed path as
    // equivalent to the portable default so an update does not overwrite it.
    for (const key of ["args", "command"] as const) {
      if (!Array.isArray(parsed[key])) continue;
      const argv = [...parsed[key] as unknown[]];
      for (let index = argv.length - 2; index >= 0; index -= 1) {
        const flag = argv[index];
        const candidate = argv[index + 1];
        if ((flag === "--executable-path" || flag === "--executablePath")
          && typeof candidate === "string"
          && /ms-playwright[\\/]+chromium-\d+[\\/]+chrome-win64[\\/]+chrome\.exe$/i.test(candidate)) {
          argv.splice(index, 2);
        }
      }
      parsed[key] = argv;
    }
    return JSON.stringify(parsed);
  } catch {
    return value.trim();
  }
}

export function sameServerDefinition(host: HostName, left: string, right: string): boolean {
  return normalizedServerDefinition(host, left) === normalizedServerDefinition(host, right);
}

/** A user may pin a different version or add harmless host options for the
 * same MCP provider. Keep that entry untouched, but it still counts as a
 * visible native registration; only a different provider is a conflict. */
export function isCompatibleProviderOverride(serverName: string, body: string): boolean {
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

export function findAdapterFile(repoRoot: string, integrationId: string, host: HostName): string | null {
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
export function serverDefinitionBodies(host: HostName, body: string): Array<{ name: string; definition: string }> {
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
    const expanded = expandPlaceholders(host, raw, env, repoRoot);
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
  // Compare through the host dialect normalizer instead of raw hashes. An
  // older agent-rules OpenCode projection may use `command` + `args`, while
  // the current native dialect stores one argv array (and Windows wraps npm
  // shims). Those are the same owned provider invocation.
  const fingerprint = model.fingerprints.find((known) => known.serverName === entry.id
    && sameServerDefinition(known.host as HostName, entry.body, known.body));
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

export function backupConfig(configPath: string, host: HostName, stateRoot = resolveRuntimeStateRoot()): { backupPath: string; receiptPath: string } {
  const backupDir = path.join(stateRoot, "rollback", host, "mcp");
  const receiptPath = path.join(backupDir, "receipt.json");
  if (fs.existsSync(backupDir)) {
    let owned = false;
    try {
      const previous = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as { schema?: unknown; host?: unknown; config_path?: unknown };
      owned = previous.schema === "agent-rules/mcp-backup/v1" && previous.host === host && path.resolve(String(previous.config_path)) === path.resolve(configPath);
    } catch {
      owned = false;
    }
    if (!owned) throw new Error(`Refusing to replace unowned MCP rollback state: ${backupDir}`);
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, path.basename(configPath));
  const existed = fs.existsSync(configPath);
  const bytes = existed ? fs.readFileSync(configPath) : null;
  if (bytes) fs.writeFileSync(backupPath, bytes);
  const receipt = {
    schema: "agent-rules/mcp-backup/v1",
    version: 1,
    host,
    backed_up_at: new Date().toISOString(),
    config_path: configPath,
    backup_path: backupPath,
    existed,
    sha256: bytes ? createHash("sha256").update(bytes).digest("hex") : null,
    reason: "pre-convergence backup before agent-rules MCP entry removal/disable",
  };
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  return { backupPath, receiptPath };
}

export function sealConfigBackup(receiptPath: string, configPath: string): void {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
  if (receipt.schema !== 'agent-rules/mcp-backup/v1' || path.resolve(String(receipt.config_path)) !== path.resolve(configPath)) {
    throw new Error(`Invalid MCP rollback receipt while sealing applied bytes: ${receiptPath}`);
  }
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) throw new Error(`MCP config missing after projection: ${configPath}`);
  receipt.applied_sha256 = createHash('sha256').update(fs.readFileSync(configPath)).digest('hex');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

export function restoreHostMcpBackup(host: HostName, env: NodeJS.ProcessEnv = process.env): boolean {
  const home = env.USERPROFILE || env.HOME || '';
  const backupDir = path.join(home || resolveRuntimeStateRoot(), home ? '.agent-rules' : '', 'rollback', host, 'mcp');
  const receiptPath = path.join(backupDir, 'receipt.json');
  if (!fs.existsSync(receiptPath)) return false;
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as {
    schema?: unknown;
    host?: unknown;
    config_path?: unknown;
    backup_path?: unknown;
    existed?: unknown;
    sha256?: unknown;
    applied_sha256?: unknown;
  };
  if (receipt.schema !== 'agent-rules/mcp-backup/v1' || receipt.host !== host || typeof receipt.config_path !== 'string' || typeof receipt.backup_path !== 'string') {
    throw new Error(`Invalid MCP rollback ownership receipt: ${receiptPath}`);
  }
  const configPath = path.resolve(receipt.config_path);
  const backupPath = path.resolve(receipt.backup_path);
  if (!backupPath.startsWith(`${path.resolve(backupDir)}${path.sep}`)) throw new Error(`MCP rollback path escapes owned state: ${backupPath}`);
  if (typeof receipt.applied_sha256 !== 'string') throw new Error(`MCP rollback receipt does not identify the applied config bytes: ${receiptPath}`);
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) throw new Error(`MCP config changed or disappeared after installation: ${configPath}`);
  const appliedDigest = createHash('sha256').update(fs.readFileSync(configPath)).digest('hex');
  if (appliedDigest !== receipt.applied_sha256) throw new Error(`MCP config changed after installation; refusing to overwrite user changes: ${configPath}`);
  if (receipt.existed === true) {
    if (!fs.existsSync(backupPath)) throw new Error(`MCP rollback bytes are missing: ${backupPath}`);
    const bytes = fs.readFileSync(backupPath);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (receipt.sha256 !== digest) throw new Error(`MCP rollback bytes do not match receipt: ${backupPath}`);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const temporary = `${configPath}.${process.pid}.rollback`;
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, configPath);
  } else if (receipt.existed === false) {
    fs.rmSync(configPath, { force: true });
  } else {
    throw new Error(`MCP rollback receipt lacks original existence state: ${receiptPath}`);
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
  return true;
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
  const stateHome = env.USERPROFILE || env.HOME;
  const backup = backupConfig(configPath, host, stateHome ? path.join(stateHome, '.agent-rules') : resolveRuntimeStateRoot());
  let applied: { changed: boolean };
  try {
    applied = applyConvergence(host, configPath, parsed.serverEntries, dispositions);
    if (applied.changed) sealConfigBackup(backup.receiptPath, configPath);
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

export { inspectHostMcpRegistration, registerHostMcpAdapters, type HostMcpRegistrationInspection, type HostMcpRegistrationInspectionResult, type HostMcpRegistrationResult } from "./mcp-registration.js";
