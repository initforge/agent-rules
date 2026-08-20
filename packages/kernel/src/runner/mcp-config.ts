import fs from 'node:fs';
import path from 'node:path';
import type { AgentKind } from './headless-executor.js';
import { posixJoin, toMcpCommandArgv, isWindows } from './platform.js';

/**
 * Materialise an MCP config for the spawned agent.
 *
 * Each agent runtime expects MCP servers declared in its own dialect:
 *
 *  - claude    `~/.claude.json` \`mcpServers\` map; loaded via \`--mcp-config\`
 *  - codex     \`~/.codex/config.toml\` \`[mcp_servers.X]\` tables; loaded from
 *               \`CODEX_HOME\` (a custom dir is the cleanest way to inject
 *               a per-task set without touching the user's real config).
 *  - opencode  \`opencode.json\` with \`mcp\` map; loaded from the explicit
 *               config path the opencode binary reads at startup.
 *
 * We materialise the requested integrations into a per-task directory
 * under \`<runRoot>/mcp/<taskId>/\` so two concurrent tasks cannot collide
 * on a shared MCP config and so the runner's MCP state is already excluded
 * from the diff (the runner's own paths).
 *
 * The configurations are read from the canonical integration policy tree
 * (`integrations/recommended|optional|manual/<id>/adapters/...`). The caller
 * normally points at `integrations/`; legacy direct policy roots remain
 * readable for compatibility.
 *
 * Returns per-agent config dir + file paths the caller can pass into the
 * agent invocation. Missing integration IDs are ignored with a warning
 * rather than failing the whole task — a future registry entry for a
 * brand-new integration should not block task dispatch.
 */

export interface McpConfigPaths {
  readonly dir: string;
  readonly claude?: { configPath: string };
  readonly codex?: { configDir: string; envVarName: string };
  readonly opencode?: { configPath: string };
  readonly resolved: readonly string[];
  readonly missing: readonly string[];
}

export interface MaterializeOptions {
  readonly registryRoot: string;
  readonly integrationIds: readonly string[];
}

const ADAPTER_FILES: Partial<Record<AgentKind, string>> = {
  claude: 'claude.json',
  codex: 'codex.toml',
  opencode: 'opencode.json',
};

