/**
 * projection/projector.ts — config projections generated from the canonical
 * registry. One generator, many output formats:
 *   - OpenCode JSON  (opencode.json `mcp` entries)
 *   - Codex TOML     (.codex/config.toml `mcp_servers` entries)
 *   - DSH profile    (Cordis-compatible MCP plugin config patch)
 *   - guardian launch config (broker/provider launch spec)
 *
 * Invariants: pinned versions only (never @latest), command digest + registry
 * hash + policy hash + rollback reference included, no secrets ever written,
 * and never a direct project-level provider bypass: every projected entry
 * routes through the guardian connect bridge, not the raw provider command.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { commandDigest, docHash } from '../util/hashes.js';
import type { Registry, ExtendedProvider } from './registry.js';

export interface ProjectionContext {
  repoRoot: string;
  gitHead?: string | null;
  policyHash?: string | null;
  /** Absolute path to the guardian connect bridge script (dist/bin/connect.js). */
  guardianBridgeCommand: string;
  /** Node executable used to run the bridge (default process.execPath). */
  nodeBin?: string | null;
  brokerEndpoint?: string | null; // streamable-http broker URL when used
}

export interface ProjectedEntry {
  provider_id: string;
  key: string;
  source: { package: string | null; version: string | null; pinned: boolean };
  command_digest: string;
  registry_hash: string;
  policy_hash: string | null;
  rollback_reference: string | null;
  visibility: string;
  sharing_mode: string;
  guardian_wrapped: boolean;
  command: string;
  args: string[];
  env: Record<string, string>;
}

function pinnedSource(entry: ExtendedProvider): { package: string | null; version: string | null; pinned: boolean } {
  const s = entry.registry_entry.source;
  const version = s?.version ?? null;
  if (!s || !version) return { package: s?.package ?? null, version: null, pinned: false };
  const pinned = s.versionPolicy === 'pinned' || /^\d+\.\d+\.\d+/.test(version);
  if (!pinned) {
    throw new Error(`provider ${entry.id} is not pinned (version "${version}") — projections never use @latest or floating versions`);
  }
  return { package: s.package ?? null, version, pinned: true };
}

export class Projector {
  constructor(
    private registry: Registry,
    private ctx: ProjectionContext,
  ) {}

  /**
   * Build the guardian-wrapped entry for a provider + lease. The host MCP
   * config command is always the guardian connect bridge with the lease token
   * passed via environment (never embedded in a config file); the raw provider
   * command is never projected into a host config.
   */
  project(providerId: string, lease: { lease_id: string; logical_session_id: string }, sharingMode: string, visibility: string): ProjectedEntry {
    const entry = this.registry.provider(providerId);
    if (!entry) throw new Error(`unknown provider ${providerId}`);
    if (sharingMode !== 'exclusive' && !entry.shared_safe) {
      throw new Error(`provider ${providerId} is not shared-safe; sharing_mode=${sharingMode} rejected`);
    }
    if (visibility === 'visible-local' && !entry.visible_local_allowed) {
      throw new Error(`provider ${providerId} does not allow visible-local mode`);
    }
    const src = pinnedSource(entry);
    const nodeBin = this.ctx.nodeBin ?? process.execPath;
    // Host MCP configs spawn `command` with `shell:false` (MCP SDK / OpenCode /
    // Codex), so `command` MUST be an executable and the bridge script goes in
    // `args` — never a single "node /path" string that spawn cannot split.
    const command = nodeBin;
    const args = [this.ctx.guardianBridgeCommand, 'connect', '--lease', lease.lease_id, '--provider', providerId];
    const env: Record<string, string> = {
      AGENT_RULES_LOGICAL_SESSION_ID: lease.logical_session_id,
      AGENT_RULES_PROVIDER_ID: providerId,
    };
    return {
      provider_id: providerId,
      key: providerId.replace(/[^a-zA-Z0-9_-]/g, '-'),
      source: src,
      command_digest: commandDigest(command, args),
      registry_hash: this.registry.registryHash,
      policy_hash: this.ctx.policyHash ?? null,
      rollback_reference: this.ctx.gitHead ?? null,
      visibility,
      sharing_mode: sharingMode,
      guardian_wrapped: true,
      command,
      args,
      env,
    };
  }

  /** OpenCode opencode.json projection. */
  toOpenCodeJson(entries: ProjectedEntry[]): Record<string, unknown> {
    const mcp: Record<string, unknown> = {};
    for (const e of entries) {
      mcp[e.key] = {
        type: 'stdio',
        command: e.command,
        args: e.args,
        env: e.env,
        enabled: true,
      };
    }
    return {
      $schema: 'https://opencode.ai/config.json',
      mcp,
      'x-agent-rules': {
        generated_by: 'agent-rules mcp-guardian',
        registry_hash: this.registry.registryHash,
        policy_hash: this.ctx.policyHash ?? null,
        rollback_reference: this.ctx.gitHead ?? null,
        guardian_wrapped: true,
        direct_provider_bypass: false,
      },
    };
  }

