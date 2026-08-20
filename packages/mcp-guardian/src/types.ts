/**
 * types.ts — canonical identity model for the persistent MCP session broker.
 *
 * One term per concept (owner contract §I):
 * - logical_session_id  — durable identity of a chat/agent session
 * - host_session_id     — identity of the session inside OpenCode/DSH/Codex
 * - host_instance_id    — process/window/app instance running the host
 * - mcp_lease_id        — lease issued by the agent-rules broker
 * - provider_instance_id— one concrete MCP process/connection
 * - mcp_connection_id   — one protocol connection/initialize session
 * - resource_id         — browser profile/CDP endpoint or desktop-app resource
 * - source_window_fingerprint — host window identity (X11 id, WM_CLASS, PID,
 *                               start time, reuse-guard properties)
 * - provider_window_fingerprint — window identity of the provider app
 * - initial_workspace / current_workspace — observation, never identity
 */

export const LEASE_STATES = [
  'CREATED',
  'ACQUIRING',
  'STARTING',
  'READY',
  'RELOCATED',
  'RECONNECTING',
  'STALE',
  'QUARANTINED',
  'RESOURCE_RECREATED',
  'RELEASED',
  'REVOKED',
  'FAILED',
] as const;

export type LeaseStatus = (typeof LEASE_STATES)[number];

export const ACTIVE_LEASE_STATUSES: readonly LeaseStatus[] = [
  'CREATED',
  'ACQUIRING',
  'STARTING',
  'READY',
  'RELOCATED',
  'RECONNECTING',
];

export const SHARING_MODES = ['exclusive', 'shared-readonly', 'shared-explicit'] as const;
export type SharingMode = (typeof SHARING_MODES)[number];

export const VISIBILITY_MODES = ['visible-local', 'headless', 'hidden'] as const;
export type VisibilityMode = (typeof VISIBILITY_MODES)[number];

export const HOST_KINDS = ['opencode', 'deepseek-harness', 'codex', 'codex-desktop', 'cli', 'unknown'] as const;
export type HostKind = (typeof HOST_KINDS)[number];

export const SESSION_GRANULARITIES = ['chat', 'host-session', 'host-window', 'project', 'host-process', 'unsupported'] as const;
export type SessionGranularity = (typeof SESSION_GRANULARITIES)[number];

/** Identity of one OS process: PID alone is never identity. */
export interface ProcessFingerprint {
  pid: number;
  /** /proc/<pid>/stat field 22 (start time in clock ticks since boot). */
  start_time: string;
  /** canonical executable path (readlink /proc/<pid>/exe). */
  exe: string;
  /** sha256 of the NUL-joined /proc/<pid>/cmdline. */
  cmdline_hash: string;
  /** optional profile/endpoint token observed in argv or env. */
  resource_token?: string;
}

/** Identity of one X11 window: window id alone is never identity. */
export interface WindowFingerprint {
  window_id: string;
  wm_pid: number | null;
  wm_class: string | null;
  wm_name: string | null;
  /** process start time of wm_pid, guards against PID reuse. */
  process_start_time: string | null;
  workspace: number | null;
  /** WM_STATE: mapped (1) or iconic (3). */
  wm_state: number | null;
  /** true when the window is mapped and not iconic. */
  visible: boolean;
  /** provider resource markers observed on the window (profile/endpoint). */
  resource_markers: string[];
  observed_at: string;
}

export interface SourceWindowFingerprint extends WindowFingerprint {
  host_kind: HostKind;
  host_instance_hint: string;
}

/** Minimal provider capability metadata, extended from integrations/registry.json. */
export interface ProviderCapabilityMetadata {
  id: string;
  kind: 'mcp' | 'native' | 'binary';
  display_name: string;
  capabilities: string[];
  requires_focus_guard: boolean;
  placement_backend: 'x11-ewmh' | 'none' | 'unsupported';
  resource_scope: 'browser-profile' | 'browser-cdp' | 'desktop-app' | 'stateless' | 'document' | 'device';
  default_sharing_mode: SharingMode;
  supports_reconnect: boolean;
  supports_multi_window: boolean;
  supports_streamable_http: boolean;
  supports_stdio: boolean;
  requires_explicit_user_selection: boolean;
  visible_local_allowed: boolean;
  headless_allowed: boolean;
  owner_relocation_allowed: boolean;
  shared_safe: boolean;
  gui: boolean;
}

