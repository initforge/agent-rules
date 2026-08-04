/**
 * host-kit/registry/index.ts — Barrel export for host-kit role/capability contracts.
 *
 * All role and capability contracts are model-neutral and portable.
 * No provider or model IDs appear in any portable prompt shape.
 * Dirty work is preserved; generated/ and .agent/ paths are never referenced.
 */

export type {
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
  CapabilityClaim,
  PortablePrompt,
} from './types.js';

export {
  COORDINATOR_CONTRACT,
  ARCHITECT_INTEGRATOR_CONTRACT,
  IMPLEMENTER_CONTRACT,
  UTILITY_CONTRACT,
  VERIFIER_CONTRACT,
  REVIEWER_CONTRACT,
  SPECIALIST_CONTRACT,
  ADJUDICATOR_CONTRACT,
  ALL_ROLE_CONTRACTS,
  ROLE_BY_NAME,
  HostKitRoleError,
  assertRoleContract,
  getRoleContract,
} from './roles.js';

export {
  CAPABILITY_CATALOG,
  type Capability,
  type CapabilityContract,
  getCapabilitiesForRole,
  getPortablePromptCapabilities,
  validateCapabilityForRole,
} from './capabilities.js';
