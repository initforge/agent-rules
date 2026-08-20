import type { HostId } from './host-adapters.js';

/**
 * REQ-014 — versioned host-capability attestation and the enforcement-order
 * decision machine.
 *
 * Baseline capabilities are pointers, never guarantees: if a live probe fails,
 * the capability is UNVERIFIED and never assumed. Enforcement order:
 *   1. native sandbox/hook/permission, but only when proven;
 *   2. Capability Broker when the tool/effect is broker-managed;
 *   3. isolated workspace transaction (disposable worktree);
 *   4. BLOCKED when mutation cannot be controlled.
 */

export type V2CapabilityStatus = 'HOST_NATIVE' | 'ADAPTER_ENFORCED' | 'EMULATED' | 'UNSUPPORTED' | 'UNVERIFIED';

export interface HostCapabilityAttestationV2 {
  schema: 'agent-rules/host-capability-attestation-v2';
  version: 2;
  host: HostId;
  capabilities: {
    native_pre_effect_enforcement: V2CapabilityStatus;
    sandbox: V2CapabilityStatus;
    path_permissions: V2CapabilityStatus;
    mcp_lifecycle: V2CapabilityStatus;
    worktree_support: V2CapabilityStatus;
    telemetry: V2CapabilityStatus;
    compaction: V2CapabilityStatus;
  };
  /** Baseline hints from the official host contract; only used when a live probe confirms them. */
  baseline: Partial<Record<keyof HostCapabilityAttestationV2['capabilities'], V2CapabilityStatus>>;
  /** Provenance of the baseline: which official doc version it was refreshed from and when. */
  contract_metadata: HostContractMetadata;
  /** Secret redaction + path/effect policy applied to any persisted host/MCP/output. */
  secret_redaction: SecretRedactionPolicy;
  probe: {
    probed_at?: string;
    probe_failed?: boolean;
    probe_error?: string;
  };
}

/**
 * P4 — each host capability contract records the official doc version it was
 * refreshed from, the access date, and the canonical source URL. A stale
 * (expired) contract must not be treated as live certification.
 */
export interface HostContractMetadata {
  doc_version: string;
  doc_accessed_at: string;
  source_url: string;
  /** Days before this contract metadata is considered stale and must be re-verified. */
  max_age_days: number;
}

export const HOST_CONTRACT_METADATA: Record<HostId, HostContractMetadata> = {
  codex: {
    doc_version: '2026-08',
    doc_accessed_at: '2026-08-20',
    source_url: 'https://learn.chatgpt.com/docs/config-file/config-reference',
    max_age_days: 90,
  },
  claude: {
    doc_version: '2026-08',
    doc_accessed_at: '2026-08-20',
    source_url: 'https://code.claude.com/docs/en/hooks',
    max_age_days: 90,
  },
  opencode: {
    doc_version: 'v2-2026-08',
    doc_accessed_at: '2026-08-20',
    source_url: 'https://opencode.ai/v2/docs/permissions',
    max_age_days: 90,
  },
  cursor: {
    doc_version: '2026-08',
    doc_accessed_at: '2026-08-20',
    source_url: 'https://docs.cursor.com/cli/reference/permissions',
    max_age_days: 90,
  },
  antigravity: {
    doc_version: '2026-08',
    doc_accessed_at: '2026-08-20',
    source_url: 'https://antigravity.google/docs/features',
    max_age_days: 90,
  },
  grok: {
    doc_version: '2026-08',
    doc_accessed_at: '2026-08-20',
    source_url: 'https://docs.x.ai/build/overview',
    max_age_days: 90,
  },
};

export interface SecretRedactionPolicy {
  env_files: boolean;
  credentials: boolean;
  host_config: boolean;
  mcp_output: boolean;
  logs: boolean;
  persisted_artifacts: boolean;
}

export const DEFAULT_SECRET_REDACTION: SecretRedactionPolicy = {
  env_files: true,
  credentials: true,
  host_config: true,
  mcp_output: true,
  logs: true,
  persisted_artifacts: true,
};

/** A contract is stale once it exceeds its max age; stale contracts cannot certify live. */
export function isContractStale(meta: HostContractMetadata, now: Date = new Date()): boolean {
  const accessed = Date.parse(meta.doc_accessed_at);
  if (Number.isNaN(accessed)) return true;
  const ageDays = (now.getTime() - accessed) / 86_400_000;
  return ageDays > meta.max_age_days;
}

