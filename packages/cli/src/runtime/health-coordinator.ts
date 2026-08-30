import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  HEALTH_PROBE_REGISTRY, createHealthReceipt, reduceHealth, requiredHealthComponentsForHost,
  getNativeContract, getHostSupport, planProofRoute, completeProofRoute,
  type HealthComponent, type HealthReceipt, type HealthStatus,
} from '@initforge/agent-rules-kernel/northstar/index.js';
import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';
import type { CertificationReceipt, ClaimVerification } from '../native/types.js';
import { COORDINATOR_HOSTS, createInstallationCoordinator, type StaticReadback } from './installation-coordinator.js';

export interface ComponentDiagnostic {
  component: string; status: HealthStatus; expected: string; actual: string; path?: string; authority?: string; action: string;
}
export interface LiveHealthHostReport {
  host: string; status: HealthStatus; authorityTier: 'NATIVE_ENFORCED' | 'NATIVE_ADVISORY' | 'MANAGED' | 'UNAVAILABLE';
  reason: string; action: string; components: Readonly<Record<string, HealthStatus>>; diagnostics: readonly ComponentDiagnostic[];
}
export interface LiveHealthReport {
  status: HealthStatus; host: string; receipts: readonly HealthReceipt[]; missing: readonly string[]; blocking: readonly string[]; hosts: readonly LiveHealthHostReport[];
}

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
function hashFile(file: string): string { try { return sha256(fs.readFileSync(file)); } catch { return sha256('missing'); } }
function claimStatus(claim: ClaimVerification | undefined): HealthStatus {
  if (!claim) return 'UNKNOWN';
  if (claim.status === 'PASS') return 'HEALTHY';
  if (claim.status === 'NEEDS_USER') return 'NEEDS_USER';
  if (claim.status === 'UNSUPPORTED') return 'UNSUPPORTED';
  if (claim.status === 'STALE') return 'UNKNOWN';
  return 'BROKEN';
}
function overall(statuses: readonly HealthStatus[]): HealthStatus {
  for (const status of ['BROKEN', 'NEEDS_USER', 'UNKNOWN', 'UNAVAILABLE', 'UNSUPPORTED', 'DEGRADED'] as const) if (statuses.includes(status)) return status;
  return 'HEALTHY';
}
function actionFor(status: HealthStatus, host: string): string {
  if (status === 'HEALTHY' || status === 'NOT_APPLICABLE') return 'No action required.';
  if (status === 'DEGRADED') return `Static capability is installed. Use the host-native surface if stronger live authority is needed for ${host}.`;
  if (status === 'NEEDS_USER') return `Resolve the reported user-owned collision or external dependency, then run agent-rules install --host ${host}.`;
  if (status === 'UNAVAILABLE') return 'Install or start this host, then rerun doctor.';
  if (status === 'UNSUPPORTED') return 'This optional host capability is unsupported; static rules and skills remain usable.';
  return `Run agent-rules install --host ${host}, then rerun agent-rules doctor --host ${host}.`;
}

function supportStatus(mode: string | undefined, hostPresent: HealthStatus): HealthStatus {
  if (hostPresent !== 'HEALTHY') return hostPresent;
  if (!mode || mode === 'unsupported' || mode === 'not-applicable') return 'UNSUPPORTED';
  return mode === 'native-enforced' ? 'DEGRADED' : 'DEGRADED';
}

function statusesFor(host: string, native: CertificationReceipt | undefined, readback: StaticReadback | undefined, proofOutcome: boolean): Record<HealthComponent, HealthStatus> {
  const support = getHostSupport(host);
  const hostPresent = readback?.authority_tier === 'UNAVAILABLE' ? 'UNAVAILABLE' : claimStatus(native?.claims.HOST_PRESENT);
  const hostBound = (status: HealthStatus): HealthStatus => hostPresent === 'HEALTHY' ? status : hostPresent;
  const policy = claimStatus(native?.claims.NATIVE_POLICY);
  const staticPolicy: HealthStatus = hostPresent !== 'HEALTHY' ? hostPresent : policy === 'HEALTHY' ? 'DEGRADED' : policy;
  return {
    rules: hostBound(claimStatus(native?.claims.NATIVE_INSTALLED)),
    skills: hostBound(claimStatus(native?.claims.NATIVE_SKILLS)),
    hooks: 'NOT_APPLICABLE',
    mcp: hostBound(claimStatus(native?.claims.NATIVE_MCP)),
    plugins: host === 'command-code' ? hostBound(claimStatus(native?.claims.NATIVE_INSTALLED)) : 'NOT_APPLICABLE',
    'plan-mode': supportStatus(support?.components.plan.mode, hostPresent),
    'proof-outcome': proofOutcome ? 'HEALTHY' : 'BROKEN',
    permissions: staticPolicy,
    sandbox: supportStatus(support?.components.sandbox.mode, hostPresent) === 'UNSUPPORTED' ? 'UNSUPPORTED' : staticPolicy,
    profiles: host === 'deepseek-harness' ? (claimStatus(native?.claims.NATIVE_MCP) === 'NEEDS_USER' ? 'NEEDS_USER' : hostBound('HEALTHY')) : 'NOT_APPLICABLE',
    installer: hostPresent !== 'HEALTHY' ? hostPresent : readback?.static ? 'HEALTHY' : 'BROKEN',
    'host-adapter': hostPresent !== 'HEALTHY' ? hostPresent : readback?.native ? 'HEALTHY' : claimStatus(native?.claims.NATIVE_DISCOVERED),
  };
}

