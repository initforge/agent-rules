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
import { expandNativePath } from '../native/probe.js';
import { COORDINATOR_HOSTS, createInstallationCoordinator, type StaticReadback } from './installation-coordinator.js';
import { readGlobalOwnershipManifest, type GlobalOwnershipManifest } from './composed-installer.js';
import YAML from 'yaml';

export interface ComponentDiagnostic {
  component: string; status: HealthStatus; expected: string; actual: string; path?: string; authority?: string; action: string;
}
export interface LiveHealthHostReport {
  host: string; status: HealthStatus; authorityTier: 'NATIVE_ENFORCED' | 'NATIVE_ADVISORY' | 'MANAGED' | 'UNAVAILABLE';
  reason: string; action: string; components: Readonly<Record<string, HealthStatus>>; diagnostics: readonly ComponentDiagnostic[]; catalog: CatalogDiagnostic;
}
export interface CatalogDiagnostic {
  canonical_library_valid: boolean;
  canonical_active_skills: number;
  global_base_valid: boolean;
  global_base_ids: readonly string[];
  global_observed_ids: readonly string[];
  global_agent_rules_owned_ids: readonly string[];
  global_profile_ids: readonly string[];
  global_missing_base_ids: readonly string[];
  global_stale_owned_ids: readonly string[];
  user_owned_collision_ids: readonly string[];
  host_native_or_user_owned_ids: readonly string[];
  task_selected_ids: readonly string[];
  task_observed_ids: readonly string[];
  task_projection_status: string | null;
  task_projection_valid: boolean;
  base_discovery_chars: number;
  profile_addition_chars: number;
  task_selected_addition_chars: number;
  agent_rules_effective_chars: number;
  host_observed_total_chars: number | null;
  host_budget: number;
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

export function proofOutcomeHealthStatus(reducerFailsClosed: boolean): HealthStatus {
  return reducerFailsClosed ? 'DEGRADED' : 'BROKEN';
}

function statusesFor(host: string, native: CertificationReceipt | undefined, readback: StaticReadback | undefined, proofReducerFailsClosed: boolean): Record<HealthComponent, HealthStatus> {
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
    'proof-outcome': hostBound(proofOutcomeHealthStatus(proofReducerFailsClosed)),
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
  const resolvePath = (value?: string): string | undefined => value ? expandNativePath(value, home, userHome) : undefined;
  const claims: Partial<Record<HealthComponent, ClaimVerification | undefined>> = {
    rules: native?.claims.NATIVE_INSTALLED, skills: native?.claims.NATIVE_SKILLS, mcp: native?.claims.NATIVE_MCP,
    permissions: native?.claims.NATIVE_POLICY, sandbox: native?.claims.NATIVE_POLICY, 'host-adapter': native?.claims.NATIVE_DISCOVERED,
  };
  const paths: Partial<Record<HealthComponent, string | undefined>> = {
    rules: resolvePath(contract?.paths.instructionPath), skills: resolvePath(contract?.paths.skillPath), mcp: resolvePath(contract?.paths.mcpPath),
  };
  return (Object.entries(statuses) as Array<[HealthComponent, HealthStatus]>).filter(([, status]) => !['HEALTHY', 'NOT_APPLICABLE'].includes(status)).map(([component, status]) => ({
    component, status, expected: `compiled ${component} projection matches installed native bytes`,
    actual: component === 'proof-outcome' && status === 'DEGRADED'
      ? 'proof reducer fails closed, but live model-turn completion behavior was not observed'
      : detailFor(claims[component], status === 'DEGRADED' ? 'static projection is present; host-enforced live authority was not observed' : `${component} readback is ${status}`),
    ...(paths[component] ? { path: paths[component] } : {}), authority: component === 'permissions' || component === 'sandbox' ? 'host-owned' : component === 'proof-outcome' ? 'kernel reducer + model-mediated host intake' : 'agent-rules static readback', action: actionFor(status, host),
  }));
}

function description(file: string): string {
  try {
    const body = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    return match ? String(YAML.parse(match[1])?.description ?? '') : '';
  } catch { return ''; }
}

export interface CatalogInspectionOptions {
  readonly globalSkillRoot?: string;
  readonly ownershipManifest?: GlobalOwnershipManifest | null;
  readonly hostBudget?: number;
}

function idsUnder(root: string): string[] {
  return fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'SKILL.md'))).map((entry) => entry.name).sort()
    : [];
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => path.resolve(value).replace(/\\/g, '/').toLowerCase();
  return normalize(left) === normalize(right);
}

