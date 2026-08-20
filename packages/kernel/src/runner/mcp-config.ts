import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentKind } from './headless-executor.js';
import { posixJoin, toMcpCommandArgv, isWindows } from './platform.js';
import { checkPencilDesktopApp, discoverPencilNativeServer, pencilServerAsAdapter } from './pencil-native.js';

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
  /** Visibility mode applied to interactive browser/design MCPs. */
  readonly visibilityMode: McpVisibilityMode;
  /** Preflight receipt proving that visible MCP dispatch was permitted. */
  readonly visibilityReceiptPath?: string;
  readonly interactiveIntegrations: readonly string[];
}

export type McpVisibilityMode = 'visible' | 'headless' | 'foreground';

/** AM-0006: explicit focus-safe binding for interactive GUI MCP launches. */
export interface FocusBinding {
  /** Exact X11 window id of the originating OpenCode session window. */
  readonly sourceWindowId?: string;
  /** Explicit workspace index (owner-provided binding). */
  readonly targetWorkspace?: number;
  /** OpenCode session id when known. */
  readonly sessionId?: string;
  /**
   * Explicit legacy opt-out: materialize without the focus guardian. Never set
   * for interactive visible work in production paths; exists for headless
   * runner agents and unit tests that only inspect config merging.
   */
  readonly allowUnbound?: boolean;
}

export type McpFocusPolicy = 'preserve' | 'allow-activate';

export function normalizeVisibilityMode(mode: McpVisibilityMode): 'visible' | 'headless' {
  return mode === 'foreground' ? 'visible' : mode;
}

export interface MaterializeOptions {
  readonly registryRoot: string;
  readonly integrationIds: readonly string[];
  /** Visible is the safe default; headless must be an explicit CI choice. */
  readonly visibilityMode?: McpVisibilityMode;
  /** AM-0006: focus preservation policy for interactive GUI MCPs. */
  readonly focusPolicy?: McpFocusPolicy;
  /** AM-0006: source-workspace binding; required for focus-safe visible GUI MCPs. */
  readonly focusBinding?: FocusBinding;
  /** Test/host override for deterministic display preflight. */
  readonly visibilityEnv?: NodeJS.ProcessEnv;
  readonly visibilityPlatform?: NodeJS.Platform;
  /** Test/host override for locating the operator's real Pencil configuration. */
  readonly pencilNativeEnv?: NodeJS.ProcessEnv;
  readonly pencilNativeHome?: string;
  /** The actual host this task runs under; used to fail closed for Pencil discovery. */
  readonly activeAgent?: AgentKind;
  /**
   * REQ-011 remote-MCP isolation: remote (url-based) MCP servers are refused
   * unless the task policy explicitly allows network for a routed integration.
   * Default false (fail closed): no task-local config may silently connect to
   * a remote MCP endpoint.
   */
  readonly allowRemoteMcp?: boolean;
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

const KNOWN_INTERACTIVE_MCP_IDS = new Set(['playwright-mcp', 'chrome-devtools-mcp', 'pencil-mcp']);

interface IntegrationPolicyRecord {
  id?: string;
  kind?: string;
  capabilities?: unknown;
}

function readIntegrationPolicy(registryRoot: string, integrationId: string): IntegrationPolicyRecord | null {
  const file = path.join(registryRoot, 'registry.json');
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { integrations?: IntegrationPolicyRecord[] };
    return parsed.integrations?.find((entry) => entry?.id === integrationId) ?? null;
  } catch {
    return null;
  }
}

function requiresForegroundVisibility(registryRoot: string, integrationId: string): boolean {
  const policy = readIntegrationPolicy(registryRoot, integrationId);
  if (policy) {
    const capabilities = Array.isArray(policy.capabilities) ? policy.capabilities : [];
    return policy.kind === 'mcp' && capabilities.some((capability) => typeof capability === 'string' && /^(?:browser|design)\./.test(capability));
  }
  // Compatibility fallback for isolated test registries and older installations.
  return KNOWN_INTERACTIVE_MCP_IDS.has(integrationId);
}

export interface VisibleMcpHostCheck {
  readonly available: boolean;
  readonly reason: string;
}

/**
 * A foreground MCP is only meaningful on an operator-visible desktop. CI is
 * headless by policy, even when it happens to expose Xvfb/DISPLAY. Hosts may
 * explicitly certify a visible CI desktop, but that opt-in is never inferred.
 */
