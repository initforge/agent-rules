/**
 * host-kit/registry/capabilities.ts — Capability contracts for host-kit roles.
 *
 * Capabilities are model-neutral declarations of what a role can do.
 * No provider or model IDs appear in any portable prompt shape.
 * Dirty work is preserved; generated/ and .agent/ paths are never referenced.
 */

import type { HostKitRole, CapabilityClaim } from './types.js';

export const CAPABILITY_CATALOG = [
  'dispatch',
  'child-dispatch',
  'focused-verification',
  'approved-integration',
  'source-reading',
  'source-writing',
  'test-authoring',
  'test-execution',
  'tool-execution',
  'evidence-collection',
  'diff-review',
  'evidence-attestation',
  'design-proposal',
  'integration-planning',
  'domain-expertise',
  'conflict-resolution',
  'adjudication',
  'blocking',
  'escalation',
] as const;

export type Capability = (typeof CAPABILITY_CATALOG)[number];

export interface CapabilityContract {
  readonly capability: Capability;
  readonly required_for: readonly HostKitRole[];
  readonly description: string;
  readonly portable_prompt: boolean;
}

const CAPABILITY_CONTRACTS: readonly CapabilityContract[] = [
  {
    capability: 'dispatch',
    required_for: ['coordinator'],
    description: 'Dispatch child agents to execute bounded tasks.',
    portable_prompt: true,
  },
  {
    capability: 'child-dispatch',
    required_for: ['coordinator'],
    description: 'Dispatch children with depth=1 constraint.',
    portable_prompt: true,
  },
  {
    capability: 'focused-verification',
    required_for: ['coordinator', 'verifier'],
    description: 'Run focused verification against acceptance criteria.',
    portable_prompt: true,
  },
  {
    capability: 'approved-integration',
    required_for: ['coordinator'],
    description: 'Integrate approved worker output into the plan.',
    portable_prompt: true,
  },
  {
    capability: 'source-reading',
    required_for: ['coordinator', 'architect-integrator', 'implementer', 'utility', 'verifier', 'reviewer', 'specialist', 'adjudicator'],
    description: 'Read source files within role scope.',
    portable_prompt: true,
  },
  {
    capability: 'source-writing',
    required_for: ['architect-integrator', 'implementer', 'specialist'],
    description: 'Write or modify source files within assigned scope.',
    portable_prompt: true,
  },
  {
    capability: 'test-authoring',
    required_for: ['implementer'],
    description: 'Write test files for implemented changes.',
    portable_prompt: true,
  },
  {
    capability: 'test-execution',
    required_for: ['verifier', 'implementer'],
    description: 'Execute approved test commands.',
    portable_prompt: true,
  },
  {
    capability: 'tool-execution',
    required_for: ['utility'],
    description: 'Execute tool commands for supporting tasks.',
    portable_prompt: true,
  },
  {
    capability: 'evidence-collection',
    required_for: ['verifier', 'reviewer', 'specialist'],
    description: 'Collect and record verification evidence.',
    portable_prompt: true,
  },
  {
    capability: 'diff-review',
    required_for: ['reviewer', 'adjudicator'],
    description: 'Inspect diffs and review evidence.',
    portable_prompt: true,
  },
  {
    capability: 'evidence-attestation',
    required_for: ['reviewer', 'verifier'],
    description: 'Attest to the quality and completeness of evidence.',
    portable_prompt: true,
  },
  {
    capability: 'design-proposal',
    required_for: ['architect-integrator'],
    description: 'Propose architectural or integration designs.',
    portable_prompt: true,
  },
  {
    capability: 'integration-planning',
    required_for: ['architect-integrator'],
    description: 'Plan integration steps and dependency resolution.',
    portable_prompt: true,
  },
  {
    capability: 'domain-expertise',
    required_for: ['specialist'],
    description: 'Apply domain-specific knowledge to bounded tasks.',
    portable_prompt: true,
  },
  {
    capability: 'conflict-resolution',
    required_for: ['adjudicator'],
    description: 'Resolve conflicts between role decisions.',
    portable_prompt: true,
  },
  {
    capability: 'adjudication',
    required_for: ['adjudicator'],
    description: 'Issue binding decisions on contested work.',
    portable_prompt: true,
  },
  {
    capability: 'blocking',
    required_for: ['verifier', 'adjudicator'],
    description: 'Block execution when evidence is insufficient or rules are violated.',
    portable_prompt: true,
  },
  {
    capability: 'escalation',
    required_for: ['utility', 'adjudicator'],
    description: 'Escalate unresolved issues to the host or adjudicator.',
    portable_prompt: true,
  },
] as const;

export function getCapabilitiesForRole(role: HostKitRole): readonly CapabilityContract[] {
  return CAPABILITY_CONTRACTS.filter((c) => c.required_for.includes(role));
}

export function getPortablePromptCapabilities(role: HostKitRole): readonly CapabilityClaim[] {
  return getCapabilitiesForRole(role).map((c) => ({
    capability: c.capability,
    status: 'claimed' as const,
    evidence: c.description,
  }));
}

export function validateCapabilityForRole(capability: Capability, role: HostKitRole): boolean {
  const contract = CAPABILITY_CONTRACTS.find((c) => c.capability === capability);
  if (!contract) return false;
  return contract.required_for.includes(role);
}
