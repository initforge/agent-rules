export * from './state/checkpoint-resume.js';
export * from './state/live-amendment.js';
export * from './state/current-pointer.js';
export * from './state/execution-authority.js';
export * from './state/semantic-state-validator.js';
export * from './state/goal-supersession.js';

export * from './secure-fs.js';
export * from './telemetry.js';
export * from './contracts.js';
export { WorkLedger } from './ledger.js';
export * from './northstar/index.js';
export * from './runner/platform.js';
export * from './runner/baseline-gate.js';
export * from './runner/agent-driver.js';
export * from './runner/opencode-config.js';
// cross-host-handoff exports ContextCapsule/buildContextCapsule under names that
// now collide with the canonical northstar/context-capsule contract; re-export
// the handoff API explicitly (minus those two) so the barrel stays unambiguous.
export {
  HandoffExecutionMode,
  HANDOFF_ENVELOPE_SCHEMA,
  SelectedCapabilities,
  ProofObligation,
  CrossHostHandoffEnvelope,
  HandoffGuardCode,
  HandoffGuardError,
  CAPABILITY_PROJECTION_STATES,
  CapabilityProjectionState,
  CapabilityProjection,
  CONTEXT_CAPSULE_CATEGORIES,
  ContextCapsuleCategory,
  validateEnvelopeShape,
  hashEnvelopeBytes,
  verifyEnvelopeIntegrity,
  assertSafeToEdit,
  acknowledgeEnvelope,
  resolveExecutionContract,
  HandoffHostAdapter,
  getHandoffHostAdapter,
  listHandoffDialectHosts,
  createHandoffEnvelope,
} from './cross-host-handoff.js';
