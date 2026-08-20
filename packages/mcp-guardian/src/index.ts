/**
 * index.ts — public API of @initforge/agent-rules-mcp-guardian.
 */
export * from './types.js';
export { Broker, BrokerError, BROKER_ERRORS } from './broker/broker.js';
export {
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition,
  receipt,
} from './broker/lease-machine.js';
export { StateStore, defaultStateDir, SCHEMA_VERSION } from './state/store.js';
export { Guardian } from './guardian/guardian.js';
export { X11Backend, defaultExec } from './guardian/x11.js';
export { runPlacement, PlacementError } from './guardian/placement.js';
export {
  captureLaunchIdentity,
  attributeProviderWindow,
  revalidateWindow,
  processMatches,
  toProcessFingerprint,
} from './guardian/attribution.js';
export { terminateFingerprintedTree, fingerprintProcess, revalidateFingerprint, procStartTime, findDescendants } from './util/procfs.js';
export { handshake, McpClientError } from './mcp/client.js';
export { McpHttpBroker } from './mcp/http-broker.js';
export { Registry, extendProvider } from './projection/registry.js';
export { Projector, gitHead } from './projection/projector.js';
export type { HostSessionAdapter, HostAttestation, HostSessionBinding, HostMcpProjection, RuntimeReconcileResult } from './hosts/contract.js';
export { binding, registerWithBroker } from './hosts/contract.js';
export { OpencodeAdapter } from './hosts/opencode.js';
export { DeepseekHarnessAdapter, resolveDshBinary, encodeProjectSlug, decodeProjectSlug } from './hosts/deepseek-harness.js';
export { CodexCliAdapter, assessCodexDesktop, codexDesktopDetect, CODEX_DESKTOP_BINARIES } from './hosts/codex.js';
