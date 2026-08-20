/**
 * hosts/codex.ts — Codex CLI and Codex desktop/IDE adapters.
 *
 * Codex CLI (owner contract §X):
 * - per-invocation logical session with per-session broker lease;
 * - project-scoped config projection (.codex/config.toml in trusted project
 *   scope only); global CODEX_HOME config is never modified to bind a browser;
 * - provider transport: Streamable HTTP broker or per-session STDIO;
 * - /mcp tool discovery verified by live evidence, not assumed.
 *
 * Codex desktop app / IDE extension:
 * - official configuration is shared across desktop app, CLI and IDE
 *   extension — shared config is NOT proof of per-chat identity;
 * - MCP config changes require restart/reload;
 * - capability granularity is reported honestly: `chat` only when a real
 *   chat/session token or supported host hook is observed; otherwise
 *   host-window/app-session or unsupported. ChatGPT web is a separate surface
 *   and never claimed by this local broker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { sha256Hex, newId } from '../util/hashes.js';
import type { Broker } from '../broker/broker.js';
import type { Projector } from '../projection/projector.js';
import type { HostAttestation, HostMcpProjection, HostSessionAdapter, HostSessionBinding, RuntimeReconcileResult } from './contract.js';
import { binding, registerWithBroker } from './contract.js';
import type { LeaseRecord, SessionGranularity } from '../types.js';

const execFileAsync = promisify(execFile);

export interface CodexAdapterOptions {
  broker: Broker;
  projector: Projector;
  binary?: string;
  codexHome?: string;
  projectRoot?: string;
}

export const CODEX_DESKTOP_BINARIES = [
  'codex-desktop',
  'Codex',
  'codex',
];

export class CodexCliAdapter implements HostSessionAdapter {
  private broker: Broker;
  private projector: Projector;
  private binary: string;
  private projectRoot: string | null;
  private attestation: HostAttestation | null = null;

  constructor(opts: CodexAdapterOptions) {
    this.broker = opts.broker;
    this.projector = opts.projector;
    this.binary = opts.binary ?? process.env.CODEX_BIN ?? 'codex';
    this.projectRoot = opts.projectRoot ?? null;
  }

  async detect(): Promise<HostAttestation> {
    let version: string | null = null;
    try {
      const { stdout } = await execFileAsync(this.binary, ['--version'], { timeout: 5000 });
      version = stdout.trim().split('\n')[0] ?? null;
    } catch {
      version = null;
    }
    this.attestation = {
      host_kind: 'codex',
      binary: this.binary,
      version,
      version_source: version ? 'binary --version' : null,
      pinned: true,
      install_authority: true,
      running: version !== null,
      pid: null,
      host_instance_id: null,
      detected_at: new Date().toISOString(),
      detail: { cli: true },
    };
    return this.attestation;
  }

  async registerSession(input: {
    hostSessionId?: string | null;
    hostInstanceId?: string | null;
    projectRoot?: string | null;
    sourceWindowFingerprintHash?: string | null;
    requested?: string;
  }): Promise<HostSessionBinding> {
    const att = await this.detect();
    const projectRoot = input.projectRoot ?? this.projectRoot ?? null;
    const hostSessionId = input.hostSessionId ?? null;
    const logicalSessionId = hostSessionId
      ? `codex:${hostSessionId}`
      : `codex:cli:${sha256Hex(projectRoot ?? 'unknown').slice(0, 16)}`;
    const b = binding({
      logical_session_id: logicalSessionId,
      host_kind: 'codex',
      host_session_id: hostSessionId,
      host_instance_id: input.hostInstanceId ?? null,
      project_root: projectRoot,
      source_window_fingerprint_hash: input.sourceWindowFingerprintHash ?? null,
      granularity: hostSessionId ? 'host-session' : 'project',
      requested: input.requested ?? 'per-invocation',
      resolved: hostSessionId ?? `project:${projectRoot ?? 'unknown'}`,
      observed: hostSessionId ? `codex invocation session ${hostSessionId}` : 'CLI invocation without native chat id — project granularity',
      attestation_status: att.running ? 'ATTESTED' : 'NOT_DETECTED',
      fallback_reason: hostSessionId ? null : 'no native codex chat/session id exposed by CLI; granularity = project (honest)',
      evidence_refs: [`codex-cli-attestation:${att.detected_at}`],
    });
    registerWithBroker(this.broker, b);
    return b;
  }

  async resolveSession(input: { hostSessionId?: string | null; projectRoot?: string | null; requested?: string }): Promise<HostSessionBinding> {
    return this.registerSession(input);
  }

  getGranularity(): SessionGranularity {
    return 'project';
  }

  subscribeLifecycle(): () => void {
    return () => undefined;
  }

  async projectMcp(sessionId: string, lease: LeaseRecord): Promise<HostMcpProjection> {
    const entry = this.projector.project(lease.provider_id, lease, lease.sharing_mode, lease.visibility_mode);
    const content = this.projector.toCodexToml([entry]);
    return {
      format: 'codex-toml',
      content,
      entries: [{ provider_id: lease.provider_id, guardian_wrapped: true, command_digest: entry.command_digest }],
      registry_hash: this.projector['registry'].registryHash,
    };
  }

  /**
   * Projection into .codex/config.toml — trusted project scope only, never the
   * global CODEX_HOME config. Returns the written path (or null when the
   * project is not trusted / not present).
   */
  writeProjectConfig(projectRoot: string, toml: string, opts: { trusted: boolean }): { path: string | null; reason?: string } {
    if (!opts.trusted) {
      return { path: null, reason: 'project scope not trusted — refusing to write .codex/config.toml' };
    }
    const dir = path.join(projectRoot, '.codex');
    const cfg = path.join(dir, 'config.toml');
    fs.mkdirSync(dir, { recursive: true });
    const backup = `${cfg}.agent-rules-backup`;
    if (fs.existsSync(cfg) && !fs.existsSync(backup)) {
      fs.copyFileSync(cfg, backup);
    }
    fs.writeFileSync(cfg, toml, { mode: 0o600 });
    return { path: cfg };
  }

  async attachLease(_sessionId: string, _lease: LeaseRecord): Promise<void> {
    /* broker-side */
  }

  async detachLease(_sessionId: string, _lease: LeaseRecord): Promise<void> {
    /* broker-side */
  }

  async reconcile(sessionId: string): Promise<RuntimeReconcileResult> {
    const leases = this.broker.listLeases({ logicalSessionId: sessionId });
    return { leases, drift: [] };
  }
}

