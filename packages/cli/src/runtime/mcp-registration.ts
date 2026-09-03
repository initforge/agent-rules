import fs from "node:fs";
import path from "node:path";
import { loadIntegrationInventory } from "../integration/inventory.js";
import { resolveGlobalMcpProfile, selectGlobalAdapterEntries, type GlobalMcpProfile } from "../integration/mcp-profile.js";
import {
  backupConfig,
  buildConvergenceModel,
  disabledRegistrationIds,
  expandPlaceholders,
  findAdapterFile,
  hostHome,
  hostMcpConfigPath,
  isCompatibleProviderOverride,
  parseHostConfig,
  sameServerDefinition,
  sealConfigBackup,
  serverDefinitionBodies,
  type HostName,
} from "./mcp-convergence.js";

/** Normal setup registration is deliberately separate from legacy convergence:
 * this module owns adding and inspecting the standard providers, while
 * mcp-convergence owns the explicit migration/disable path. */
export interface HostMcpRegistrationResult {
  host: HostName;
  configPath: string | null;
  status: "REGISTERED" | "NO_ADAPTER" | "NEEDS_USER" | "FAILED";
  registered: string[];
  conflicts: string[];
  needsAction?: string[];
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
 * IntegrationRegistry key. They are removed only after strict equivalence. */
const LEGACY_SERVER_ALIASES: Partial<Record<HostName, Record<string, string>>> = {
  codex: { chrome_devtools: "chrome-devtools" },
};

/** v3.0 wrote this exact OMP entry before the provider was resolved to its
 * managed binary. Treat only that narrow, argument-free shape as ours so it
 * can be repaired; any user options or another command stay user-owned. */
function isLegacyOmpCodebaseMemory(host: HostName, name: string, body: string): boolean {
  if (host !== "omp" || name !== "codebase-memory") return false;
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    return value.command === "codebase-memory-mcp"
      && Array.isArray(value.args)
      && value.args.length === 0
      && Object.keys(value).every((key) => key === "command" || key === "args");
  } catch {
    return false;
  }
}

async function selectedMcpDefinitions(
  repoRoot: string,
  host: HostName,
  env: NodeJS.ProcessEnv,
  profile: GlobalMcpProfile,
  integrationIds?: readonly string[],
  ignoreExplicitDisable = false,
): Promise<{ definitions: Array<{ id: string; name: string; definition: string }>; unavailable: string[] }> {
  const inventory = await loadIntegrationInventory(repoRoot);
  const requested = integrationIds ? new Set(integrationIds) : null;
  const disabled = disabledRegistrationIds(env);
  const definitions: Array<{ id: string; name: string; definition: string }> = [];
  const unavailable: string[] = [];
  for (const entry of selectGlobalAdapterEntries(inventory, profile)) {
    if ((requested && !requested.has(entry.id)) || (!ignoreExplicitDisable && disabled.has(entry.id))) continue;
    const adapter = findAdapterFile(repoRoot, entry.id, host);
    if (!adapter) continue;
    const raw = expandPlaceholders(host, fs.readFileSync(adapter, "utf8"), env, repoRoot);
    const unresolved = [...raw.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((match) => match[1]!);
    if (unresolved.length > 0) {
      unavailable.push(`${entry.id}: missing ${[...new Set(unresolved)].join(', ')}`);
      continue;
    }
    for (const definition of serverDefinitionBodies(host, raw)) {
      definitions.push({ id: entry.id, name: definition.name, definition: definition.definition });
    }
  }
  return { definitions, unavailable };
}

/** Reads host exposure only. A fresh session connection, tool visibility, and
 * a safe tool call are separate observations made by native adapters. */
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
    const selected = await selectedMcpDefinitions(repoRoot, host, env, profile, undefined, true);
    const definitions = selected.definitions;
    const explicitlyDisabled = disabledRegistrationIds(env);
    if (definitions.length === 0 && selected.unavailable.length === 0) return { host, configPath, status: "NO_ADAPTER", entries: [] };
    if (!fs.existsSync(configPath)) {
      return { host, configPath, status: selected.unavailable.length > 0 ? "NEEDS_USER" : "MISSING", entries: [
        ...selected.unavailable.map((detail) => ({ id: detail.split(':')[0]!, status: "MCP_NEEDS_USER" as const, detail })),
        ...definitions.map((definition) => ({ id: definition.name, status: "MCP_MISSING" as const, detail: `native config is absent: ${configPath}` })),
      ] };
    }
    const content = fs.readFileSync(configPath, "utf8");
    const observed = new Map(parseHostConfig(host, content).serverEntries.map((entry) => [entry.id, entry]));
    const entries: HostMcpRegistrationInspection[] = [
      ...selected.unavailable.map((detail) => ({ id: detail.split(':')[0]!, status: "MCP_NEEDS_USER" as const, detail })),
      ...definitions.map((definition): HostMcpRegistrationInspection => {
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
      }),
    ];
    const status = entries.some((entry) => entry.status === "MCP_NEEDS_USER") ? "NEEDS_USER"
      : entries.some((entry) => entry.status === "MCP_MISSING" || entry.status === "MCP_DISABLED") ? "MISSING"
        : "REGISTERED";
    return { host, configPath, status, entries };
  } catch {
    return { host, configPath, status: "INVALID", entries: [] };
  }
}