function detailFor(claim: ClaimVerification | undefined, fallback: string): string {
  return claim?.evidence.map((entry) => entry && typeof entry === 'object' ? (entry as { detail?: unknown; reason?: unknown }).detail ?? (entry as { reason?: unknown }).reason : undefined)
    .find((value): value is string => typeof value === 'string' && value.length > 0) ?? fallback;
}

function diagnosticsFor(host: string, statuses: Readonly<Record<HealthComponent, HealthStatus>>, native: CertificationReceipt | undefined): ComponentDiagnostic[] {
  const contract = getNativeContract(host);
  const discovery = native?.claims.NATIVE_DISCOVERED.evidence.find((entry) => entry && typeof entry === 'object') as { homeDir?: unknown } | undefined;
  const home = typeof discovery?.homeDir === 'string' ? discovery.homeDir : '';
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const resolvePath = (value?: string): string | undefined => value ? value.replace(/\$[A-Z_]+/, home).replace('~', userHome) : undefined;
  const claims: Partial<Record<HealthComponent, ClaimVerification | undefined>> = {
    rules: native?.claims.NATIVE_INSTALLED, skills: native?.claims.NATIVE_SKILLS, mcp: native?.claims.NATIVE_MCP,
    permissions: native?.claims.NATIVE_POLICY, sandbox: native?.claims.NATIVE_POLICY, 'host-adapter': native?.claims.NATIVE_DISCOVERED,
  };
  const paths: Partial<Record<HealthComponent, string | undefined>> = {
    rules: resolvePath(contract?.paths.instructionPath), skills: resolvePath(contract?.paths.skillPath), mcp: resolvePath(contract?.paths.mcpPath),
  };
  return (Object.entries(statuses) as Array<[HealthComponent, HealthStatus]>).filter(([, status]) => !['HEALTHY', 'NOT_APPLICABLE'].includes(status)).map(([component, status]) => ({
    component, status, expected: `compiled ${component} projection matches installed native bytes`,
    actual: detailFor(claims[component], status === 'DEGRADED' ? 'static projection is present; host-enforced live authority was not observed' : `${component} readback is ${status}`),
    ...(paths[component] ? { path: paths[component] } : {}), authority: component === 'permissions' || component === 'sandbox' ? 'host-owned' : 'agent-rules static readback', action: actionFor(status, host),
  }));
}

export async function collectLiveHealth(root: string, host = 'all'): Promise<LiveHealthReport> {
  const coordinator = createInstallationCoordinator();
  const hosts = host === 'all' ? COORDINATOR_HOSTS : [host];
  const observed = await coordinator.doctor(hosts);
  const assetsRoot = coordinator.assetsRoot();
  const sourceRoot = fs.existsSync(path.join(root, 'rules', 'manifest.yaml')) ? root : assetsRoot;
  const candidateHash = hashFile(path.join(assetsRoot, 'manifest.json'));
  const sourceHash = hashFile(path.join(sourceRoot, 'rules', 'manifest.yaml'));
  let proofOutcome = false;
  try {
    const request = { task_id: 'doctor-proof-outcome', repository: sourceRoot, trigger: { changed_files: ['rules/20-proof-outcome.md'] }, claims: [{ id: 'doctor-claim', claim: 'reducer fails closed' }], risks: [] };
    const plan = planProofRoute(request);
    const receipt = completeProofRoute(request, plan, plan.execution.selected_for_run.map((proof_id) => ({ proof_id, status: 'BLOCKED' as const })));
    proofOutcome = receipt.receipt.final_status !== 'PASS';
  } catch {}
  const receipts: HealthReceipt[] = [];
  const reports: LiveHealthHostReport[] = [];
  for (const name of hosts) {
    const native = observed.native?.[name];
    const readback = observed.readback?.[name];
    const statuses = statusesFor(name, native, readback, proofOutcome);
    const hostReceipts = (Object.keys(statuses) as HealthComponent[]).map((component) => createHealthReceipt({
      receipt_id: randomUUID(), host: name, host_version: native?.git_head ?? 'unobserved', component, status: statuses[component],
      candidate_hash: candidateHash, config_hash: sha256(JSON.stringify(native?.native_readback ?? {})), source_hash: sourceHash,
      probe_contract: HEALTH_PROBE_REGISTRY[component], observed_at: observed.observed_at, environment: `${process.platform}/${process.version}`,
      evidence: [native ? `host-certification:${native.status}` : 'host-certification:missing'], ...(observed.errors?.[name] ? { error: observed.errors[name] } : {}),
    }));
    receipts.push(...hostReceipts);
    const reduced = reduceHealth(hostReceipts, requiredHealthComponentsForHost(name as HostId));
    const reason = reduced.blocking.length ? reduced.blocking.map((item) => `${item.component}=${item.status}`).join(', ') : 'All required static host surfaces passed fresh readback.';
    reports.push({ host: name, status: reduced.status, authorityTier: readback?.authority_tier ?? native?.authority_tier ?? 'UNAVAILABLE', reason, action: actionFor(reduced.status, name), components: statuses, diagnostics: diagnosticsFor(name, statuses, native) });
  }
  return { status: overall(reports.map((report) => report.status)), host, receipts, missing: reports.flatMap((report) => Object.entries(report.components).filter(([, status]) => status === 'UNKNOWN').map(([component]) => `${report.host}:${component}`)), blocking: reports.filter((report) => !['HEALTHY', 'NOT_APPLICABLE'].includes(report.status)).map((report) => `${report.host}:${report.status}`), hosts: reports };
}
