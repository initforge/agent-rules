/**
 * host-kit/registry/roles.ts — Canonical role contracts for the host-kit.
 *
 * Eight declared roles: coordinator, architect/integrator, implementer,
 * utility, verifier, reviewer, specialist, adjudicator.
 *
 * Each role carries: authority, permissions, receipt, fallback.
 * No provider or model IDs appear in any portable prompt shape.
 * Dirty work is preserved; generated/ and .agent/ paths are never referenced.
 */

import type {
  HostKitRole,
  AuthorityLevel,
  PermissionEffect,
  ReceiptStatus,
  FallbackAction,
  HostKitReceipt,
  RoleAuthority,
  RolePermission,
  RoleFallback,
  RoleContract,
} from './types.js';

// ── Shared authority levels ──────────────────────────────────────────────

const HOST_AUTHORITY: RoleAuthority = {
  level: 'host',
  scope: ['dispatch', 'delegate', 'verify', 'review', 'adjudicate'],
  constraints: ['never-authors-source', 'never-edits-own-output', 'preserves-dirty-work'],
};

const DELEGATE_AUTHORITY: RoleAuthority = {
  level: 'delegate',
  scope: ['execute', 'write', 'test', 'inspect'],
  constraints: ['scoped-to-assigned-paths', 'no-cross-role-override'],
};

const READ_ONLY_AUTHORITY: RoleAuthority = {
  level: 'read-only',
  scope: ['read', 'search', 'inspect'],
  constraints: ['no-write', 'no-execute', 'no-delegate'],
};

const ADVISORY_AUTHORITY: RoleAuthority = {
  level: 'advisory',
  scope: ['propose', 'recommend', 'flag'],
  constraints: ['no-enforce', 'no-override', 'requires-host-acknowledgment'],
};

const OVERRIDE_AUTHORITY: RoleAuthority = {
  level: 'override',
  scope: ['resolve-conflict', 'block', 'halt', 'reassign'],
  constraints: ['escalation-only', 'requires-audit-trail'],
};

// ── Shared permission templates ──────────────────────────────────────────

const DISPATCH_PERMS: readonly RolePermission[] = [
  { action: 'dispatch', target: 'child-agents', effect: 'allow' },
  { action: 'cancel', target: 'child-agents', effect: 'allow' },
  { action: 'reassign', target: 'child-agents', effect: 'conditional', condition: 'on-fallback' },
];

const SOURCE_AUTHORING_PERMS: readonly RolePermission[] = [
  { action: 'read', target: 'source-files', effect: 'allow' },
  { action: 'write', target: 'source-files', effect: 'deny' },
  { action: 'write', target: 'test-files', effect: 'deny' },
  { action: 'execute', target: 'build-commands', effect: 'deny' },
];

const IMPLEMENTATION_PERMS: readonly RolePermission[] = [
  { action: 'read', target: 'source-files', effect: 'allow' },
  { action: 'write', target: 'assigned-paths', effect: 'allow' },
  { action: 'execute', target: 'approved-commands', effect: 'allow' },
  { action: 'write', target: 'generated-files', effect: 'deny' },
  { action: 'write', target: '.agent/**', effect: 'deny' },
];

const UTILITY_PERMS: readonly RolePermission[] = [
  { action: 'read', target: 'source-files', effect: 'allow' },
  { action: 'execute', target: 'tool-commands', effect: 'allow' },
  { action: 'write', target: 'output-artifacts', effect: 'allow' },
  { action: 'write', target: 'source-files', effect: 'deny' },
];

const VERIFICATION_PERMS: readonly RolePermission[] = [
  { action: 'read', target: 'source-files', effect: 'allow' },
  { action: 'read', target: 'test-files', effect: 'allow' },
  { action: 'execute', target: 'approved-test-commands', effect: 'allow' },
  { action: 'write', target: 'evidence-artifacts', effect: 'allow' },
  { action: 'write', target: 'source-files', effect: 'deny' },
];

const REVIEW_PERMS: readonly RolePermission[] = [
  { action: 'read', target: 'diffs', effect: 'allow' },
  { action: 'read', target: 'evidence', effect: 'allow' },
  { action: 'inspect', target: 'test-results', effect: 'allow' },
  { action: 'write', target: 'review-receipts', effect: 'allow' },
  { action: 'write', target: 'source-files', effect: 'deny' },
];