export function checkVisibleMcpHost(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): VisibleMcpHostCheck {
  const ci = env.CI === 'true' || env.CI === '1' || env.AGENT_RULES_CI === '1';
  if (ci && env.AGENT_RULES_VISIBLE_MCP_CI !== '1') {
    return { available: false, reason: 'CI is headless by policy; use explicit mcp visibility mode=headless for CI evidence' };
  }
  if (env.AGENT_RULES_VISIBLE_MCP === '0') {
    return { available: false, reason: 'AGENT_RULES_VISIBLE_MCP=0 disabled the operator-visible MCP surface' };
  }
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) {
    return { available: false, reason: 'Linux has no DISPLAY or WAYLAND_DISPLAY for a foreground application' };
  }
  if (platform === 'win32' && env.SESSIONNAME?.toLowerCase() === 'services') {
    return { available: false, reason: 'Windows service session cannot expose a foreground application to the operator' };
  }
  return { available: true, reason: `foreground desktop available on ${platform}` };
}

function isCiEnvironment(env: NodeJS.ProcessEnv): boolean {
  return env.CI === 'true' || env.CI === '1' || env.AGENT_RULES_CI === '1';
}

function withVisibilityEnv(definition: Record<string, unknown>, mode: McpVisibilityMode): Record<string, unknown> {
  const current = definition.env && typeof definition.env === 'object' && !Array.isArray(definition.env)
    ? definition.env as Record<string, unknown>
    : {};
  return {
    ...definition,
    env: {
      ...current,
      AGENT_RULES_MCP_VISIBILITY: mode,
    },
  };
}

/**
 * AM-0006: resolve the guardian executable path. The kernel build copies
 * src/runner/mcp-guardian.mjs into dist/runner/, so a compiled caller can
 * always resolve it next to this module.
 */
export function mcpGuardianPath(): string {
  const url = new URL('./mcp-guardian.mjs', import.meta.url);
  return fileURLToPath(url);
}

export interface GuardianBindingEnv {
  readonly policy: McpFocusPolicy;
  readonly visibility: 'visible' | 'headless';
  readonly sourceWindowId?: string;
  readonly targetWorkspace?: number;
  readonly sessionId?: string;
}

/**
 * Wrap an interactive server command with the focus guardian. The guardian is
 * always the outermost argv entry: `node mcp-guardian.mjs <real command ...>`.
 * Binding fields are merged into the server definition's environment by the
 * per-agent transforms (claude env / codex env section / opencode environment).
 */
export function wrapWithGuardian(command: readonly string[]): string[] {
  return ['node', mcpGuardianPath(), ...command];
}

export function focusGuardEnv(binding: GuardianBindingEnv): Record<string, string> {
  const env: Record<string, string> = {
    AGENT_RULES_MCP_FOCUS_POLICY: binding.policy,
    AGENT_RULES_MCP_VISIBILITY: binding.visibility,
  };
  if (binding.sourceWindowId) env.AGENT_RULES_SOURCE_WINDOW_ID = binding.sourceWindowId;
  if (binding.targetWorkspace !== undefined) env.AGENT_RULES_TARGET_WORKSPACE = String(binding.targetWorkspace);
  if (binding.sessionId) env.AGENT_RULES_MCP_SESSION_ID = binding.sessionId;
  return env;
}

/**
 * Effective guardian env for a materialized config. Returns null when the
 * interactive server must NOT be wrapped (headless mode, or explicit
 * allowUnbound legacy opt-out).
 */
export function guardianEnvFor(opts: MaterializeOptions): GuardianBindingEnv | null {
  const visibility = normalizeVisibilityMode(opts.visibilityMode ?? 'visible');
  if (visibility === 'headless') {
    return { policy: opts.focusPolicy ?? 'preserve', visibility: 'headless' };
  }
  const binding = opts.focusBinding;
  if (!binding) return null;
  if (binding.allowUnbound === true) return null;
  const hasIdentity = binding.sourceWindowId !== undefined || binding.targetWorkspace !== undefined;
  if (!hasIdentity) return null;
  return {
    policy: opts.focusPolicy ?? 'preserve',
    visibility,
    sourceWindowId: binding.sourceWindowId,
    targetWorkspace: binding.targetWorkspace,
    sessionId: binding.sessionId,
  };
}

/**
 * AM-0006 fail-closed rule: focus-safe visible interactive GUI MCPs require a
 * trustworthy source binding. Unbound visible launches would place the GUI on
 * an unknown workspace and risk stealing focus, so they are refused here.
 */
