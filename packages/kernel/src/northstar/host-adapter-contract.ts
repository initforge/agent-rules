import { createHash } from 'node:crypto';
import type { HostId } from './host-adapters.js';
import type { HostCapabilityFacts, EnforcementDecision } from './host-capabilities.js';

/**
 * REQ-010 — the ONE canonical HostAdapter contract shared by the CLI runtime,
 * the reconciler/installer, and every platform adapter projection.
 *
 * Lifecycle is separated from semantics: planLifecycle/applyLifecycle own
 * install/upgrade/remove/rollback as a transactional plan+receipt pair, while
 * mapRequirement turns a semantic capability requirement into an enforcement
 * plan. observeCapabilities returns the typed HostCapabilityFacts (REQ-011).
 *
 * The legacy per-host PlatformAdapter (detect/render/stage/activate/probe/
 * update/uninstall/rollback) and the CLI-runtime HostAdapter (detect/
 * inventory/project/probe/repair/rollback) are bridged through a time-boxed
 * compatibility shim (compatAdapterToHostAdapterV2); after
 * ADAPTER_CONTRACT_EXPIRY the shim refuses to load and every surface must
 * speak this single contract.
 */

export interface HostObservation {
  host: HostId;
  installed: boolean;
  version?: string;
  binaryPath?: string;
  signals: string[];
  /** Availability never grants authority. Always false by contract. */
  readonly taskAuthority: false;
}

export interface ProjectionObservation {
  host: HostId;
  projection_hash: string;
  projection_path?: string;
  desired?: unknown;
  actual?: unknown;
  drift?: unknown;
}

export type LifecycleAction = 'Install' | 'Upgrade' | 'Remove' | 'Rollback';

export interface LifecyclePlan {
  host: HostId;
  action: LifecycleAction;
  steps: Array<{ op: string; target?: string; sha256?: string; verify?: string }>;
  prior_state_backup?: string;
  cas_expected_state?: unknown;
}

export interface LifecycleReceipt {
  host: HostId;
  action: LifecycleAction;
  applied: boolean;
  receipt_sha256: string;
  manifest_path?: string;
  backup_path?: string;
  rollback_available: boolean;
}

export interface SemanticCapabilityRequirement {
  capability: string;
  effects: readonly string[];
  broker_manages_effect?: boolean;
  worktree_available?: boolean;
}

export interface EnforcementPlan {
  decision: EnforcementDecision;
  /** Native primitive to use for the enforcement layer (when available). */
  native_primitive?: string;
}

export interface CapabilityId {
  capability: string;
  host?: HostId;
}

export interface CapabilityCertificationReceipt {
  capability: string;
  host: HostId;
  certified: boolean;
  certified_at?: string;
  expires_at?: string;
  evidence_ref?: string;
  failure_reason?: string;
}

export interface HostAdapter {
  readonly id: HostId;
  discover(): Promise<HostObservation>;
  inspectProjection(): Promise<ProjectionObservation>;
  planLifecycle(action: LifecycleAction): Promise<LifecyclePlan>;
  applyLifecycle(plan: LifecyclePlan): Promise<LifecycleReceipt>;
  observeCapabilities(): Promise<HostCapabilityFacts>;
  mapRequirement(requirement: SemanticCapabilityRequirement): Promise<EnforcementPlan>;
  runCanary(capability: CapabilityId): Promise<CapabilityCertificationReceipt>;
}

/**
 * NativeHostLifecycle — the single 10-method native install lifecycle contract
 * (closure REQ-111). Every host adapter implements exactly this surface on its
 * OWN native instruction/config surface; no shared/fake structure is accepted.
 *
 * detect → inventory → planInstall → install → reload → readback →
 * offlineCanary → authenticatedCanary → rollback → uninstall
 *
 * Provenance rule: a surface may only be declared native when it is backed by
 * official documentation, host CLI help/config schema, or real native readback.
 * The registry never self-declares native on its own.
 */
