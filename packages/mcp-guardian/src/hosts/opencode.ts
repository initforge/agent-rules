/**
 * hosts/opencode.ts — OpenCode host adapter.
 *
 * Native session id binding through the OpenCode server API (@opencode-ai/sdk).
 * Headless/API mode: use the native session id when present; acquire a lease
 * per logical session; project per-session MCP config; dispose on end when the
 * policy is ephemeral, keep when persistent and resumable.
 * Interactive/TUI mode: the launcher registers the host session BEFORE any
 * visible GUI MCP launch and passes session token/project root/source process
 * identity; session binding exists before visible GUI MCP launch.
 *
 * Project-level config is only a projection — never a direct MCP override that
 * bypasses the guardian. Multiple sessions in one process bind by native
 * session id, never by CWD alone.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sha256Hex, newId } from '../util/hashes.js';
import type { Broker } from '../broker/broker.js';
import type { Projector } from '../projection/projector.js';
import type {
  HostAttestation,
  HostMcpProjection,
  HostSessionAdapter,
  HostSessionBinding,
  RuntimeReconcileResult,
} from './contract.js';
import { binding, registerWithBroker } from './contract.js';
import type { LeaseRecord, SessionGranularity } from '../types.js';

const execFileAsync = promisify(execFile);

export interface OpencodeAdapterOptions {
  broker: Broker;
  projector: Projector;
  /** OpenCode server base URL (default http://127.0.0.1:4096). */
  baseUrl?: string;
  /** binary used for detection */
  binary?: string;
}

interface NativeSession {
  id: string;
  title?: string;
  dir?: string;
}

export class OpencodeAdapter implements HostSessionAdapter {
  private broker: Broker;
  private projector: Projector;
  private baseUrl: string;
  private binary: string;
  private attestation: HostAttestation | null = null;
  private lifecycleHandlers = new Map<string, Set<(event: { type: string; payload: unknown }) => void>>();

  constructor(opts: OpencodeAdapterOptions) {
    this.broker = opts.broker;
    this.projector = opts.projector;
    this.baseUrl = opts.baseUrl ?? process.env.OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096';
    this.binary = opts.binary ?? process.env.OPENCODE_BIN ?? 'opencode';
  }

  async detect(): Promise<HostAttestation> {
    let version: string | null = null;
    let running = false;
    let pid: number | null = null;
    let binaryPath: string | null = null;
    let detail: Record<string, unknown> = {};

    try {
      const { stdout } = await execFileAsync(this.binary, ['--version'], { timeout: 5000 });
      version = stdout.trim().split('\n')[0] ?? null;
    } catch {
      version = null;
    }
    try {
      const res = await fetch(`${this.baseUrl}/status`, { signal: AbortSignal.timeout(1500) });
      running = res.ok;
    } catch {
      running = false;
    }
    if (running) {
      try {
        const res = await fetch(`${this.baseUrl}/app`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const app = (await res.json()) as { pid?: number };
          pid = app.pid ?? null;
        }
      } catch {
        /* optional */
      }
    }
    this.attestation = {
      host_kind: 'opencode',
      binary: this.binary,
      version,
      version_source: version ? 'binary --version' : null,
      pinned: true,
      install_authority: true,
      running,
      pid,
      host_instance_id: running ? `opencode-server-${pid ?? 'unknown'}` : null,
      detected_at: new Date().toISOString(),
      detail: { base_url: this.baseUrl, detail },
    };
    return this.attestation;
  }

  private async nativeSession(id: string): Promise<NativeSession | null> {
    try {
      const res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const s = (await res.json()) as NativeSession;
      return s.id ? s : null;
    } catch {
      return null;
    }
  }

