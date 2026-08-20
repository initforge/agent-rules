/**
 * hosts/contract.ts — host-neutral session adapter contract (owner contract §XI).
 *
 * Every adapter must return requested / resolved / observed / attestation_status /
 * granularity / fallback_reason / evidence_refs. No adapter may infer a session
 * identity from a config filename alone.
 */
import type { Broker } from '../broker/broker.js';
import type { HostKind, LeaseRecord, SessionGranularity } from '../types.js';

export interface HostAttestation {
  host_kind: HostKind;
  binary: string | null;
  version: string | null;
  version_source: string | null; // package.json | binary --version | observed
  pinned: boolean;
  install_authority: boolean;
  running: boolean;
  pid: number | null;
  host_instance_id: string | null;
  detected_at: string;
  detail: Record<string, unknown>;
}

export interface HostSessionBinding {
  logical_session_id: string;
  host_kind: HostKind;
  host_session_id: string | null;
  host_instance_id: string | null;
  project_root: string | null;
  source_window_fingerprint_hash: string | null;
  granularity: SessionGranularity;
  requested: string;
  resolved: string;
  observed: string;
  attestation_status: string;
  fallback_reason: string | null;
  evidence_refs: string[];
}

export interface HostMcpProjection {
  format: 'opencode-json' | 'codex-toml' | 'dsh-profile' | 'launch-config';
  content: unknown;
  entries: Array<{ provider_id: string; guardian_wrapped: boolean; command_digest: string }>;
  registry_hash: string;
}

export interface RuntimeReconcileResult {
  leases: LeaseRecord[];
  drift: string[];
}

export interface HostSessionAdapter {
  detect(): Promise<HostAttestation>;
  registerSession(input: {
    hostSessionId?: string | null;
    hostInstanceId?: string | null;
    projectRoot?: string | null;
    sourceWindowFingerprintHash?: string | null;
    requested?: string;
  }): Promise<HostSessionBinding>;
  resolveSession(input: {
    hostSessionId?: string | null;
    projectRoot?: string | null;
    requested?: string;
  }): Promise<HostSessionBinding>;
  getGranularity(): SessionGranularity;
  subscribeLifecycle(sessionId: string, handler: (event: { type: string; payload: unknown }) => void): () => void;
  projectMcp(sessionId: string, lease: LeaseRecord): Promise<HostMcpProjection>;
  attachLease(sessionId: string, lease: LeaseRecord): Promise<void>;
  detachLease(sessionId: string, lease: LeaseRecord): Promise<void>;
  reconcile(sessionId: string): Promise<RuntimeReconcileResult>;
}

export function binding(
  input: Omit<HostSessionBinding, 'requested' | 'resolved' | 'observed'> & { requested?: string; resolved?: string; observed?: string },
): HostSessionBinding {
  return {
    requested: input.requested ?? 'host-provided',
    resolved: input.resolved ?? input.host_session_id ?? 'none',
    observed: input.observed ?? 'not-observed',
    logical_session_id: input.logical_session_id,
    host_kind: input.host_kind,
    host_session_id: input.host_session_id,
    host_instance_id: input.host_instance_id,
    project_root: input.project_root,
    source_window_fingerprint_hash: input.source_window_fingerprint_hash,
    granularity: input.granularity,
    attestation_status: input.attestation_status,
    fallback_reason: input.fallback_reason,
    evidence_refs: input.evidence_refs,
  };
}

/** Convenience: register a binding into the broker host-session registry. */
export function registerWithBroker(broker: Broker, b: HostSessionBinding): void {
  broker.registerHostSession({
    logical_session_id: b.logical_session_id,
    host_kind: b.host_kind,
    host_session_id: b.host_session_id,
    host_instance_id: b.host_instance_id,
    project_root: b.project_root,
    source_window_fingerprint_hash: b.source_window_fingerprint_hash,
    granularity: b.granularity,
    attestation_status: b.attestation_status,
  });
}