export async function catalogFor(host: string, sourceRoot: string, taskRoot: string, native: CertificationReceipt | undefined, options: CatalogInspectionOptions = {}): Promise<CatalogDiagnostic> {
  const registryFile = path.join(sourceRoot, 'registry', 'skills.yaml');
  type RegistryRow = { id: string; lifecycle: string; activation: string };
  const registry = (fs.existsSync(registryFile) ? YAML.parse(fs.readFileSync(registryFile, 'utf8')) : { skills: [] }) as { skills: RegistryRow[] };
  const active = (registry.skills ?? []).filter((entry) => entry.lifecycle === 'active');
  const implicit = active.filter((entry) => entry.activation === 'implicit');
  const explicitIds = new Set(active.filter((entry) => entry.activation === 'explicit-only').map((entry) => entry.id));
  const canonicalLibraryValid = active.every((entry) => fs.existsSync(path.join(sourceRoot, 'skills', entry.id, 'SKILL.md')));
  const contract = getNativeContract(host);
  const discovery = native?.claims.NATIVE_DISCOVERED.evidence.find((entry) => entry && typeof entry === 'object') as { homeDir?: unknown } | undefined;
  const home = typeof discovery?.homeDir === 'string' ? discovery.homeDir : '';
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const skillPath = contract?.paths.skillPath ? expandNativePath(contract.paths.skillPath, home, userHome) : '';
  const skillRoot = options.globalSkillRoot ?? skillPath.replace(/[\\/]?<skill>[\\/]?SKILL\.md$/i, '').replace(/[\\/]?<skill>$/i, '');
  const observedIds = idsUnder(skillRoot);
  const ownership = options.ownershipManifest === undefined ? await readGlobalOwnershipManifest() : options.ownershipManifest;
  const ownedIds = Object.values(ownership?.projections ?? {})
    // Several native hosts intentionally share one global skill root (for
    // example Codex and Cursor).  Ownership belongs to the exact filesystem
    // projection path; the manifest platform is provenance, not an exclusive
    // namespace that can make a shared owned path look user-owned.
    .filter((projection) => projection.kind === 'skill' && samePath(path.dirname(projection.path), skillRoot))
    .map((projection) => path.basename(projection.path))
    .filter((id, index, values) => values.indexOf(id) === index)
    .sort();
  const ownedSet = new Set(ownedIds);
  const implicitIds = new Set(implicit.map((entry) => entry.id));
  const profileIds = new Set<string>();
  const profilesRoot = path.join(sourceRoot, 'profiles');
  if (fs.existsSync(profilesRoot)) for (const profile of fs.readdirSync(profilesRoot, { withFileTypes: true })) {
    if (!profile.isDirectory()) continue;
    for (const id of idsUnder(path.join(profilesRoot, profile.name, 'skills'))) profileIds.add(id);
  }
  const globalProfileIds = ownedIds.filter((id) => profileIds.has(id));
  const staleOwnedIds = ownedIds.filter((id) => !implicitIds.has(id) && !profileIds.has(id));
  const missingBaseIds = implicit.map((entry) => entry.id).filter((id) => !observedIds.includes(id) || !ownedSet.has(id)).sort();
  const collisionIds = implicit.map((entry) => entry.id).filter((id) => observedIds.includes(id) && !ownedSet.has(id)).sort();
  const hostOrUserIds = observedIds.filter((id) => !ownedSet.has(id) && !collisionIds.includes(id));
  let selected: string[] = [];
  let projected: string[] = [];
  let reused: string[] = [];
  let taskTargetRoot = '';
  let projectionStatus: string | null = null;
  try {
    const task = JSON.parse(fs.readFileSync(path.join(taskRoot, '.agent', 'current', 'state.json'), 'utf8'));
    if (task.skill_projection?.host === host) {
      selected = task.selected_skill_ids ?? [];
      projected = task.projected_skill_ids ?? [];
      reused = task.skill_projection.reused_skill_ids ?? [];
      taskTargetRoot = task.skill_projection.target_root ?? '';
      projectionStatus = task.skill_projection.status ?? null;
    }
  } catch {}
  const selectedExplicit = selected.filter((id) => explicitIds.has(id));
  const taskObservedIds = taskTargetRoot ? idsUnder(taskTargetRoot) : [];
  const taskExpectedIds = [...new Set([...projected, ...reused])].sort();
  const taskProjectionValid = projectionStatus === null
    || (projectionStatus === 'ACTIVE' && selectedExplicit.every((id) => taskObservedIds.includes(id)) && taskExpectedIds.every((id) => selectedExplicit.includes(id)))
    || (projectionStatus === 'UNSUPPORTED' && selectedExplicit.length === 0);
  const renderedChars = (id: string, template: string, base: string): number => id.length + 1 + description(path.join(base, id, 'SKILL.md')).length + 1 + template.replace('<skill>', id).length;
  const globalTemplate = contract?.paths.skillPath ?? '~/.agents/skills/<skill>/SKILL.md';
  const taskTemplate = contract?.paths.repositorySkillPath ?? '.agents/skills/<skill>/SKILL.md';
  const globalChars = implicit.reduce((sum: number, entry: RegistryRow) => sum + renderedChars(entry.id, globalTemplate, path.join(sourceRoot, 'skills')), 0);
  const profileChars = globalProfileIds.reduce((sum, id) => sum + renderedChars(id, globalTemplate, skillRoot), 0);
  const taskChars = projectionStatus === 'ACTIVE' ? selectedExplicit.reduce((sum, id) => sum + renderedChars(id, taskTemplate, path.join(sourceRoot, 'skills')), 0) : 0;
  const observedGlobalChars = observedIds.reduce((sum, id) => sum + id.length + 1 + description(path.join(skillRoot, id, 'SKILL.md')).length + 1 + path.join(skillRoot, id, 'SKILL.md').length, 0);
  const observedTaskChars = taskObservedIds.reduce((sum, id) => sum + id.length + 1 + description(path.join(taskTargetRoot, id, 'SKILL.md')).length + 1 + path.join(taskTargetRoot, id, 'SKILL.md').length, 0);
  const hostObservedChars = observedIds.length || taskObservedIds.length ? observedGlobalChars + observedTaskChars : null;
  const hostBudget = options.hostBudget ?? 16000;
  return {
    canonical_library_valid: canonicalLibraryValid,
    canonical_active_skills: active.length,
    global_base_valid: canonicalLibraryValid && missingBaseIds.length === 0 && staleOwnedIds.length === 0 && collisionIds.length === 0,
    global_base_ids: [...implicitIds].sort(),
    global_observed_ids: observedIds,
    global_agent_rules_owned_ids: ownedIds,
    global_profile_ids: globalProfileIds,
    global_missing_base_ids: missingBaseIds,
    global_stale_owned_ids: staleOwnedIds,
    user_owned_collision_ids: collisionIds,
    host_native_or_user_owned_ids: hostOrUserIds,
    task_selected_ids: selected,
    task_observed_ids: taskObservedIds,
    task_projection_status: projectionStatus,
    task_projection_valid: taskProjectionValid,
    base_discovery_chars: globalChars,
    profile_addition_chars: profileChars,
    task_selected_addition_chars: taskChars,
    agent_rules_effective_chars: globalChars + profileChars + taskChars,
    host_observed_total_chars: hostObservedChars,
    host_budget: hostBudget,
  };
}