export function capabilityProven(status: V2CapabilityStatus | undefined): boolean {
  return status === 'HOST_NATIVE' || status === 'ADAPTER_ENFORCED';
}

const BASELINE: Record<HostId, HostCapabilityAttestationV2['baseline']> = {
  // Codex: sandbox + MCP enabled=false (official baseline).
  codex: { native_pre_effect_enforcement: 'ADAPTER_ENFORCED', sandbox: 'HOST_NATIVE', path_permissions: 'HOST_NATIVE', mcp_lifecycle: 'HOST_NATIVE', worktree_support: 'HOST_NATIVE', telemetry: 'HOST_NATIVE', compaction: 'EMULATED' },
  // Claude: pre-tool hooks (deny) are the native enforcement seam.
  claude: { native_pre_effect_enforcement: 'ADAPTER_ENFORCED', sandbox: 'EMULATED', path_permissions: 'UNVERIFIED', mcp_lifecycle: 'HOST_NATIVE', worktree_support: 'HOST_NATIVE', telemetry: 'HOST_NATIVE', compaction: 'EMULATED' },
  // Antigravity: pre-tool deny hooks exist but are not certified headless here.
  antigravity: { native_pre_effect_enforcement: 'ADAPTER_ENFORCED', sandbox: 'UNVERIFIED', path_permissions: 'UNVERIFIED', mcp_lifecycle: 'HOST_NATIVE', worktree_support: 'HOST_NATIVE', telemetry: 'HOST_NATIVE', compaction: 'UNVERIFIED' },
  // OpenCode V2: disabled=true MCP descriptors; permission model is per-tool.
  opencode: { native_pre_effect_enforcement: 'EMULATED', sandbox: 'UNVERIFIED', path_permissions: 'EMULATED', mcp_lifecycle: 'HOST_NATIVE', worktree_support: 'HOST_NATIVE', telemetry: 'HOST_NATIVE', compaction: 'EMULATED' },
  cursor: { native_pre_effect_enforcement: 'UNVERIFIED', sandbox: 'UNVERIFIED', path_permissions: 'UNVERIFIED', mcp_lifecycle: 'UNVERIFIED', worktree_support: 'HOST_NATIVE', telemetry: 'UNVERIFIED', compaction: 'UNVERIFIED' },
  grok: { native_pre_effect_enforcement: 'UNVERIFIED', sandbox: 'UNVERIFIED', path_permissions: 'UNVERIFIED', mcp_lifecycle: 'UNVERIFIED', worktree_support: 'HOST_NATIVE', telemetry: 'UNVERIFIED', compaction: 'UNVERIFIED' },
};

/**
 * Build the version-2 attestation. Baseline values are only honored when the
 * live probe confirms the capability; a failed probe marks every relevant
 * capability UNVERIFIED (never assumed).
 */
export function hostCapabilityAttestationV2(host: HostId, probe?: { ok?: boolean; confirmed?: Array<keyof HostCapabilityAttestationV2['capabilities']>; error?: string }): HostCapabilityAttestationV2 {
  const baseline = BASELINE[host] ?? {};
  const confirmed = new Set(probe?.confirmed ?? []);
  const capabilities = Object.fromEntries(
    (Object.keys(baseline) as Array<keyof HostCapabilityAttestationV2['capabilities']>).map((key) => {
      if (probe?.ok === false) return [key, 'UNVERIFIED' as V2CapabilityStatus];
      if (probe?.ok === true) {
        return [key, confirmed.has(key) ? baseline[key]! : 'UNVERIFIED' as V2CapabilityStatus];
      }
      return [key, 'UNVERIFIED' as V2CapabilityStatus];
    }),
  ) as HostCapabilityAttestationV2['capabilities'];
  return {
    schema: 'agent-rules/host-capability-attestation-v2',
    version: 2,
    host,
    capabilities,
    baseline,
    contract_metadata: HOST_CONTRACT_METADATA[host] ?? { doc_version: 'unknown', doc_accessed_at: '1970-01-01', source_url: '', max_age_days: 0 },
    secret_redaction: DEFAULT_SECRET_REDACTION,
    probe: {
      ...(probe?.ok !== undefined ? { probed_at: new Date().toISOString() } : {}),
      ...(probe?.ok === false ? { probe_failed: true } : {}),
      ...(probe?.error ? { probe_error: probe.error } : {}),
    },
  };
}