const SPECIALIST_PERMS: readonly RolePermission[] = [
  { action: 'read', target: 'domain-files', effect: 'allow' },
  { action: 'write', target: 'domain-files', effect: 'allow' },
  { action: 'execute', target: 'domain-commands', effect: 'allow' },
  { action: 'read', target: 'source-files', effect: 'allow' },
  { action: 'write', target: 'source-files', effect: 'deny' },
];

const ADJUDICATION_PERMS: readonly RolePermission[] = [
  { action: 'read', target: 'all-artifacts', effect: 'allow' },
  { action: 'read', target: 'receipts', effect: 'allow' },
  { action: 'override', target: 'role-decisions', effect: 'allow' },
  { action: 'block', target: 'execution', effect: 'allow' },
  { action: 'write', target: 'adjudication-receipts', effect: 'allow' },
];

// ── Receipt templates ────────────────────────────────────────────────────

function makeReceipt(role: HostKitRole, status: ReceiptStatus, decision: string, evidenceRefs: readonly string[]): HostKitReceipt {
  return {
    receipt_id: `receipt-${role}-${Date.now()}`,
    role,
    issued_at: new Date().toISOString(),
    status,
    decision,
    evidence_refs: evidenceRefs,
    authority: 'host',
    fallback: 'deny',
  };
}

function makeReceiptWithFallback(role: HostKitRole, status: ReceiptStatus, decision: string, evidenceRefs: readonly string[], fallback: FallbackAction): HostKitReceipt {
  return {
    receipt_id: `receipt-${role}-${Date.now()}`,
    role,
    issued_at: new Date().toISOString(),
    status,
    decision,
    evidence_refs: evidenceRefs,
    authority: 'host',
    fallback,
  };
}

// ── Fallback templates ───────────────────────────────────────────────────

const DENY_FALLBACK: RoleFallback = {
  trigger: 'authority-denied',
  action: 'deny',
  reason: 'Host authority not granted; operation is not permitted.',
};

const HALT_FALLBACK: RoleFallback = {
  trigger: 'conflict-unresolved',
  action: 'halt',
  reason: 'Unresolvable conflict detected; execution halted pending adjudication.',
};

const CLARIFY_FALLBACK: RoleFallback = {
  trigger: 'ambiguous-requirement',
  action: 'request-clarification',
  reason: 'Requirement is ambiguous; cannot proceed without clarification.',
};

const ESCALATE_FALLBACK: RoleFallback = {
  trigger: 'capability-missing',
  action: 'escalate',
  reason: 'Required capability is missing; escalating to host.',
};

const DEFER_FALLBACK: RoleFallback = {
  trigger: 'domain-out-of-scope',
  action: 'defer',
  reason: 'Task is outside this role\'s domain; deferring to specialist.',
};

const BLOCK_FALLBACK: RoleFallback = {
  trigger: 'evidence-insufficient',
  action: 'block',
  reason: 'Insufficient evidence to proceed; blocking further action.',
};

// ── Role contracts ───────────────────────────────────────────────────────

export const COORDINATOR_CONTRACT: RoleContract = {
  role: 'coordinator',
  label: 'Coordinator',
  authority: HOST_AUTHORITY,
  permissions: DISPATCH_PERMS,
  receipt: makeReceipt('coordinator', 'issued', 'dispatch-assigned', []),
  fallback: DENY_FALLBACK,
};

export const ARCHITECT_INTEGRATOR_CONTRACT: RoleContract = {
  role: 'architect-integrator',
  label: 'Architect / Integrator',
  authority: ADVISORY_AUTHORITY,
  permissions: [
    ...SOURCE_AUTHORING_PERMS,
    { action: 'write', target: 'architecture-docs', effect: 'allow' },
    { action: 'propose', target: 'integration-plans', effect: 'allow' },
  ],
  receipt: makeReceiptWithFallback('architect-integrator', 'issued', 'design-proposed', [], 'halt'),
  fallback: HALT_FALLBACK,
};