export async function collectLiveHealth(root: string, host = 'all'): Promise<LiveHealthReport> {
  const coordinator = createInstallationCoordinator();
  const hosts = host === 'all' ? COORDINATOR_HOSTS : [host];
  const observed = await coordinator.doctor(hosts);
  const assetsRoot = coordinator.assetsRoot();
  const sourceRoot = fs.existsSync(path.join(root, 'rules', 'manifest.yaml')) ? root : assetsRoot;
  const candidateHash = hashFile(path.join(assetsRoot, 'manifest.json'));
  const sourceHash = hashFile(path.join(sourceRoot, 'rules', 'manifest.yaml'));
  let proofReducerFailsClosed = false;
  try {
    const request = { task_id: 'doctor-proof-outcome', repository: sourceRoot, trigger: { changed_files: ['rules/20-proof-outcome.md'] }, claims: [{ id: 'doctor-claim', claim: 'reducer fails closed' }], risks: [] };
    const plan = planProofRoute(request);
    const receipt = completeProofRoute(request, plan, plan.execution.selected_for_run.map((proof_id) => ({ proof_id, status: 'BLOCKED' as const })));
    proofReducerFailsClosed = receipt.receipt.final_status !== 'PASS';
  } catch {}
  const receipts: HealthReceipt[] = [];
  const reports: LiveHealthHostReport[] = [];
  for (const name of hosts) {
    const native = observed.native?.[name];
    const readback = observed.readback?.[name];
    const statuses = statusesFor(name, native, readback, proofReducerFailsClosed);
    const catalog = await catalogFor(name, sourceRoot, root, native);
    const hostPresent = statuses.skills !== 'UNAVAILABLE' && statuses.skills !== 'UNSUPPORTED';
    if (hostPresent && (!catalog.canonical_library_valid || !catalog.global_base_valid || catalog.agent_rules_effective_chars > catalog.host_budget)) statuses.skills = 'BROKEN';
    if (hostPresent && catalog.task_projection_status === 'UNSUPPORTED' && catalog.task_selected_ids.length > 0) statuses.skills = 'UNSUPPORTED';
    if (hostPresent && catalog.task_projection_status === 'ACTIVE' && !catalog.task_projection_valid) statuses.skills = 'BROKEN';
    const hostReceipts = (Object.keys(statuses) as HealthComponent[]).map((component) => createHealthReceipt({
      receipt_id: randomUUID(), host: name, host_version: native?.git_head ?? 'unobserved', component, status: statuses[component],
      candidate_hash: candidateHash, config_hash: sha256(JSON.stringify(native?.native_readback ?? {})), source_hash: sourceHash,
      probe_contract: HEALTH_PROBE_REGISTRY[component], observed_at: observed.observed_at, environment: `${process.platform}/${process.version}`,
      evidence: [native ? `host-certification:${native.status}` : 'host-certification:missing'], ...(observed.errors?.[name] ? { error: observed.errors[name] } : {}),
    }));
    receipts.push(...hostReceipts);
    const reduced = reduceHealth(hostReceipts, requiredHealthComponentsForHost(name as HostId));
    const reason = reduced.blocking.length ? reduced.blocking.map((item) => `${item.component}=${item.status}`).join(', ') : 'All required static host surfaces passed fresh readback.';
    reports.push({ host: name, status: reduced.status, authorityTier: readback?.authority_tier ?? native?.authority_tier ?? 'UNAVAILABLE', reason, action: actionFor(reduced.status, name), components: statuses, diagnostics: diagnosticsFor(name, statuses, native), catalog });
  }
  return { status: overall(reports.map((report) => report.status)), host, receipts, missing: reports.flatMap((report) => Object.entries(report.components).filter(([, status]) => status === 'UNKNOWN').map(([component]) => `${report.host}:${component}`)), blocking: reports.filter((report) => !['HEALTHY', 'NOT_APPLICABLE'].includes(report.status)).map((report) => `${report.host}:${report.status}`), hosts: reports };
}