/** Live probe: may be overridden by an adapter that actually probed the host. */
export function probeHostCapabilities(host: HostId, adapterProbe?: { ok: boolean; confirmed?: Array<keyof HostCapabilityAttestationV2['capabilities']>; error?: string }): HostCapabilityAttestationV2 {
  // Without a real probe result, nothing is assumed: attestation stays
  // UNVERIFIED so enforcement falls through to worktree transaction / BLOCKED.
  if (!adapterProbe) return hostCapabilityAttestationV2(host, { ok: false, error: 'no live probe performed' });
  return hostCapabilityAttestationV2(host, adapterProbe);
}

export type EnforcementLayer = 'native' | 'broker' | 'workspace_transaction' | 'blocked';

export interface EnforcementDecision {
  layer: EnforcementLayer;
  can_control_mutation: boolean;
  reason: string;
  /** Which specific attestation capability the decision rested on. */
  relied_on?: keyof HostCapabilityAttestationV2['capabilities'];
}

export interface EnforcementInput {
  host: HostId;
  attestation: HostCapabilityAttestationV2;
  /** Effects this task will perform (from the execution policy). */
  effects: readonly string[];
  /** True when the tool/effect is managed by the Capability Broker. */
  broker_manages_effect: boolean;
  /** True when a disposable worktree transaction is available. */
  worktree_available: boolean;
}

export const READ_ONLY_EFFECTS = new Set(['read']);
export const MUTATING_EFFECTS = new Set(['filesystem_mutation', 'external_write', 'destructive', 'command_execution']);

/**
 * REQ-014 enforcement order. Never assumes a capability that a live probe did
 * not confirm. Read-only work may run directly ONLY when a sandbox proves it
 * cannot mutate; otherwise it still needs a mutation control layer.
 */
export function decideEnforcement(input: EnforcementInput): EnforcementDecision {
  const mutating = input.effects.some((effect) => MUTATING_EFFECTS.has(effect));
  const readOnly = input.effects.every((effect) => READ_ONLY_EFFECTS.has(effect));

  const nativeEnforcement = capabilityProven(input.attestation.capabilities.native_pre_effect_enforcement);
  const sandboxProven = capabilityProven(input.attestation.capabilities.sandbox);

  // 1. Native layer, only with proof.
  if (nativeEnforcement) {
    if (mutating || (readOnly && sandboxProven)) {
      return {
        layer: 'native',
        can_control_mutation: true,
        reason: `host ${input.host} has proven native pre-effect enforcement (${input.attestation.capabilities.native_pre_effect_enforcement})${readOnly && sandboxProven ? ' with a proven sandbox' : ''}`,
        relied_on: 'native_pre_effect_enforcement',
      };
    }
    if (readOnly && !sandboxProven) {
      // Native enforcement proven but no sandbox proof for read-only: still
      // fall through to a mutation-control layer below.
    }
  }

  // 2. Capability Broker.
  if (input.broker_manages_effect) {
    return {
      layer: 'broker',
      can_control_mutation: mutating,
      reason: `effect is managed by the Capability Broker for ${input.host}`,
    };
  }

  // 3. Isolated workspace transaction.
  if (input.worktree_available) {
    return {
      layer: 'workspace_transaction',
      can_control_mutation: true,
      reason: `host ${input.host} cannot prove native enforcement for these effects; falling back to a disposable worktree transaction`,
      relied_on: 'worktree_support',
    };
  }

  // 4. BLOCKED.
  return {
    layer: 'blocked',
    can_control_mutation: false,
    reason: `host ${input.host} cannot control mutation for effects [${input.effects.join(', ')}]; no native proof, no broker coverage, no worktree transaction`,
  };
}

/** Default attestation for a host that has not been probed: everything UNVERIFIED. */
export function unprobedAttestation(host: HostId): HostCapabilityAttestationV2 {
  return hostCapabilityAttestationV2(host, { ok: false, error: 'no live probe performed' });
}