export const IMPLEMENTER_CONTRACT: RoleContract = {
  role: 'implementer',
  label: 'Implementer',
  authority: DELEGATE_AUTHORITY,
  permissions: IMPLEMENTATION_PERMS,
  receipt: makeReceiptWithFallback('implementer', 'issued', 'work-completed', [], 'request-clarification'),
  fallback: CLARIFY_FALLBACK,
};

export const UTILITY_CONTRACT: RoleContract = {
  role: 'utility',
  label: 'Utility',
  authority: DELEGATE_AUTHORITY,
  permissions: UTILITY_PERMS,
  receipt: makeReceiptWithFallback('utility', 'issued', 'tool-executed', [], 'escalate'),
  fallback: ESCALATE_FALLBACK,
};

export const VERIFIER_CONTRACT: RoleContract = {
  role: 'verifier',
  label: 'Verifier',
  authority: DELEGATE_AUTHORITY,
  permissions: VERIFICATION_PERMS,
  receipt: makeReceiptWithFallback('verifier', 'issued', 'verification-complete', [], 'block'),
  fallback: BLOCK_FALLBACK,
};

export const REVIEWER_CONTRACT: RoleContract = {
  role: 'reviewer',
  label: 'Reviewer',
  authority: DELEGATE_AUTHORITY,
  permissions: REVIEW_PERMS,
  receipt: makeReceiptWithFallback('reviewer', 'issued', 'review-complete', [], 'request-clarification'),
  fallback: CLARIFY_FALLBACK,
};

export const SPECIALIST_CONTRACT: RoleContract = {
  role: 'specialist',
  label: 'Specialist',
  authority: DELEGATE_AUTHORITY,
  permissions: SPECIALIST_PERMS,
  receipt: makeReceiptWithFallback('specialist', 'issued', 'specialist-findings', [], 'defer'),
  fallback: DEFER_FALLBACK,
};

export const ADJUDICATOR_CONTRACT: RoleContract = {
  role: 'adjudicator',
  label: 'Adjudicator',
  authority: OVERRIDE_AUTHORITY,
  permissions: ADJUDICATION_PERMS,
  receipt: makeReceiptWithFallback('adjudicator', 'issued', 'adjudication-decision', [], 'escalate'),
  fallback: ESCALATE_FALLBACK,
};

// ── Registry ─────────────────────────────────────────────────────────────

export const ALL_ROLE_CONTRACTS: readonly RoleContract[] = [
  COORDINATOR_CONTRACT,
  ARCHITECT_INTEGRATOR_CONTRACT,
  IMPLEMENTER_CONTRACT,
  UTILITY_CONTRACT,
  VERIFIER_CONTRACT,
  REVIEWER_CONTRACT,
  SPECIALIST_CONTRACT,
  ADJUDICATOR_CONTRACT,
] as const;

export const ROLE_BY_NAME: Readonly<Record<HostKitRole, RoleContract>> = {
  coordinator: COORDINATOR_CONTRACT,
  'architect-integrator': ARCHITECT_INTEGRATOR_CONTRACT,
  implementer: IMPLEMENTER_CONTRACT,
  utility: UTILITY_CONTRACT,
  verifier: VERIFIER_CONTRACT,
  reviewer: REVIEWER_CONTRACT,
  specialist: SPECIALIST_CONTRACT,
  adjudicator: ADJUDICATOR_CONTRACT,
} as const;

export class HostKitRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostKitRoleError';
  }
}

export function assertRoleContract(value: RoleContract): void {
  const failures: string[] = [];
  if (!value.role) failures.push('role');
  if (!value.label) failures.push('label');
  if (!value.authority) failures.push('authority');
  if (!value.permissions || value.permissions.length === 0) failures.push('permissions');
  if (!value.receipt) failures.push('receipt');
  if (!value.fallback) failures.push('fallback');
  if (failures.length > 0) {
    throw new HostKitRoleError(`Role contract is incomplete: ${failures.join(', ')}`);
  }
}

export function getRoleContract(role: HostKitRole): RoleContract {
  const contract = ROLE_BY_NAME[role];
  if (!contract) {
    throw new HostKitRoleError(`Unknown host-kit role: ${role}`);
  }
  return contract;
}