const SHELL_METACHARS = /[;&|`${}<>\\!#*?"']/;

function safeServerName(name: string): string {
  return SHELL_METACHARS.test(name) ? '' : name;
}

function resolveIntegrationDir(registryRoot: string, integrationId: string): string | null {
  const direct = path.join(registryRoot, integrationId);
  if (fs.existsSync(direct)) return direct;
  for (const policy of ['recommended', 'optional', 'manual', 'required']) {
    const candidate = path.join(registryRoot, policy, integrationId);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readAdapter(registryRoot: string, integrationId: string, agent: AgentKind): { body: string; parser: 'json' | 'toml' } | null {
  const adapterFile = ADAPTER_FILES[agent];
  if (!adapterFile) return null;
  const integrationDir = resolveIntegrationDir(registryRoot, integrationId);
  if (!integrationDir) return null;
  const adapterPath = path.join(integrationDir, 'adapters', adapterFile);
  if (!fs.existsSync(adapterPath)) return null;
  const body = fs.readFileSync(adapterPath, 'utf8');
  const parser: 'json' | 'toml' = agent === 'codex' ? 'toml' : 'json';
  return { body, parser };
}

/**
 * Merge the claude adapter bodies (each is a `{ "mcpServers": { ... } }` JSON
 * document) into a single config that the spawned claude reads via
 * `--mcp-config`. The merge is shallow: if two integrations both declare a
 * server with the same key, the later one wins — that mirrors how the
 * platform installer (`platforms/claude/scripts/install-adapter.ps1`) treats
 * overlapping entries.
 */
function mergeClaudeAdapters(bodies: readonly string[]): { configPath: string; json: Record<string, unknown> } {
  const merged: { mcpServers: Record<string, unknown> } = { mcpServers: {} };
  for (const body of bodies) {
    try {
      const parsed = JSON.parse(body) as { mcpServers?: Record<string, unknown> };
      if (parsed && typeof parsed === 'object' && parsed.mcpServers) {
        for (const [name, def] of Object.entries(parsed.mcpServers)) {
          if (safeServerName(name)) {
            merged.mcpServers[name] = def;
          }
        }
      }
    } catch {
      /* ignore malformed adapter; the missing list will surface it */
    }
  }
  return { configPath: '', json: merged };
}

/**
 * Codex uses TOML; we parse just enough to extract the per-server keys we
 * need, then concatenate the sections into a fresh document. Each adapter
 * is `[mcp_servers.X]` followed by indented keys; the merge keeps the
 * first occurrence of each server name (registry order = install order).
 */
function mergeCodexAdapters(bodies: readonly string[]): string {
  const sections: string[] = [];
  for (const body of bodies) {
    const trimmed = body.trim();
    if (trimmed) sections.push(trimmed);
  }
  return sections.join('\n\n');
}

function mergeOpencodeAdapters(bodies: readonly string[]): Record<string, unknown> {
  const merged: { mcp: Record<string, unknown> } = { mcp: {} };
  for (const body of bodies) {
    try {
      const parsed = JSON.parse(body) as { mcpServers?: Record<string, unknown> };
      if (parsed && typeof parsed === 'object' && parsed.mcpServers) {
        for (const [name, raw] of Object.entries(parsed.mcpServers)) {
          if (!safeServerName(name) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
          const def = raw as Record<string, unknown>;
          // Registry adapters use the cross-host {command,args,env} shape.
          // OpenCode's current config requires local MCP command argv as one array.
          if (typeof def.command === 'string') {
            const args = Array.isArray(def.args) && def.args.every((item) => typeof item === 'string') ? def.args as string[] : [];
            merged.mcp[name] = {
              type: 'local',
              command: [def.command, ...args],
              enabled: def.enabled !== false,
              ...(def.cwd !== undefined ? { cwd: def.cwd } : {}),
              ...(def.env && typeof def.env === 'object' ? { environment: def.env } : {}),
            };
          } else if (Array.isArray(def.command)) {
            merged.mcp[name] = { type: 'local', ...def };
          }
        }
      }
    } catch {
      /* ignore malformed adapter; caller surfaces unresolved integrations */
    }
  }
  return merged;
}

/**
 * Materialise per-agent MCP config files for a task. Caller picks which
 * agent paths to forward to the agent invocation.
 */
export function materializeMcpConfig(outDir: string, opts: MaterializeOptions): McpConfigPaths {
  fs.mkdirSync(outDir, { recursive: true });

  const resolved: string[] = [];
  const missing: string[] = [];

  // Read every requested adapter once so each per-agent merge sees the same set.
  const claudeBodies: string[] = [];
  const codexBodies: string[] = [];
  const opencodeBodies: string[] = [];

  for (const id of opts.integrationIds) {
    let any = false;
    for (const agent of ['claude', 'codex', 'opencode'] as const) {
      const adapter = readAdapter(opts.registryRoot, id, agent);
      if (!adapter) continue;
      any = true;
      if (agent === 'claude') claudeBodies.push(adapter.body);
      else if (agent === 'codex') codexBodies.push(adapter.body);
      else opencodeBodies.push(adapter.body);
    }
    if (any) resolved.push(id);
    else missing.push(id);
  }

  const result: { -readonly [K in keyof McpConfigPaths]: McpConfigPaths[K] } = {
    dir: outDir,
    resolved,
    missing,
  };

  if (claudeBodies.length > 0) {
    const merged = mergeClaudeAdapters(claudeBodies);
    const configPath = path.join(outDir, 'claude.mcp.json');
    fs.writeFileSync(configPath, JSON.stringify(merged.json, null, 2), 'utf8');
    result.claude = { configPath };
  }
  if (codexBodies.length > 0) {
    const configDir = path.join(outDir, 'codex');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.toml');
    fs.writeFileSync(configPath, mergeCodexAdapters(codexBodies), 'utf8');
    // CODEX_HOME points codex at the directory holding config.toml.
    result.codex = { configDir, envVarName: 'CODEX_HOME' };
  }
  if (opencodeBodies.length > 0) {
    const merged = mergeOpencodeAdapters(opencodeBodies);
    // On Windows, paths in the opencode.json are written forward-slash so
    // the JSON loader does not have to deal with mixed backslashes. Spawn
    // args on Windows are still native; only the on-disk config content
    // is normalised.
    if (isWindows()) {
      const mcpRecord = merged.mcp as Record<string, { command?: unknown }>;
      for (const [name, def] of Object.entries(mcpRecord)) {
        if (Array.isArray(def.command)) {
          mcpRecord[name] = {
            ...def,
            command: toMcpCommandArgv(def.command as string[]),
          };
        }
      }
    }
    const configPath = path.join(outDir, 'opencode.json');
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    result.opencode = { configPath };
  }

  return result as McpConfigPaths;
}