export interface LeaseRecord {
  lease_id: string;
  logical_session_id: string;
  host_kind: HostKind;
  host_session_id: string | null;
  host_instance_id: string | null;
  project_root: string | null;
  source_window_fingerprint_hash: string | null;
  provider_id: string;
  provider_instance_id: string | null;
  mcp_connection_id: string | null;
  resource_id: string | null;
  transport: 'stdio' | 'streamable-http' | null;
  command_digest: string | null;
  profile_path: string | null;
  endpoint_reference: string | null;
  provider_pid: number | null;
  provider_start_time: string | null;
  provider_window_fingerprints: WindowFingerprint[];
  initial_workspace: number | null;
  current_workspace: number | null;
  visibility_mode: VisibilityMode;
  sharing_mode: SharingMode;
  owner_policy_hash: string | null;
  registry_hash: string | null;
  status: LeaseStatus;
  created_at: string;
  last_heartbeat_at: string | null;
  stale_after_ms: number;
  reconnect_attempts: number;
  rollback_reference: string | null;
  updated_at: string;
}

export interface LeaseTransitionReceipt {
  transition_id: number;
  lease_id: string;
  from_status: LeaseStatus;
  to_status: LeaseStatus;
  reason: string;
  payload: Record<string, unknown>;
  ts: string;
}

export interface HostSessionRecord {
  logical_session_id: string;
  host_kind: HostKind;
  host_session_id: string | null;
  host_instance_id: string | null;
  project_root: string | null;
  source_window_fingerprint_hash: string | null;
  granularity: SessionGranularity;
  attestation_status: string;
  registered_at: string;
  updated_at: string;
}

export interface AcquireLeaseInput {
  logical_session_id: string;
  host_kind: HostKind;
  host_session_id?: string | null;
  host_instance_id?: string | null;
  project_root?: string | null;
  source_window_fingerprint_hash?: string | null;
  provider_id: string;
  visibility_mode?: VisibilityMode;
  sharing_mode?: SharingMode;
  /** registry-derived: provider is marked shared-safe in integrations/registry.json */
  shared_safe_provider?: boolean;
  initial_workspace?: number | null;
  stale_after_ms?: number;
  owner_policy_hash?: string | null;
  registry_hash?: string | null;
  rollback_reference?: string | null;
}

export interface LeaseAcquireResult {
  lease: LeaseRecord;
  /** one-time plaintext token; broker stores only sha256(lease_token). */
  lease_token: string;
  created: boolean;
}

export interface RelocationEvent {
  event_id: string;
  from_workspace: number | null;
  to_workspace: number | null;
  window_id: string;
  observed_at: string;
  operator_triggered: boolean;
}

export interface HeartbeatEvidence {
  provider_pid?: number | null;
  provider_start_time?: string | null;
  provider_window_fingerprints?: WindowFingerprint[];
  current_workspace?: number | null;
  mcp_connection_id?: string | null;
  resource_id?: string | null;
  extra?: Record<string, unknown>;
}

export interface AttachProviderInput {
  provider_instance_id: string;
  mcp_connection_id: string;
  resource_id: string | null;
  provider_pid: number | null;
  provider_start_time: string | null;
  provider_window_fingerprints?: WindowFingerprint[];
  current_workspace?: number | null;
  transport: 'stdio' | 'streamable-http';
  mcp_handshake_proof?: McpHandshakeProof;
}

export interface McpHandshakeProof {
  server_info: { name: string; version: string } | null;
  protocol_version: string | null;
  capabilities: Record<string, unknown> | null;
  tools_listed: number;
  tools_sample: string[];
  initialize_id: string;
  tools_list_id: string;
  handshake_ms: number;
}

export interface DoctorIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  lease_id?: string;
  evidence?: Record<string, unknown>;
}

export interface DoctorReport {
  ok: boolean;
  state_dir: string;
  db_path: string;
  schema_version: number;
  journal_mode: string;
  db_mode: string;
  leases: {
    total: number;
    active: number;
    stale: number;
    released: number;
    failed: number;
  };
  issues: DoctorIssue[];
  generated_at: string;
}

export interface ReconcileResult {
  stale_closed: number;
  leases_reconciled: number;
  orphan_provider_instances: number;
  drift: DoctorIssue[];
  receipts: LeaseTransitionReceipt[];
}

export const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