export interface NativeHostLifecycle {
  readonly id: HostId;
  /** Presence/probe signals; never grants authority. */
  detect(): Promise<HostObservation>;
  /** Enumerate owned/unmanaged/stale/duplicate/malformed paths under the host. */
  inventory(detection: HostObservation): Promise<Array<{ host: HostId; kind: string; path: string; owned: boolean; sha256?: string }>>;
  /** Transactional install plan with backup target. */
  planInstall(detection: HostObservation, inventory: unknown[]): Promise<{ host: HostId; changes: unknown[]; backupDir: string }>;
  /** Atomic + idempotent install; second install produces zero diff. */
  install(host: HostId, opts?: { dryRun?: boolean }): Promise<unknown>;
  /** Native reload mechanism (host re-reads rules/skills after reload/new session). */
  reload(host: HostId): Promise<{ ok: boolean; method: string; evidence?: unknown[] }>;
  /** Real native readback of the installed surface (managed block / config bytes). */
  readback(host: HostId): Promise<{ ok: boolean; method: string; found: boolean; sha256?: string; detail?: string }>;
  /** Credential-free offline canary (claims 1–7+9); never requires login. */
  offlineCanary(host: HostId): Promise<{ ok: boolean; claims: Record<string, { status: string; evidence: unknown[] }> }>;
  /** Authenticated model-turn canary; logged-out hosts return MODEL_BEHAVIOR=NEEDS_USER. */
  authenticatedCanary(host: HostId): Promise<{ ok: boolean; modelBehavior: 'PASS' | 'NEEDS_USER' | 'BLOCKED'; evidence: unknown[] }>;
  /** Byte-equal rollback: pre/post hashes must match. */
  rollback(host: HostId, backupDir?: string): Promise<{ ok: boolean; byteEqual: boolean }>;
  /** Uninstall only the content agent-rules owns. */
  uninstall(host: HostId): Promise<void>;
}

/**
 * Time-boxed compatibility shim. After this instant the legacy adapter shapes
 * are retired and every surface must implement the single HostAdapter contract.
 */
export const ADAPTER_CONTRACT_EXPIRY = '2027-01-01T00:00:00.000Z';

export function adapterShimExpired(now: Date = new Date()): boolean {
  return now.getTime() > Date.parse(ADAPTER_CONTRACT_EXPIRY);
}

/**
 * Bridge a legacy per-host PlatformAdapter (detect/render/stage/activate/probe/
 * update/uninstall/rollback) onto the canonical HostAdapter contract. The shim
 * is load-bearing only until `adapterShimExpired()`; after that it refuses so
 * no legacy surface silently becomes the authority.
 */
export function compatAdapterToHostAdapterV2(host: HostId, legacy: {
  detect(): Promise<{ installed: boolean; version?: string; path?: string }>;
  probe(): Promise<{ ok: boolean; detail: string }>;
  update(): Promise<{ ok: boolean }>;
  uninstall(): Promise<{ ok: boolean }>;
  rollback(version: string): Promise<{ ok: boolean }>;
}): HostAdapter {
  return {
    id: host,
    async discover() {
      if (adapterShimExpired()) throw new Error(`adapter compatibility shim expired for ${host}; implement HostAdapter directly`);
      const detection = await legacy.detect();
      return {
        host,
        installed: detection.installed,
        ...(detection.version ? { version: detection.version } : {}),
        ...(detection.path ? { binaryPath: detection.path } : {}),
        signals: ['legacy-adapter-detected'],
        taskAuthority: false,
      };
    },
    async inspectProjection() {
      const hash = createHash('sha256').update(`compat:projection:${host}`).digest('hex');
      return { host, projection_hash: hash, projection_path: undefined };
    },
    async planLifecycle(action) {
      return { host, action, steps: [] };
    },
    async applyLifecycle(plan) {
      const receiptSha = (ok: boolean) => createHash('sha256').update(`compat:lifecycle:${host}:${plan.action}:${ok}:${Date.now()}`).digest('hex');
      if (plan.action === 'Remove') {
        const result = await legacy.uninstall();
        return { host, action: plan.action, applied: result.ok, receipt_sha256: receiptSha(result.ok), rollback_available: false };
      }
      if (plan.action === 'Rollback') {
        const result = await legacy.rollback('last');
        return { host, action: plan.action, applied: result.ok, receipt_sha256: receiptSha(result.ok), rollback_available: false };
      }
      if (plan.action === 'Upgrade') {
        const result = await legacy.update();
        return { host, action: plan.action, applied: result.ok, receipt_sha256: receiptSha(result.ok), rollback_available: true };
      }
      return { host, action: plan.action, applied: true, receipt_sha256: receiptSha(true), rollback_available: true };
    },
    async observeCapabilities() {
      throw new Error(`observeCapabilities requires a native projection for ${host}; the compatibility shim cannot fabricate capability facts`);
    },
    async mapRequirement(requirement) {
      const probe = await legacy.probe();
      return {
        decision: {
          layer: probe.ok ? 'broker' : 'blocked',
          can_control_mutation: false,
          reason: `compatibility shim for ${host}: legacy adapter cannot prove native enforcement; falling back to broker/blocked (UNKNOWN never becomes allow)`,
        },
      };
    },
    async runCanary(capability) {
      const probe = await legacy.probe();
      return {
        capability: capability.capability,
        host,
        certified: false,
        failure_reason: probe.ok ? 'compatibility shim cannot certify live capability without native evidence' : `host probe failed: ${probe.detail}`,
      };
    },
  };
}