  private async listSessions(): Promise<NativeSession[]> {
    try {
      const res = await fetch(`${this.baseUrl}/session`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return [];
      const list = (await res.json()) as NativeSession[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  async registerSession(input: {
    hostSessionId?: string | null;
    hostInstanceId?: string | null;
    projectRoot?: string | null;
    sourceWindowFingerprintHash?: string | null;
    requested?: string;
  }): Promise<HostSessionBinding> {
    const att = await this.detect();
    let logicalSessionId: string;
    let granularity: SessionGranularity;
    let hostSessionId = input.hostSessionId ?? null;
    let resolved = input.hostSessionId ?? null;
    let observed = null as string | null;
    let fallback: string | null = null;

    if (hostSessionId) {
      const native = await this.nativeSession(hostSessionId);
      if (native) {
        granularity = 'chat';
        resolved = native.id;
        observed = `native session ${native.id} observed via server API`;
        logicalSessionId = `opencode:${native.id}`;
      } else {
        // Session id provided but not observable: host-process granularity.
        granularity = 'host-process';
        fallback = 'hostSessionId not observable through the server API; granularity degraded to host-process';
        logicalSessionId = `opencode:${input.hostInstanceId ?? hostSessionId}`;
      }
    } else {
      // No native session id: never infer identity from CWD alone.
      granularity = 'project';
      fallback = 'no native session id available; binding at project granularity (never chat)';
      logicalSessionId = `opencode:project:${sha256Hex(input.projectRoot ?? 'unknown').slice(0, 16)}`;
    }

    const b = binding({
      logical_session_id: logicalSessionId,
      host_kind: 'opencode',
      host_session_id: hostSessionId,
      host_instance_id: input.hostInstanceId ?? att.host_instance_id,
      project_root: input.projectRoot ?? null,
      source_window_fingerprint_hash: input.sourceWindowFingerprintHash ?? null,
      granularity,
      requested: input.requested ?? 'host-provided',
      resolved: resolved ?? 'none',
      observed: observed ?? 'not-observed',
      attestation_status: att.running ? 'ATTESTED' : 'DETECTED_NOT_RUNNING',
      fallback_reason: fallback,
      evidence_refs: [`opencode-attestation:${att.detected_at}`],
    });
    registerWithBroker(this.broker, b);
    return b;
  }

  async resolveSession(input: { hostSessionId?: string | null; projectRoot?: string | null; requested?: string }): Promise<HostSessionBinding> {
    return this.registerSession(input);
  }

  getGranularity(): SessionGranularity {
    return this.attestation?.running ? 'chat' : 'host-process';
  }

  subscribeLifecycle(sessionId: string, handler: (event: { type: string; payload: unknown }) => void): () => void {
    let set = this.lifecycleHandlers.get(sessionId);
    if (!set) {
      set = new Set();
      this.lifecycleHandlers.set(sessionId, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  private emit(sessionId: string, type: string, payload: unknown): void {
    for (const h of this.lifecycleHandlers.get(sessionId) ?? []) {
      try {
        h({ type, payload });
      } catch {
        /* handler errors are isolated */
      }
    }
  }

  async projectMcp(sessionId: string, lease: LeaseRecord): Promise<HostMcpProjection> {
    const entry = this.projector.project(lease.provider_id, lease, lease.sharing_mode, lease.visibility_mode);
    const content = this.projector.toOpenCodeJson([entry]);
    return {
      format: 'opencode-json',
      content,
      entries: [{ provider_id: lease.provider_id, guardian_wrapped: true, command_digest: entry.command_digest }],
      registry_hash: this.projector['registry'].registryHash,
    };
  }

  async attachLease(sessionId: string, lease: LeaseRecord): Promise<void> {
    this.emit(sessionId, 'lease.attached', { lease_id: lease.lease_id, provider_id: lease.provider_id });
  }

  async detachLease(sessionId: string, lease: LeaseRecord): Promise<void> {
    this.emit(sessionId, 'lease.detached', { lease_id: lease.lease_id });
  }

  async reconcile(sessionId: string): Promise<RuntimeReconcileResult> {
    const leases = this.broker.listLeases({ logicalSessionId: sessionId });
    const drift: string[] = [];
    for (const l of leases) {
      if (!['READY', 'RELOCATED'].includes(l.status)) {
        drift.push(`lease ${l.lease_id} is ${l.status}`);
      }
    }
    return { leases, drift };
  }
}