export interface CodexDesktopCapability {
  granularity: SessionGranularity;
  chat_identity_observed: boolean;
  shared_config: boolean;
  restart_required_for_mcp: boolean;
  chained: string[];
  reason: string;
  evidence_refs: string[];
}

/**
 * Honest capability assessment for Codex desktop / IDE extension.
 * Shared config is never proof of per-chat identity; a real chat/session hook
 * is required for `chat` granularity, otherwise host-window or unsupported.
 */
export async function assessCodexDesktop(codexHome: string): Promise<CodexDesktopCapability> {
  const evidence: string[] = [];
  const chained: string[] = [];

  const configExists = fs.existsSync(path.join(codexHome, 'config.toml'));
  const mcpInSharedConfig = configExists
    ? fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8').includes('mcp_servers')
    : false;

  const sessionHook =
    process.env.CODEX_DESKTOP_SESSION_TOKEN !== undefined ||
    process.env.CODEX_CHAT_ID !== undefined ||
    process.env.CODEX_SESSION_ID !== undefined;

  if (sessionHook) {
    evidence.push('codex desktop session hook env present');
  }
  if (configExists) evidence.push(`shared config exists at ${codexHome}/config.toml${mcpInSharedConfig ? ' with mcp_servers' : ''}`);
  if (mcpInSharedConfig) {
    chained.push('shared mcp_servers config — restart/reload required for MCP changes; shared config is not per-chat identity');
  }
  chained.push('ChatGPT web is a separate surface and does not read local Codex configuration — not claimable by a local X11 broker');

  const granularity: SessionGranularity = sessionHook ? 'chat' : 'host-window';
  return {
    granularity,
    chat_identity_observed: sessionHook,
    shared_config: configExists,
    restart_required_for_mcp: true,
    chained,
    reason: sessionHook
      ? 'real chat/session identity observed via host hook'
      : 'no chat/session token or host hook observed; shared config alone is not per-chat identity — granularity = host-window',
    evidence_refs: evidence,
  };
}

export function codexDesktopDetect(): { found: boolean; binary: string | null; reason?: string } {
  for (const name of CODEX_DESKTOP_BINARIES) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p) return { found: true, binary: p };
    } catch {
      /* try next */
    }
  }
  return { found: false, binary: null, reason: 'no codex desktop binary on PATH' };
}