  /** Codex .codex/config.toml projection. */
  toCodexToml(entries: ProjectedEntry[]): string {
    const lines: string[] = [];
    lines.push('# Generated by agent-rules mcp-guardian — do not hand-edit.');
    lines.push('# Registry hash: ' + this.registry.registryHash);
    lines.push('# Policy hash: ' + (this.ctx.policyHash ?? 'none'));
    lines.push('# Rollback reference: ' + (this.ctx.gitHead ?? 'none'));
    lines.push('');
    for (const e of entries) {
      lines.push(`[mcp_servers.${e.key}]`);
      lines.push(`command = ${JSON.stringify(e.command)}`);
      const args = JSON.stringify(e.args);
      lines.push(`args = ${args}`);
      if (Object.keys(e.env).length > 0) {
        const envToml = Object.entries(e.env)
          .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
          .join(', ');
        lines.push(`env = { ${envToml} }`);
      }
      lines.push('');
    }
    lines.push('[x-agent-rules]');
    lines.push(`registry_hash = ${JSON.stringify(this.registry.registryHash)}`);
    lines.push(`policy_hash = ${JSON.stringify(this.ctx.policyHash ?? 'none')}`);
    lines.push(`rollback_reference = ${JSON.stringify(this.ctx.gitHead ?? 'none')}`);
    lines.push('guardian_wrapped = true');
    lines.push('direct_provider_bypass = false');
    return lines.join('\n') + '\n';
  }

  /** DSH profile MCP plugin patch (Cordis config style). */
  toDshProfile(entries: ProjectedEntry[]): Record<string, unknown> {
    const mcpServers: Record<string, unknown> = {};
    for (const e of entries) {
      mcpServers[e.key] = {
        type: 'stdio',
        command: e.command,
        args: e.args,
        env: e.env,
      };
    }
    return {
      plugins: {
        'mcp': {
          $if: 'env.MCP_ENABLED',
          servers: mcpServers,
        },
      },
      'x-agent-rules': {
        generated_by: 'agent-rules mcp-guardian',
        registry_hash: this.registry.registryHash,
        policy_hash: this.ctx.policyHash ?? null,
        rollback_reference: this.ctx.gitHead ?? null,
        guardian_wrapped: true,
        direct_provider_bypass: false,
      },
    };
  }

  /**
   * DSH profile projection in the format @deepseek-ai/dsh-mcp-client actually
   * consumes: a `cordis.patch.yml` insert list, one plugin instance per
   * provider. `env` may only carry non-secret session/provider identity; the
   * lease token is referenced through `!!js process.env.AGENT_RULES_LEASE_TOKEN`
   * so no secret is ever written to the profile file. Every entry is
   * guardian-wrapped (command = connect bridge), never the raw provider.
   *
   * Returns the TOP-LEVEL YAML ARRAY of cordis PatchOptions exactly as the
   * loader accepts — pure `insert` blocks, no extra keys. Projection metadata
   * (hashes/rollback) lives in toDshProjectionReceipt, never in the patch file.
   */
  toDshCordisPatch(entries: ProjectedEntry[]): Array<Record<string, unknown>> {
    const inserted = entries.map((e) => ({
      id: `mcp-${e.key}`,
      name: '@deepseek-ai/dsh-mcp-client',
      config: {
        serverName: e.key,
        transport: 'stdio',
        command: e.command,
        args: e.args,
        env: {
          ...e.env,
          // Resolved from the host process env at mount time; never in-file.
          AGENT_RULES_LEASE_TOKEN: '!!js process.env.AGENT_RULES_LEASE_TOKEN',
        },
      },
    }));
    return [{ insert: inserted }];
  }

  /**
   * Projection receipt for the DSH profile attach (written next to the patch,
   * never inside it): exact projection metadata for rollback and audit.
   */
  toDshProjectionReceipt(entries: ProjectedEntry[], extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      schema: 'agent-rules/mcp-dsh-projection-receipt/v1',
      generated_at: new Date().toISOString(),
      registry_hash: this.registry.registryHash,
      policy_hash: this.ctx.policyHash ?? null,
      rollback_reference: this.ctx.gitHead ?? null,
      guardian_wrapped: true,
      direct_provider_bypass: false,
      entries: entries.map((e) => ({
        provider_id: e.provider_id,
        key: e.key,
        command: e.command,
        args: e.args,
        command_digest: e.command_digest,
        source: e.source,
        visibility: e.visibility,
        sharing_mode: e.sharing_mode,
      })),
      ...extra,
    };
  }

  /** Guardian launch config (used by the connect bridge). */
  toLaunchConfig(entry: ExtendedProvider, lease: { lease_id: string; provider_id: string }): Record<string, unknown> {
    const src = pinnedSource(entry);
    const command = entry.registry_entry.source?.commandName ?? entry.id;
    const args: string[] = [];
    const env: Record<string, string> = {
      AGENT_RULES_GUARDIAN: '1',
      AGENT_RULES_LEASE_ID: lease.lease_id,
      AGENT_RULES_PROVIDER_ID: lease.provider_id,
    };
    for (const name of entry.registry_entry.environment ?? []) {
      if (process.env[name]) env[name] = process.env[name];
    }
    return {
      provider_id: entry.id,
      command,
      args,
      env,
      command_digest: commandDigest(command, args),
      source: src,
      registry_hash: this.registry.registryHash,
      gui: entry.gui,
      requires_focus_guard: entry.requires_focus_guard,
      resource_scope: entry.resource_scope,
      visibility_mode: entry.visible_local_allowed ? 'visible-local' : 'headless',
      headless_allowed: entry.headless_allowed,
      shared_safe: entry.shared_safe,
    };
  }
}

export function gitHead(repoRoot: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