/** Adds standard MCP adapters without overwriting a user-owned same-name
 * entry. Dedicated DSH and Command Code projectors keep ownership of their
 * different native lifecycles. */
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
    const selected = await selectedMcpDefinitions(repoRoot, host, env, profile, options.integrationIds);
    const definitions = selected.definitions;
    const configPath = hostMcpConfigPath(host, env);
    if (definitions.length === 0) return { host, configPath, status: selected.unavailable.length > 0 ? "NEEDS_USER" : "NO_ADAPTER", registered: [], conflicts: [], needsAction: selected.unavailable };
    const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
    const parsed = content.trim().length === 0 ? { serverEntries: [], disabled: false } : parseHostConfig(host, content);
    const current = new Map(parsed.serverEntries.map((entry) => [entry.id, entry]));
    const conflicts: string[] = [];
    const additions: typeof definitions = [];
    for (const definition of definitions) {
      const observed = current.get(definition.name);
      if (!observed) additions.push(definition);
      else if (!sameServerDefinition(host, observed.body, definition.definition)) {
        const legacyOwned = isLegacyOmpCodebaseMemory(host, definition.name, observed.body)
          || observed.body.includes('__AGENT_RULES_PENCIL_LAUNCHER__')
          || (observed.disabled
            && (model.fingerprints.some((known) => known.serverName === definition.name && sameServerDefinition(host, observed.body, known.body))
              || model.legacyCommandPatterns.some((pattern) => pattern.test(observed.body))));
        if (!legacyOwned && !isCompatibleProviderOverride(definition.name, observed.body)) conflicts.push(definition.name);
      }
    }
    const aliasesToRemove: Array<{ id: string; body: string }> = [];
    for (const observed of parsed.serverEntries) {
      const canonicalName = LEGACY_SERVER_ALIASES[host]?.[observed.id];
      if (!canonicalName) continue;
      const canonical = definitions.find((definition) => definition.name === canonicalName);
      const aliasAsCanonical = host === "codex"
        ? observed.body.replace(`[mcp_servers.${observed.id}]`, `[mcp_servers.${canonicalName}]`)
        : observed.body;
      if (!canonical || !sameServerDefinition(host, aliasAsCanonical, canonical.definition)) conflicts.push(observed.id);
      else aliasesToRemove.push({ id: observed.id, body: observed.body });
    }
    const conflictSet = new Set(conflicts);
    const applicable = definitions.filter((definition) => !conflictSet.has(definition.name));
    const applicableAdditions = additions.filter((definition) => !conflictSet.has(definition.name));
    const refreshes = applicable.filter((definition) => {
      const observed = current.get(definition.name);
      return observed?.disabled === true
        || (observed !== undefined && isLegacyOmpCodebaseMemory(host, definition.name, observed.body))
        || (observed !== undefined && observed.body.includes('__AGENT_RULES_PENCIL_LAUNCHER__'));
    });
    if (applicableAdditions.length === 0 && refreshes.length === 0 && aliasesToRemove.length === 0) {
      return { host, configPath, status: conflicts.length > 0 || selected.unavailable.length > 0 ? "NEEDS_USER" : "REGISTERED", registered: applicable.map((definition) => definition.name), conflicts, needsAction: selected.unavailable };
    }
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const stateHome = env.USERPROFILE || env.HOME;
    const backup = backupConfig(configPath, host, stateHome ? path.join(stateHome, '.agent-rules') : undefined);
    if (host === "codex") {
      let next = content;
      const starts = [...next.matchAll(/^\s*\[mcp_servers\.([^\]]+)\]\s*$/gm)].map((match) => ({ name: match[1]!.trim(), index: match.index! }));
      const allSections = [...next.matchAll(/^\s*\[[^\]]+\]\s*$/gm)].map((match) => match.index!);
      const edits: Array<{ start: number; end: number; replacement: string }> = [];
      for (const refresh of refreshes) {
        const section = starts.find((candidate) => candidate.name === refresh.name);
        if (!section) continue;
        edits.push({ start: section.index, end: allSections.find((index) => index > section.index) ?? next.length, replacement: `${refresh.definition}\n\n` });
      }
      for (const alias of aliasesToRemove) {
        const section = starts.find((candidate) => candidate.name === alias.id);
        if (!section) continue;
        edits.push({ start: section.index, end: allSections.find((index) => index > section.index) ?? next.length, replacement: "" });
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
    sealConfigBackup(backup.receiptPath, configPath);
    const readback = parseHostConfig(host, fs.readFileSync(configPath, "utf8"));
    const missing = applicable.filter((definition) => !readback.serverEntries.some((entry) => entry.id === definition.name));
    if (missing.length > 0) return { host, configPath, status: "FAILED", registered: definitions.map((definition) => definition.name), conflicts: [], error: `readback missing ${missing.map((definition) => definition.name).join(", ")}` };
    return { host, configPath, status: conflicts.length > 0 || selected.unavailable.length > 0 ? "NEEDS_USER" : "REGISTERED", registered: applicable.map((definition) => definition.name), conflicts, needsAction: selected.unavailable, backupPath: backup.backupPath, backupReceipt: backup.receiptPath };
  } catch (error) {
    return { host, configPath: hostMcpConfigPath(host, env), status: "FAILED", registered: [], conflicts: [], error: error instanceof Error ? error.message : String(error) };
  }
}
