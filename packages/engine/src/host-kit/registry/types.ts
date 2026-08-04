/**
 * host-kit/registry/types.ts — Shared types for host-kit role/capability contracts.
 *
 * All role and capability contracts in this package are model-neutral and
 * portable. No provider or model IDs appear in any portable prompt shape.
 * Dirty work is preserved; generated/ and .agent/ paths are never referenced.
 */

export type HostKitRole =
  | 'coordinator'
  | 'architect-integrator'
  | 'implementer'
  | 'utility'
  | 'verifier'
  | 'reviewer'
  | 'specialist'
  | 'adjudicator';

export type AuthorityLevel = 'host' | 'delegate' | 'read-only' | 'advisory' | 'override';

export type PermissionEffect = 'allow' | 'deny' | 'conditional' | 'escalate';

export type ReceiptStatus = 'issued' | 'accepted' | 'rejected' | 'escalated' | 'superseded';

export type FallbackAction = 'deny' | 'halt' | 'request-clarification' | 'escalate' | 'defer' | 'block';

export interface HostKitReceipt {
  readonly receipt_id: string;
  readonly role: HostKitRole;
  readonly issued_at: string;
  readonly status: ReceiptStatus;
  readonly decision: string;
  readonly evidence_refs: readonly string[];
  readonly authority: AuthorityLevel;
  readonly fallback: FallbackAction;
}

export interface RoleAuthority {
  readonly level: AuthorityLevel;
  readonly scope: readonly string[];
  readonly constraints: readonly string[];
}

export interface RolePermission {
  readonly action: string;
  readonly target: string;
  readonly effect: PermissionEffect;
  readonly condition?: string;
}

export interface RoleFallback {
  readonly trigger: string;
  readonly action: FallbackAction;
  readonly reason: string;
}

export interface RoleContract {
  readonly role: HostKitRole;
  readonly label: string;
  readonly authority: RoleAuthority;
  readonly permissions: readonly RolePermission[];
  readonly receipt: HostKitReceipt;
  readonly fallback: RoleFallback;
}

export interface CapabilityClaim {
  readonly capability: string;
  readonly status: 'claimed' | 'attested' | 'unverified' | 'missing';
  readonly evidence?: string;
}

export interface PortablePrompt {
  readonly role: HostKitRole;
  readonly instruction: string;
  readonly constraints: readonly string[];
  readonly capabilities: readonly CapabilityClaim[];
  readonly preserve_dirty_work: boolean;
  readonly forbidden_paths: readonly string[];
}
