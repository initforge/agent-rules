import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { AgentKind } from './headless-executor.js';

export interface PencilNativeServer {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly sourcePath: string;
}

export interface PencilDesktopCheck {
  readonly available: boolean;
  readonly reason: string;
}

interface JsonMcpServer {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  environment?: unknown;
}

function withoutJsonComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function stringArgs(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function fromJsonServer(sourcePath: string, raw: JsonMcpServer | undefined): PencilNativeServer | null {
  if (!raw) return null;
  const command = Array.isArray(raw.command) ? raw.command[0] : raw.command;
  if (typeof command !== 'string' || !command.trim()) return null;
  const commandArgs = Array.isArray(raw.command) ? raw.command.slice(1) : raw.args;
  return {
    command,
    args: stringArgs(commandArgs),
    env: stringEnv(raw.env ?? raw.environment),
    sourcePath,
  };
}

function readJsonServer(file: string): PencilNativeServer | null {
  try {
    const parsed = JSON.parse(withoutJsonComments(fs.readFileSync(file, 'utf8'))) as {
      mcpServers?: Record<string, JsonMcpServer>;
      mcp?: Record<string, JsonMcpServer>;
    };
    return fromJsonServer(file, parsed.mcpServers?.pencil ?? parsed.mcp?.pencil);
  } catch {
    return null;
  }
}

function quotedTomlValues(value: string): string[] {
  const values: string[] = [];
  const pattern = /'([^']*)'|"((?:\\.|[^"\\])*)"/g;
  for (const match of value.matchAll(pattern)) values.push(match[1] ?? match[2]?.replace(/\\"/g, '"') ?? '');
  return values;
}

function readTomlServer(file: string): PencilNativeServer | null {
  try {
    const source = fs.readFileSync(file, 'utf8');
    const sectionFor = (name: string): string => {
      const header = new RegExp(`^\\[${name.replace(/[.]/g, '\\.')}\\]\\s*$`, 'm').exec(source);
      if (!header || header.index === undefined) return '';
      const rest = source.slice(header.index + header[0].length);
      const nextHeader = rest.search(/^\[/m);
      return (nextHeader < 0 ? rest : rest.slice(0, nextHeader)).trim();
    };
    const section = sectionFor('mcp_servers.pencil');
    if (!section) return null;
    const commandMatch = /^command\s*=\s*['"]([^'"]+)['"]\s*$/m.exec(section);
    if (!commandMatch?.[1]) return null;
    const argsMatch = /^args\s*=\s*\[([^\]]*)\]\s*$/m.exec(section);
    const envSection = sectionFor('mcp_servers.pencil.env');
    const env: Record<string, string> = {};
    for (const match of envSection.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*['"]([^'"]*)['"]\s*$/gm)) {
      env[match[1]!] = match[2]!;
    }
    return {
      command: commandMatch[1],
      args: argsMatch ? quotedTomlValues(argsMatch[1]!) : [],
      env,
      sourcePath: file,
    };
  } catch {
    return null;
  }
}

function candidatePaths(agent: AgentKind, env: NodeJS.ProcessEnv, home: string): string[] {
  const explicit = env.PENCIL_MCP_NATIVE_CONFIG;
  const candidates = explicit ? [explicit] : [];
  const append = (...items: Array<string | undefined>): void => {
    for (const item of items) if (item && !candidates.includes(item)) candidates.push(item);
  };
  switch (agent) {
    case 'codex':
      append(env.PENCIL_MCP_CODEX_CONFIG, env.CODEX_HOME ? path.join(env.CODEX_HOME, 'config.toml') : undefined, path.join(home, '.codex', 'config.toml'));
      break;
    case 'claude':
      append(env.PENCIL_MCP_CLAUDE_CONFIG, env.CLAUDE_CONFIG_DIR ? path.join(env.CLAUDE_CONFIG_DIR, 'mcp.json') : undefined, path.join(home, '.claude.json'));
      break;
    case 'opencode':
      append(env.PENCIL_MCP_OPENCODE_CONFIG, env.OPENCODE_CONFIG, env.OPENCODE_HOME ? path.join(env.OPENCODE_HOME, 'opencode.json') : undefined, path.join(home, '.config', 'opencode', 'opencode.json'));
      break;
  }
  return candidates;
}

/**
 * Read the operator's own Pencil server entry. This deliberately copies the
 * native `command`, `args`, and `env` verbatim: AppImage paths and vendor
 * agent flags vary by host/version and cannot be safely reconstructed.
 */
export function discoverPencilNativeServer(
  agent: AgentKind,
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): PencilNativeServer | null {
  for (const candidate of candidatePaths(agent, env, home)) {
    if (!fs.existsSync(candidate)) continue;
    const server = candidate.endsWith('.toml') ? readTomlServer(candidate) : readJsonServer(candidate);
    if (server) return server;
  }
  return null;
}

function processListing(platform: NodeJS.Platform): string {
  try {
    if (platform === 'win32') return String(spawnSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).stdout ?? '');
    if (platform === 'darwin') return String(spawnSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).stdout ?? '');
    return String(spawnSync('ps', ['-eo', 'args='], { encoding: 'utf8' }).stdout ?? '');
  } catch {
    return '';
  }
}

/**
 * A design MCP must target an observable desktop editor. Process inspection is
 * intentionally conservative: when the host cannot expose process state, the
 * design task is blocked rather than being silently sent to an unseen service.
 */
export function checkPencilDesktopApp(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): PencilDesktopCheck {
  if (env.PENCIL_MCP_TEST_ASSUME_APP === '1') return { available: true, reason: 'test-only Pencil desktop observation override' };
  const processes = processListing(platform);
  if (!processes) return { available: false, reason: `cannot inspect desktop processes on ${platform}` };
  const appPattern = /(?:\bpen(?:\.appimage)?\b|\bpencil(?:\.app)?\b)/i;
  return appPattern.test(processes)
    ? { available: true, reason: 'Pencil desktop process is observable' }
    : { available: false, reason: 'Pencil desktop/editor process is not observable' };
}

function tomlValue(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

export function pencilServerAsAdapter(server: PencilNativeServer, agent: AgentKind): string {
  if (agent === 'codex') {
    const env = Object.entries(server.env)
      .map(([key, value]) => `${key} = ${tomlValue(value)}`)
      .join('\n');
    return [
      '[mcp_servers.pencil]',
      `command = ${tomlValue(server.command)}`,
      `args = [${server.args.map(tomlValue).join(', ')}]`,
      'startup_timeout_sec = 120',
      ...(env ? ['', '[mcp_servers.pencil.env]', env] : []),
      '',
    ].join('\n');
  }
  return `${JSON.stringify({ mcpServers: { pencil: { command: server.command, args: [...server.args], env: { ...server.env } } } }, null, 2)}\n`;
}