function assertFocusSafeDispatch(opts: MaterializeOptions, interactiveIntegrations: readonly string[]): GuardianBindingEnv | null {
  const visibility = normalizeVisibilityMode(opts.visibilityMode ?? 'visible');
  if (visibility === 'headless' || interactiveIntegrations.length === 0) return null;
  const binding = opts.focusBinding;
  if (binding?.allowUnbound === true) return null;
  const hasIdentity = binding && (binding.sourceWindowId !== undefined || binding.targetWorkspace !== undefined);
  if (!hasIdentity) {
    throw new Error(
      `visible interactive MCP blocked (AM-0006): no focus-safe source binding for integrations=${interactiveIntegrations.join(', ')}; ` +
      'set focusBinding.sourceWindowId/targetWorkspace or use an explicit CI headless profile',
    );
  }
  if ((opts.focusPolicy ?? 'preserve') !== 'preserve' && (opts.focusPolicy ?? 'preserve') !== 'allow-activate') {
    throw new Error(`invalid focusPolicy ${String(opts.focusPolicy)}; expected preserve or allow-activate`);
  }
  return guardianEnvFor(opts)!;
}

function transformInteractiveArgs(integrationId: string, args: readonly string[], mode: McpVisibilityMode): string[] {
  const next = [...args].filter((arg) => mode === 'foreground' || mode === 'visible' ? arg !== '--headless' : true);
  const browserProvider = integrationId === 'playwright-mcp' || integrationId === 'chrome-devtools-mcp';
  if (mode === 'headless' && browserProvider && !next.includes('--headless')) next.push('--headless');
  return next;
}

function withFocusGuardEnv(definition: Record<string, unknown>, guardian: GuardianBindingEnv): Record<string, unknown> {
  const current = definition.env && typeof definition.env === 'object' && !Array.isArray(definition.env)
    ? definition.env as Record<string, unknown>
    : {};
  return {
    ...definition,
    env: {
      ...current,
      ...focusGuardEnv(guardian),
    },
  };
}

function transformJsonAdapter(body: string, integrationId: string, mode: McpVisibilityMode, interactive: boolean, guardian: GuardianBindingEnv | null): string {
  if (!interactive) return body;
  const parsed = JSON.parse(body) as { mcpServers?: Record<string, unknown> };
  for (const [name, raw] of Object.entries(parsed.mcpServers ?? {})) {
    if (!safeServerName(name) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const definition = raw as Record<string, unknown>;
    if (typeof definition.command === 'string' && Array.isArray(definition.args)) {
      const wrapped = guardian ? wrapWithGuardian([definition.command, ...transformInteractiveArgs(integrationId, definition.args.filter((arg): arg is string => typeof arg === 'string'), mode)]) : undefined;
      parsed.mcpServers![name] = withVisibilityEnv({
        ...definition,
        ...(wrapped ? { command: wrapped[0], args: wrapped.slice(1) } : { args: transformInteractiveArgs(integrationId, definition.args.filter((arg): arg is string => typeof arg === 'string'), mode) }),
      }, mode);
      if (guardian) parsed.mcpServers![name] = withFocusGuardEnv(parsed.mcpServers![name] as Record<string, unknown>, guardian);
    } else if (Array.isArray(definition.command)) {
      const args = transformInteractiveArgs(integrationId, definition.command.slice(1).filter((arg): arg is string => typeof arg === 'string'), mode);
      parsed.mcpServers![name] = withVisibilityEnv({
        ...definition,
        command: guardian ? wrapWithGuardian([String(definition.command[0] ?? ''), ...args]) : [String(definition.command[0] ?? ''), ...args],
      }, mode);
      if (guardian) parsed.mcpServers![name] = withFocusGuardEnv(parsed.mcpServers![name] as Record<string, unknown>, guardian);
    }
  }
  return JSON.stringify(parsed, null, 2);
}

function tomlQuotedValues(value: string): string[] {
  const values: string[] = [];
  const pattern = /'([^']*)'|"((?:\\.|[^"\\])*)"/g;
  for (const match of value.matchAll(pattern)) values.push(match[1] ?? match[2] ?? '');
  return values;
}

function transformTomlAdapter(body: string, integrationId: string, mode: McpVisibilityMode, interactive: boolean, guardian: GuardianBindingEnv | null): string {
  if (!interactive) return body;
  const commandMatch = /^command\s*=\s*['"]([^'"]+)['"]\s*$/m.exec(body);
  const command = commandMatch?.[1] ?? '';
  let next = body;
  if (guardian && command) {
    next = next.replace(/^command\s*=\s*['"]([^'"]+)['"]\s*$/m, "command = 'node'");
  }
  next = next.replace(/(^args\s*=\s*\[)([^\]]*)(\])/m, (_whole, prefix: string, values: string, suffix: string) => {
    const args = transformInteractiveArgs(integrationId, tomlQuotedValues(values), mode);
    const final = guardian && command ? [mcpGuardianPath(), command, ...args] : args;
    return `${prefix}${final.map((arg) => `'${arg.replaceAll("'", "\\'")}'`).join(', ')}${suffix}`;
  });
  if (guardian) {
    const envLines = Object.entries(focusGuardEnv(guardian)).map(([key, value]) => `${key} = '${value.replaceAll("'", "\\'")}'`).join('\n');
    if (envLines) next = `${next}\n\n[env]\n${envLines}`;
  }
  return next;
}

