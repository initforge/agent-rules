import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type OpenCodeDialect = 'v1' | 'v2';

export interface OpenCodeMcpServerEntry {
  type?: string;
  command?: string | string[];
  args?: string[];
  env?: Record<string, string>;
  environment?: Record<string, string>;
  enabled?: boolean;
  disabled?: boolean;
  url?: string;
  cwd?: string;
  [key: string]: unknown;
}

export function detectOpenCodeDialect(versionOrSchema?: string): OpenCodeDialect {
  if (!versionOrSchema) return 'v1';
  const str = String(versionOrSchema).trim().toLowerCase();
  if (str.includes('config.v2.json') || str.startsWith('2.') || str === 'v2') {
    return 'v2';
  }
  return 'v1';
}

/**
 * Format a single MCP server entry for OpenCode v1 (1.18.x).
 * Schema requirement: `type: "local"` | `type: "remote"`, `command: string[]`, `enabled: boolean`.
 */
export function formatOpenCodeV1McpEntry(entry: OpenCodeMcpServerEntry): Record<string, unknown> {
  if (entry.type === 'remote' || entry.url) {
    return {
      type: 'remote',
      url: entry.url ?? (Array.isArray(entry.command) ? entry.command[0] : entry.command),
      enabled: entry.enabled !== false && entry.disabled !== true,
      ...(entry.environment || entry.env ? { environment: { ...(entry.env ?? {}), ...(entry.environment ?? {}) } } : {}),
    };
  }

  let commandList: string[] = [];
  if (Array.isArray(entry.command)) {
    commandList = entry.command.map(String);
  } else if (typeof entry.command === 'string' && entry.command.length > 0) {
    commandList = [entry.command, ...(entry.args ?? []).map(String)];
  }

  const env = { ...(entry.env ?? {}), ...(entry.environment ?? {}) };

  return {
    type: 'local',
    command: commandList,
    enabled: entry.enabled !== false && entry.disabled !== true,
    ...(entry.cwd ? { cwd: entry.cwd } : {}),
    ...(Object.keys(env).length > 0 ? { environment: env } : {}),
  };
}

/**
 * Format a single MCP server entry for OpenCode v2.
 */
export function formatOpenCodeV2McpEntry(entry: OpenCodeMcpServerEntry): Record<string, unknown> {
  if (entry.type === 'remote' || entry.url) {
    return {
      type: 'remote',
      url: entry.url ?? (Array.isArray(entry.command) ? entry.command[0] : entry.command),
      disabled: entry.disabled === true || entry.enabled === false,
      ...(entry.environment || entry.env ? { environment: { ...(entry.env ?? {}), ...(entry.environment ?? {}) } } : {}),
    };
  }

  let commandList: string[] = [];
  if (Array.isArray(entry.command)) {
    commandList = entry.command.map(String);
  } else if (typeof entry.command === 'string' && entry.command.length > 0) {
    commandList = [entry.command, ...(entry.args ?? []).map(String)];
  }

  const env = { ...(entry.env ?? {}), ...(entry.environment ?? {}) };

  return {
    type: 'local',
    command: commandList,
    disabled: entry.disabled === true || entry.enabled === false,
    ...(entry.cwd ? { cwd: entry.cwd } : {}),
    ...(Object.keys(env).length > 0 ? { environment: env } : {}),
  };
}

export function formatOpenCodeConfig(options: {
  dialect?: OpenCodeDialect;
  existingConfig?: Record<string, unknown>;
  mcpServers?: Record<string, OpenCodeMcpServerEntry>;
  permissions?: unknown;
  permissionMap?: Record<string, string>;
}): Record<string, unknown> {
  const existing = options.existingConfig ? { ...options.existingConfig } : {};
  const dialect = options.dialect ?? (existing.$schema && String(existing.$schema).includes('v2') ? 'v2' : 'v1');

  if (dialect === 'v2') {
    const existingMcp = (typeof existing.mcp === 'object' && existing.mcp !== null ? (existing.mcp as Record<string, unknown>) : {});
    const existingServers = (typeof existingMcp.servers === 'object' && existingMcp.servers !== null ? (existingMcp.servers as Record<string, unknown>) : {});
    
    const formattedServers: Record<string, unknown> = { ...existingServers };
    if (options.mcpServers) {
      for (const [name, srv] of Object.entries(options.mcpServers)) {
        formattedServers[name] = formatOpenCodeV2McpEntry(srv);
      }
    }

    return {
      $schema: 'https://opencode.ai/config.v2.json',
      ...existing,
      permissions: options.permissions ?? existing.permissions ?? [{ pattern: '*', action: 'allow' }],
      mcp: {
        ...existingMcp,
        servers: formattedServers,
      },
    };
  }

  // Dialect V1 (1.18.x)
  const existingMcp = (typeof existing.mcp === 'object' && existing.mcp !== null ? (existing.mcp as Record<string, unknown>) : {});
  if ('mcpServers' in existing) {
    delete existing.mcpServers;
  }

  const formattedMcp: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(existingMcp)) {
    if (typeof raw === 'object' && raw !== null) {
      formattedMcp[name] = formatOpenCodeV1McpEntry(raw as OpenCodeMcpServerEntry);
    }
  }

  if (options.mcpServers) {
    for (const [name, srv] of Object.entries(options.mcpServers)) {
      formattedMcp[name] = formatOpenCodeV1McpEntry(srv);
    }
  }

  return {
    $schema: 'https://opencode.ai/config.json',
    permission: options.permissionMap ?? existing.permission ?? { '*': 'allow' },
    ...existing,
    mcp: formattedMcp,
  };
}

export function reconcileOpenCodeConfigFile(
  configPath: string,
  mcpServers: Record<string, OpenCodeMcpServerEntry>,
  options: { backup?: boolean; backupDir?: string; dialect?: OpenCodeDialect } = {}
): { updated: boolean; backupPath?: string; config: Record<string, unknown> } {
  let existing: Record<string, unknown> = {};
  let rawBefore = '';

  if (fs.existsSync(configPath)) {
    try {
      rawBefore = fs.readFileSync(configPath, 'utf8');
      existing = JSON.parse(rawBefore);
    } catch {
      existing = {};
    }
  }

  const dialect = options.dialect ?? (existing.$schema && String(existing.$schema).includes('v2') ? 'v2' : 'v1');
  const formatted = formatOpenCodeConfig({
    dialect,
    existingConfig: existing,
    mcpServers,
  });

  const nextRaw = JSON.stringify(formatted, null, 2) + '\n';
  if (rawBefore.trim() === nextRaw.trim()) {
    return { updated: false, config: formatted };
  }

  let backupPath: string | undefined;
  if (options.backup !== false && rawBefore.trim().length > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolder = options.backupDir ?? path.join(path.dirname(configPath), 'agent-rules-backups');
    fs.mkdirSync(backupFolder, { recursive: true });
    backupPath = path.join(backupFolder, `${path.basename(configPath)}.${stamp}.backup`);
    fs.writeFileSync(backupPath, rawBefore, 'utf8');
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, nextRaw, 'utf8');

  return { updated: true, backupPath, config: formatted };
}

export function validateOpenCodeConfigWithBinary(
  opencodeBin: string = 'opencode',
  cwd?: string
): { ok: boolean; stdout: string; stderr: string } {
  try {
    const res = spawnSync(opencodeBin, ['debug', 'config'], {
      encoding: 'utf8',
      cwd: cwd ?? process.cwd(),
      timeout: 10000,
      windowsHide: true,
    });
    return {
      ok: res.status === 0,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
    };
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
}
