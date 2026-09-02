import { createHash } from 'node:crypto';
import type { HostId } from './host-adapters.js';

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'BROKEN' | 'UNKNOWN' | 'UNSUPPORTED' | 'UNAVAILABLE' | 'NOT_APPLICABLE' | 'NEEDS_USER';
export const HEALTH_STATUSES: readonly HealthStatus[] = ['HEALTHY', 'DEGRADED', 'BROKEN', 'UNKNOWN', 'UNSUPPORTED', 'UNAVAILABLE', 'NOT_APPLICABLE', 'NEEDS_USER'];
export type HealthComponent = 'rules' | 'skills' | 'hooks' | 'mcp' | 'plugins' | 'plan-mode' | 'proof-outcome' | 'permissions' | 'sandbox' | 'profiles' | 'installer' | 'host-adapter';
export interface HealthProbeContract { readonly id: string; readonly component: HealthComponent; readonly owner: string; readonly required: boolean; readonly live: boolean; readonly version: string; }
export interface HealthReceipt { readonly schema: 'agent-rules/health-receipt/v1'; readonly receipt_id: string; readonly host: string; readonly host_version: string; readonly component: HealthComponent; readonly status: HealthStatus; readonly candidate_hash: string; readonly config_hash: string; readonly source_hash: string; readonly probe_contract: HealthProbeContract; readonly observed_at: string; readonly environment: string; readonly evidence: readonly string[]; readonly error?: string; readonly receipt_hash: string; }
export interface HealthReduction { readonly status: HealthStatus; readonly required: readonly HealthComponent[]; readonly missing: readonly HealthComponent[]; readonly blocking: readonly HealthReceipt[]; }

export const HEALTH_PROBE_REGISTRY: Readonly<Record<HealthComponent, HealthProbeContract>> = {
  rules: { id: 'rules-hash-readback-v1', component: 'rules', owner: 'rules/20-proof-outcome.md', required: true, live: true, version: '1' },
  skills: { id: 'skills-inventory-resolution-v1', component: 'skills', owner: 'rules/30-context-skill-mcp.md', required: true, live: true, version: '1' },
  hooks: { id: 'optional-hook-enhancement-v1', component: 'hooks', owner: 'platforms/platform-contracts.json', required: false, live: false, version: '1' },
  mcp: { id: 'mcp-registration-handshake-v1', component: 'mcp', owner: 'packages/cli/src/integration/provisioning.ts', required: false, live: true, version: '1' },
  plugins: { id: 'optional-static-plugin-v1', component: 'plugins', owner: 'platforms/platform-contracts.json', required: false, live: false, version: '1' },
  'plan-mode': { id: 'native-plan-roundtrip-v1', component: 'plan-mode', owner: 'rules/10-execution-planning-delegation.md', required: false, live: true, version: '1' },
  'proof-outcome': { id: 'proof-reducer-fail-closed-v2', component: 'proof-outcome', owner: 'rules/20-proof-outcome.md', required: true, live: true, version: '2' },
  permissions: { id: 'permission-positive-negative-v1', component: 'permissions', owner: 'packages/kernel/src/northstar/rule-enforcement.ts', required: true, live: true, version: '1' },
  sandbox: { id: 'sandbox-boundary-v1', component: 'sandbox', owner: 'packages/kernel/src/northstar/rule-enforcement.ts', required: true, live: true, version: '1' },
  profiles: { id: 'profile-manifest-freshness-v1', component: 'profiles', owner: 'profiles/', required: false, live: true, version: '1' },
  installer: { id: 'installer-readback-receipt-v1', component: 'installer', owner: 'packages/cli/src/runtime/installation-coordinator.ts', required: true, live: true, version: '1' },
  'host-adapter': { id: 'installation-coordinator-live-readback-v1', component: 'host-adapter', owner: 'packages/cli/src/runtime/installation-coordinator.ts', required: true, live: true, version: '1' },
};

function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
export function healthReceiptHash(receipt: Omit<HealthReceipt, 'receipt_hash'>): string { return sha256(JSON.stringify(receipt)); }
export function createHealthReceipt(input: Omit<HealthReceipt, 'schema' | 'receipt_hash'>): HealthReceipt { const body: Omit<HealthReceipt, 'receipt_hash'> = { schema: 'agent-rules/health-receipt/v1', ...input }; return { ...body, receipt_hash: healthReceiptHash(body) }; }
export function isFreshHealthReceipt(receipt: HealthReceipt, identity: Pick<HealthReceipt, 'host' | 'host_version' | 'candidate_hash' | 'config_hash' | 'source_hash'>, probeContract: HealthProbeContract): boolean {
  const { receipt_hash: _receiptHash, ...receiptBody } = receipt;
  return receipt.schema === 'agent-rules/health-receipt/v1' && receipt.host === identity.host && receipt.host_version === identity.host_version && receipt.candidate_hash === identity.candidate_hash && receipt.config_hash === identity.config_hash && receipt.source_hash === identity.source_hash && JSON.stringify(receipt.probe_contract) === JSON.stringify(probeContract) && receipt.receipt_hash === healthReceiptHash(receiptBody);
}
export function reduceHealth(receipts: readonly HealthReceipt[], required: readonly HealthComponent[]): HealthReduction {
  const latest = new Map<HealthComponent, HealthReceipt>();
  for (const receipt of receipts) { const prior = latest.get(receipt.component); if (!prior || receipt.observed_at > prior.observed_at) latest.set(receipt.component, receipt); }
  const missing = required.filter((component) => !latest.has(component));
  const requiredSet = new Set(required);
  const blocking = [...latest.values()].filter((receipt) => requiredSet.has(receipt.component) && ['BROKEN', 'UNKNOWN', 'UNSUPPORTED', 'UNAVAILABLE', 'NEEDS_USER'].includes(receipt.status));
  let status: HealthStatus = 'HEALTHY';
  if (missing.length > 0) status = 'UNKNOWN';
  else if (blocking.some((r) => r.status === 'BROKEN')) status = 'BROKEN';
  else if (blocking.some((r) => r.status === 'NEEDS_USER')) status = 'NEEDS_USER';
  else if (blocking.some((r) => r.status === 'UNKNOWN')) status = 'UNKNOWN';
  else if (blocking.some((r) => r.status === 'UNAVAILABLE')) status = 'UNAVAILABLE';
  else if (blocking.some((r) => r.status === 'UNSUPPORTED')) status = 'UNSUPPORTED';
  else if (blocking.length > 0 || [...latest.values()].some((r) => r.status === 'DEGRADED')) status = 'DEGRADED';
  return { status, required: [...required], missing, blocking };
}
/** Required checks follow the host's real surfaces; an absent surface is N/A, not failure. */
export function requiredHealthComponentsForHost(host: HostId): readonly HealthComponent[] {
  void host;
  const required: HealthComponent[] = ['rules', 'skills', 'proof-outcome', 'permissions', 'installer', 'host-adapter'];
  // MCP registration is provider-level optional unless an active task/profile
  // explicitly promotes a provider to required. A registry entry alone never
  // makes the host core health depend on external provisioning.
  return required;
}