function transformAdapter(body: string, parser: 'json' | 'toml', integrationId: string, mode: McpVisibilityMode, interactive: boolean, guardian: GuardianBindingEnv | null): string {
  try {
    return parser === 'json'
      ? transformJsonAdapter(body, integrationId, mode, interactive, guardian)
      : transformTomlAdapter(body, integrationId, mode, interactive, guardian);
  } catch {
    // A malformed adapter must remain visible to the normal missing/strict
    // integration checks; never silently produce a guessed config.
    return body;
  }
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

function readAdapter(
  registryRoot: string,
  integrationId: string,
  agent: AgentKind,
  pencilNativeEnv?: NodeJS.ProcessEnv,
  pencilNativeHome?: string,
): { body: string; parser: 'json' | 'toml' } | null {
  const adapterFile = ADAPTER_FILES[agent];
  if (!adapterFile) return null;
  const parser: 'json' | 'toml' = agent === 'codex' ? 'toml' : 'json';
  if (integrationId === 'pencil-mcp') {
    const native = discoverPencilNativeServer(agent, pencilNativeEnv ?? process.env, pencilNativeHome);
    return native ? { body: pencilServerAsAdapter(native, agent), parser } : null;
  }
  const integrationDir = resolveIntegrationDir(registryRoot, integrationId);
  if (!integrationDir) return null;
  const adapterPath = path.join(integrationDir, 'adapters', adapterFile);
  if (!fs.existsSync(adapterPath)) return null;
  return { body: fs.readFileSync(adapterPath, 'utf8'), parser };
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

function mergeOpencodeAdapters(bodies: readonly string[], mode: McpVisibilityMode, guardian: GuardianBindingEnv | null): Record<string, unknown> {
  const merged: { mcp: Record<string, unknown> } = { mcp: {} };
  const interactive = mode === 'visible' || mode === 'foreground';
  for (const body of bodies) {
    try {
      const parsed = JSON.parse(body) as { mcpServers?: Record<string, unknown> };
      if (parsed && typeof parsed === 'object' && parsed.mcpServers) {
        for (const [name, raw] of Object.entries(parsed.mcpServers)) {
          if (!safeServerName(name) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
          const def = raw as Record<string, unknown>;
          // Registry adapters use the cross-host {command,args,env} shape.
          // OpenCode's current config requires local MCP command argv as one array.
          let command: string[] = [];
          if (typeof def.command === 'string') {
            const args = Array.isArray(def.args) && def.args.every((item) => typeof item === 'string') ? def.args as string[] : [];
            command = [def.command, ...args];
          } else if (Array.isArray(def.command)) {
            command = def.command.map(String);
          }
          if (interactive && guardian) {
            command = wrapWithGuardian(command);
          }
          const environment = (def.env && typeof def.env === 'object' && !Array.isArray(def.env))
            ? def.env as Record<string, unknown>
            : {};
          merged.mcp[name] = {
            type: 'local',
            command,
            enabled: def.enabled !== false,
            ...(def.cwd !== undefined ? { cwd: def.cwd } : {}),
            ...(Object.keys({ ...environment, ...(guardian ? focusGuardEnv(guardian) : {}) }).length > 0
              ? { environment: { ...environment, ...(guardian ? focusGuardEnv(guardian) : {}) } }
              : {}),
          };
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

  const visibilityMode = normalizeVisibilityMode(opts.visibilityMode ?? 'foreground');
  if (visibilityMode !== 'visible' && visibilityMode !== 'headless') {
    throw new Error(`invalid interactive MCP visibility mode: ${String(visibilityMode)}; expected visible, foreground or headless`);
  }
  if (visibilityMode === 'headless' && !isCiEnvironment(opts.visibilityEnv ?? process.env)) {
    throw new Error('headless interactive MCP mode is CI-only; set CI=1 for an explicitly declared CI evidence profile');
  }
  const interactiveIntegrations = opts.integrationIds.filter((id) => requiresForegroundVisibility(opts.registryRoot, id));
  if (visibilityMode === 'visible' && interactiveIntegrations.length > 0) {
    const hostCheck = checkVisibleMcpHost(opts.visibilityEnv ?? process.env, opts.visibilityPlatform ?? process.platform);
    if (!hostCheck.available) {
      throw new Error(`visible MCP preflight blocked: ${hostCheck.reason}; integrations=${interactiveIntegrations.join(', ')}`);
    }
  }
  if (visibilityMode === 'visible' && interactiveIntegrations.includes('pencil-mcp')) {
    const pencilCheck = checkPencilDesktopApp(opts.pencilNativeEnv ?? opts.visibilityEnv ?? process.env, opts.visibilityPlatform ?? process.platform);
    if (!pencilCheck.available) throw new Error(`visible Pencil MCP preflight blocked: ${pencilCheck.reason}`);
    if (opts.activeAgent && !discoverPencilNativeServer(opts.activeAgent, opts.pencilNativeEnv ?? process.env, opts.pencilNativeHome)) {
      throw new Error(`visible Pencil MCP preflight blocked: no native pencil MCP entry for host ${opts.activeAgent}`);
    }
  }
  // AM-0006: focus-safe dispatch gate. Visible interactive GUI MCPs require a
  // trustworthy source binding (source window or explicit workspace). Unbound
  // launches would land the GUI on an unknown workspace and risk focus theft.
  const guardian = assertFocusSafeDispatch(opts, interactiveIntegrations);
  const legacyMode = opts.visibilityMode ?? 'foreground';

  const resolved: string[] = [];
  const missing: string[] = [];

  // Read every requested adapter once so each per-agent merge sees the same set.
  const claudeBodies: string[] = [];
  const codexBodies: string[] = [];
  const opencodeBodies: string[] = [];

  for (const id of opts.integrationIds) {
    let any = false;
    for (const agent of ['claude', 'codex', 'opencode'] as const) {
      const adapter = readAdapter(opts.registryRoot, id, agent, opts.pencilNativeEnv, opts.pencilNativeHome);
      if (!adapter) continue;
      any = true;
      const transformed = transformAdapter(adapter.body, adapter.parser, id, visibilityMode, interactiveIntegrations.includes(id), guardian);
      if (agent === 'claude') claudeBodies.push(transformed);
      else if (agent === 'codex') codexBodies.push(transformed);
      else opencodeBodies.push(transformed);
    }
    if (any) resolved.push(id);
    else missing.push(id);
  }

  const result: { -readonly [K in keyof McpConfigPaths]: McpConfigPaths[K] } = {
    dir: outDir,
    resolved,
    missing,
    visibilityMode: legacyMode,
    interactiveIntegrations,
  };

  if (interactiveIntegrations.length > 0) {
    const visibilityReceiptPath = path.join(outDir, 'mcp-visibility-preflight.json');
    const hostCheck = checkVisibleMcpHost(opts.visibilityEnv ?? process.env, opts.visibilityPlatform ?? process.platform);
    fs.writeFileSync(visibilityReceiptPath, `${JSON.stringify({
      schema: 'agent-rules/mcp-visibility-preflight',
      status: 'PASS',
      mode: visibilityMode,
      integrations: interactiveIntegrations,
      platform: opts.visibilityPlatform ?? process.platform,
      operator_display_available: visibilityMode === 'headless' ? false : hostCheck.available,
      reason: visibilityMode === 'headless' ? 'explicit CI/headless mode' : hostCheck.reason,
      created_at: new Date().toISOString(),
    }, null, 2)}\n`, { mode: 0o600 });
    result.visibilityReceiptPath = visibilityReceiptPath;
  }

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
    const merged = mergeOpencodeAdapters(opencodeBodies, visibilityMode, guardian);
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

  // REQ-011: refuse remote (url-based) MCP servers unless the task policy
  // explicitly allowed network for a routed integration. Remote MCPs must
  // never connect outside a routed task; the default posture is fail-closed.
  if (!opts.allowRemoteMcp) {
    const remoteHits = [...claudeBodies, ...codexBodies, ...opencodeBodies]
      .filter((body) => /"url"\s*:/m.test(body))
      .map((body) => {
        const match = /"url"\s*:\s*"([^"]+)"/m.exec(body);
        return match?.[1] ?? '(unknown remote url)';
      });
    if (remoteHits.length > 0) {
      throw new Error(
        `remote MCP refused (REQ-011): task materialised url-based MCP server(s) without an explicit network policy: ${[...new Set(remoteHits)].join(', ')}`,
      );
    }
  }

  return result as McpConfigPaths;
}
