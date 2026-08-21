import fs from 'node:fs';
import path from 'node:path';
import {
  NORTH_STAR_PROTOCOL_VERSION,
  assertRunState,
  classifyRisk,
  compileTaskPackets,
  compileWorkSpec,
  compilePlannerContract,
  runStrongPlanner,
  createWorkRequest,
  executeNorthStarRun,
  loadDomainPack,
  normalizeTrigger,
  TriggerQueue,
  readDomainReference,
  consumeDomainReference,
  searchDomainReferences,
  resolveHarnessRoot,
  type EvidenceKind,
  type HostResourceSnapshot,
  type VerifierDefinition,
  type WorkRequest,
  classifyIntake,
  weakWorkerMayExecute,
  requiresPlannerButNone,
  planProofRoute,
} from '@initforge/agent-rules-engine/northstar/index';
import type { AgentKind } from '@initforge/agent-rules-engine/runner/headless-executor';

export const NORTHSTAR_AGENTS: AgentKind[] = ['claude', 'codex', 'opencode'];
export const NORTHSTAR_EVIDENCE_KINDS: EvidenceKind[] = ['static', 'test', 'integration', 'api', 'browser', 'visual', 'mobile', 'security', 'scope', 'semantic', 'other'];

export interface NorthStarCliConfig {
  protocol_version: string;
  default_agent: AgentKind;
  default_planner: AgentKind;
  explicit_capability_providers: string[];
  domain_pack: string | null;
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function normalizeConfig(raw: Partial<NorthStarCliConfig>): NorthStarCliConfig {
  if (raw.protocol_version !== NORTH_STAR_PROTOCOL_VERSION) throw new Error(`unsupported .agent/northstar.json protocol ${raw.protocol_version}`);
  if (!raw.default_agent || !NORTHSTAR_AGENTS.includes(raw.default_agent)) throw new Error(`unsupported configured agent ${raw.default_agent}`);
  const planner = raw.default_planner ?? 'claude';
  if (!NORTHSTAR_AGENTS.includes(planner)) throw new Error(`unsupported configured planner ${planner}`);
  const providers = raw.explicit_capability_providers ?? [];
  if (!Array.isArray(providers) || providers.some((provider) => typeof provider !== 'string' || provider.trim().length === 0)) {
    throw new Error('explicit_capability_providers must be a string[]');
  }
  if (raw.domain_pack !== undefined && raw.domain_pack !== null && typeof raw.domain_pack !== 'string') throw new Error('domain_pack must be string|null');
  return {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    default_agent: raw.default_agent,
    default_planner: planner,
    explicit_capability_providers: [...providers],
    domain_pack: raw.domain_pack ?? null,
  };
}

export function initNorthStar(repoRoot: string, agent: AgentKind = 'claude', domainPack: string | null = null, planner: AgentKind = 'claude'): { created: boolean; path: string; config: NorthStarCliConfig; provisioning: { status: 'PENDING'; install_command: string; note: string } } {
  if (!NORTHSTAR_AGENTS.includes(agent)) throw new Error(`unsupported agent: ${agent}`);
  if (!NORTHSTAR_AGENTS.includes(planner)) throw new Error(`unsupported planner: ${planner}`);
  const file = path.join(repoRoot, '.agent', 'northstar.json');
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<NorthStarCliConfig>;
    const config = normalizeConfig(raw);
    // Persist defaulted fields so all hosts observe the same canonical config.
    if (JSON.stringify(raw) !== JSON.stringify(config)) atomicJson(file, config);
    return { created: false, path: file, config, provisioning: PROVISIONING_PENDING };
  }
  const config: NorthStarCliConfig = {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    default_agent: agent,
    default_planner: planner,
    explicit_capability_providers: [],
    domain_pack: domainPack,
  };
  atomicJson(file, config);
  return { created: true, path: file, config, provisioning: PROVISIONING_PENDING };
}

// init creates project config only; it never claims MCPs are ready. Canonical
// MCP provisioning is owned by the install/sync/reconcile lifecycles.
const PROVISIONING_PENDING = {
  status: 'PENDING',
  install_command: 'agent-rules install',
  note: 'init creates project config only; canonical MCP provisioning is performed by the install/sync/reconcile lifecycle',
} as const;

function readConfig(repoRoot: string): NorthStarCliConfig {
  const file = path.join(repoRoot, '.agent', 'northstar.json');
  if (!fs.existsSync(file)) return initNorthStar(repoRoot).config;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<NorthStarCliConfig>;
  const config = normalizeConfig(raw);
  if (JSON.stringify(raw) !== JSON.stringify(config)) atomicJson(file, config);
  return config;
}


export function northStarIngest(repoRoot: string, rawTrigger: unknown): { request: ReturnType<typeof normalizeTrigger>; path: string; created: boolean } {
  const queued = new TriggerQueue(repoRoot).enqueue(rawTrigger);
  return { request: queued.record.request, path: queued.path, created: queued.created };
}

export function northStarStatus(repoRoot: string): unknown {
  const runsRoot = path.join(repoRoot, '.agent', 'runs');
  if (!fs.existsSync(runsRoot)) return { status: 'idle', runs: 0 };
  const runs = fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = path.join(runsRoot, entry.name, 'run-state.json');
      if (!fs.existsSync(file)) return null;
      const state = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      assertRunState(state);
      return { name: entry.name, state, mtime: fs.statSync(file).mtimeMs };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.mtime - a.mtime);
  return { status: runs[0]?.state.status ?? 'idle', runs: runs.length, latest: runs[0]?.state ?? null };
}

export async function northStarRun(input: {
  repoRoot: string;
  intent: string;
  /** Existing normalized trigger request. When supplied, its work_id/source are preserved. */
  request?: WorkRequest;
  agent?: AgentKind;
  planner?: AgentKind;
  owned: string[];
  forbidden?: string[];
  verifier?: { executable: string; args: string[]; kind?: EvidenceKind };
  capabilities?: string[];
  capabilityProviders?: string[];
  domainPack?: string | null;
  plannerContract?: unknown;
  /** Host observation captured by an outer supervisor; live observation is the default. */
  resourceSnapshot?: HostResourceSnapshot;
  /** Test/host escape hatch: the planner still executes in a disposable snapshot. */
  plannerInvocationOverride?: (prompt: string, snapshotRoot: string) => { executable: string; args: string[]; env?: Record<string, string> };
  /** Test/host escape hatch for the bounded implementation worker. */
  workerInvocationOverride?: (prompt: string) => { executable: string; args: string[] };
  /** Generation captured by the durable trigger claim. */
  executionGeneration?: number;
  skipAgentDetection?: boolean;
}): Promise<unknown> {
  const config = readConfig(input.repoRoot);
  if (input.request && input.request.raw_intent !== input.intent) throw new Error('existing WorkRequest raw_intent does not match run intent');
  const risk = input.request?.risk_hint ?? classifyRisk(input.intent);
  const request = input.request ?? createWorkRequest({ raw_intent: input.intent, source: 'cli', risk_hint: risk });
  if (input.plannerContract !== undefined) {
    if (input.verifier || input.owned.length > 0 || (input.forbidden?.length ?? 0) > 0) throw new Error('--contract cannot be mixed with direct --own/--forbid/--verify-* inputs');
    const planned = compilePlannerContract(request, input.plannerContract);
    return executeNorthStarRun({
      repoRoot: input.repoRoot,
      request,
      spec: planned.compiled.spec,
      manifest: planned.compiled.manifest,
      packets: planned.packets,
      verifiers: planned.verifiers,
      claimPolicies: planned.claimPolicies,
      agent: input.agent ?? config.default_agent,
      explicitCapabilityProviders: [...config.explicit_capability_providers, ...(input.capabilityProviders ?? [])],
      ...(input.workerInvocationOverride ? { invocationOverride: input.workerInvocationOverride } : {}),
      ...(input.skipAgentDetection ? { skipAgentDetection: true } : {}),
      ...(input.executionGeneration !== undefined ? { executionGeneration: input.executionGeneration } : {}),
      ...(input.resourceSnapshot ? { resourceSnapshot: input.resourceSnapshot } : {}),
      ...((input.domainPack ?? config.domain_pack) ? { domainPack: { id: (input.domainPack ?? config.domain_pack)!, stage: 'implementation' as const } } : {}),
    });
  }
  const needsStrongPlanner = risk === 'S2' || risk === 'S3' || !input.verifier || input.owned.length === 0;
  if (needsStrongPlanner) {
    // REQ-013: only SEMANTICALLY_AMBIGUOUS work may invoke a strong planner.
    // EXPLICIT/DISCOVERABLE work compiles deterministically; without a planner
    // the ambiguous task stops NEEDS_USER/PLANNER_REQUIRED, never invented.
    const intakeDecision = classifyIntake({
      raw_intent: input.intent,
      risk_class: risk as 'S0' | 'S1' | 'S2' | 'S3',
      explicit_scope: (input.owned?.length ?? 0) > 0,
      explicit_acceptance: input.verifier !== undefined,
      repo_facts_available: true,
      has_verifiable_surface: input.verifier !== undefined,
      planner_configured: Boolean(input.planner ?? config.default_planner),
    });
    if (requiresPlannerButNone(intakeDecision)) {
      return {
        outcome: 'BLOCKED',
        reason: `plannerless intake: ${intakeDecision.determinacy} requires a strong planner but none is configured; NEEDS_USER/PLANNER_REQUIRED (${intakeDecision.gap})`,
        work_id: request.work_id,
        intake_decision: intakeDecision,
      };
    }
    const planner = input.planner ?? config.default_planner;
    const domainPackId = input.domainPack ?? config.domain_pack;
    try {
      const planned = await runStrongPlanner({
        repoRoot: input.repoRoot, request, planner, domainPackId,
        ...(input.plannerInvocationOverride ? { invocationOverride: input.plannerInvocationOverride } : {}),
      });
      const packets = input.capabilities?.length
        ? planned.compiled.packets.map((packet) => ({ ...packet, capabilities: [...new Set([...(packet.capabilities ?? []), ...input.capabilities!])] }))
        : planned.compiled.packets;
      return executeNorthStarRun({
        repoRoot: input.repoRoot, request, spec: planned.compiled.compiled.spec, manifest: planned.compiled.compiled.manifest,
        packets, verifiers: planned.compiled.verifiers, claimPolicies: planned.compiled.claimPolicies,
        agent: input.agent ?? config.default_agent,
        proofRouter: planProofRoute,
        explicitCapabilityProviders: [...config.explicit_capability_providers, ...(input.capabilityProviders ?? [])],
        ...(input.workerInvocationOverride ? { invocationOverride: input.workerInvocationOverride } : {}),
        ...(input.skipAgentDetection ? { skipAgentDetection: true } : {}),
        ...(input.executionGeneration !== undefined ? { executionGeneration: input.executionGeneration } : {}),
        ...(input.resourceSnapshot ? { resourceSnapshot: input.resourceSnapshot } : {}),
        ...(domainPackId ? { domainPack: { id: domainPackId, stage: 'implementation' as const } } : {}),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { outcome: 'BLOCKED', reason, work_id: request.work_id };
    }
  }
  const directVerifier = input.verifier;
  if (!directVerifier) throw new Error('internal invariant: direct execution requires an exact verifier');
  const compiled = compileWorkSpec(request, {
    requirements: [{
      statement: input.intent,
      claims: [{ statement: `Configured verifier accepts: ${input.intent}`, class: 'mechanical', required_kinds: [directVerifier.kind ?? 'test'], verifier_id: 'V-001' }],
    }],
    risk_class: risk,
  });
  const packets = compileTaskPackets(compiled, [{
    goal: input.intent,
    requirement_ids: ['R-001'],
    claim_ids: ['C-001a'],
    owned: input.owned,
    forbidden: input.forbidden ?? [],
    verifier_by_claim: { 'C-001a': 'V-001' },
    ...(input.capabilities?.length ? { capabilities: input.capabilities } : {}),
  }]);
  const verifier: VerifierDefinition = { id: 'V-001', kind: directVerifier.kind ?? 'test', argv: { executable: directVerifier.executable, args: directVerifier.args } };
  return executeNorthStarRun({
    repoRoot: input.repoRoot,
    request,
    spec: compiled.spec,
    manifest: compiled.manifest,
    packets,
    verifiers: [verifier],
    agent: input.agent ?? config.default_agent,
    proofRouter: planProofRoute,
    explicitCapabilityProviders: [...config.explicit_capability_providers, ...(input.capabilityProviders ?? [])],
    ...(input.workerInvocationOverride ? { invocationOverride: input.workerInvocationOverride } : {}),
    ...(input.skipAgentDetection ? { skipAgentDetection: true } : {}),
    ...(input.executionGeneration !== undefined ? { executionGeneration: input.executionGeneration } : {}),
    ...(input.resourceSnapshot ? { resourceSnapshot: input.resourceSnapshot } : {}),
    ...((input.domainPack ?? config.domain_pack) ? { domainPack: { id: (input.domainPack ?? config.domain_pack)!, stage: 'implementation' as const } } : {}),
  });
}
function relativeIfInside(repoRoot: string, target: string | undefined): string | undefined {
  if (!target) return undefined;
  const relative = path.relative(path.resolve(repoRoot), path.resolve(target));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return target;
  return relative.split(path.sep).join('/');
}

interface ReconciledRun {
  run_id: string;
  status: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED';
  proof_of_work_file: string;
  result_file?: string;
  reason?: string;
}

function findCompletedRunForWorkId(repoRoot: string, workId: string): ReconciledRun | null {
  const runsRoot = path.join(path.resolve(repoRoot), '.agent', 'runs');
  if (!fs.existsSync(runsRoot)) return null;
  const candidates: Array<ReconciledRun & { mtime: number }> = [];
  for (const entry of fs.readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runRoot = path.join(runsRoot, entry.name);
    const proofFile = path.join(runRoot, 'proof-of-work.json');
    if (!fs.existsSync(proofFile)) continue;
    try {
      const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8')) as { protocol_version?: string; run_id?: string; work_id?: string; outcome?: string; residual_risk?: unknown };
      if (proof.protocol_version !== NORTH_STAR_PROTOCOL_VERSION || proof.work_id !== workId || proof.run_id !== entry.name) continue;
      if (!['PASS', 'PARTIAL', 'BLOCKED', 'FAILED'].includes(String(proof.outcome))) continue;
      const workRequestFile = path.join(runRoot, 'work-request.json');
      if (!fs.existsSync(workRequestFile)) continue;
      const savedRequest = JSON.parse(fs.readFileSync(workRequestFile, 'utf8')) as WorkRequest;
      if (savedRequest.work_id !== workId || savedRequest.protocol_version !== NORTH_STAR_PROTOCOL_VERSION) continue;
      const resultFile = path.join(runRoot, 'result.md');
      const residualRisk = Array.isArray(proof.residual_risk) ? proof.residual_risk.filter((item): item is string => typeof item === 'string') : [];
      candidates.push({
        run_id: proof.run_id,
        status: proof.outcome as ReconciledRun['status'],
        proof_of_work_file: proofFile,
        ...(fs.existsSync(resultFile) ? { result_file: resultFile } : {}),
        ...(residualRisk.length ? { reason: residualRisk.join('; ') } : {}),
        mtime: fs.statSync(proofFile).mtimeMs,
      });
    } catch {
      // A malformed/incomplete run artifact is not terminal proof and must not
      // suppress a retry of the durable request.
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  if (!candidates.length) return null;
  const { mtime: _mtime, ...result } = candidates[0];
  return result;
}

export async function northStarDrain(repoRoot: string, options: {
  max?: number;
  agent?: AgentKind;
  planner?: AgentKind;
  domainPack?: string | null;
  capabilityProviders?: string[];
  plannerInvocationOverride?: (prompt: string, snapshotRoot: string) => { executable: string; args: string[]; env?: Record<string, string> };
  workerInvocationOverride?: (prompt: string) => { executable: string; args: string[] };
  resourceSnapshot?: HostResourceSnapshot;
  skipAgentDetection?: boolean;
  executionGeneration?: number;
} = {}): Promise<{ processed: number; remaining: number; results: Array<{ work_id: string; status: string; run_id?: string; reason?: string }> }> {
  const max = options.max ?? 1;
  if (!Number.isInteger(max) || max < 1 || max > 1000) throw new Error('drain max must be an integer from 1 to 1000');
  const queue = new TriggerQueue(repoRoot);
  const results: Array<{ work_id: string; status: string; run_id?: string; reason?: string }> = [];
  for (let index = 0; index < max; index += 1) {
    const claim = queue.claimNext();
    if (!claim) break;
    const request = claim.record.request;
    try {
      // Crash-safe idempotency: executeNorthStarRun writes terminal proof before
      // the queue record is completed. If a previous drainer died in that tiny
      // window, reconcile the proof instead of running the worker a second time.
      const reconciled = findCompletedRunForWorkId(repoRoot, request.work_id);
      if (reconciled) {
        queue.complete(claim, {
          status: reconciled.status,
          run_id: reconciled.run_id,
          proof_of_work: relativeIfInside(repoRoot, reconciled.proof_of_work_file),
          result: relativeIfInside(repoRoot, reconciled.result_file),
          ...(reconciled.reason ? { reason: reconciled.reason } : {}),
        });
        results.push({ work_id: request.work_id, status: reconciled.status, run_id: reconciled.run_id, ...(reconciled.reason ? { reason: reconciled.reason } : {}) });
        continue;
      }
      const run = await northStarRun({
        repoRoot,
        intent: request.raw_intent,
        request,
        agent: options.agent,
        planner: options.planner,
        owned: [],
        capabilityProviders: options.capabilityProviders ?? [],
        domainPack: options.domainPack,
        plannerInvocationOverride: options.plannerInvocationOverride,
        workerInvocationOverride: options.workerInvocationOverride,
        skipAgentDetection: options.skipAgentDetection,
        executionGeneration: claim.record.execution_generation,
        resourceSnapshot: options.resourceSnapshot,
      });
      if (typeof run === 'object' && run !== null && 'trusted_outcome' in run) {
        const result = run as { trusted_outcome: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED'; run_id: string; proof_of_work_file?: string; result_file?: string; acceptance?: { reasons?: string[] }; audit?: { findings?: string[] } };
        const reason = [...(result.acceptance?.reasons ?? []), ...(result.audit?.findings ?? [])].join('; ') || undefined;
        queue.complete(claim, {
          status: result.trusted_outcome,
          run_id: result.run_id,
          proof_of_work: relativeIfInside(repoRoot, result.proof_of_work_file),
          result: relativeIfInside(repoRoot, result.result_file),
          ...(reason ? { reason } : {}),
        });
        results.push({ work_id: request.work_id, status: result.trusted_outcome, run_id: result.run_id, ...(reason ? { reason } : {}) });
      } else {
        const blocked = run as { outcome?: string; reason?: string };
        queue.complete(claim, { status: 'BLOCKED', ...(blocked.reason ? { reason: blocked.reason } : {}) });
        results.push({ work_id: request.work_id, status: 'BLOCKED', ...(blocked.reason ? { reason: blocked.reason } : {}) });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      queue.complete(claim, { status: 'FAILED', reason });
      results.push({ work_id: request.work_id, status: 'FAILED', reason });
    }
  }
  return { processed: results.length, remaining: queue.list().filter((item) => item.record.status === 'READY').length, results };
}

export function northStarReference(repoRoot: string, packId: string, relativePath: string, options: { component?: string; behavior?: string; anchor?: string; record?: boolean; workId?: string } = {}): ReturnType<typeof readDomainReference> {
  const harnessRoot = resolveHarnessRoot(repoRoot);
  const pack = loadDomainPack(harnessRoot, packId);
  const consumed = consumeDomainReference(pack, relativePath, { component: options.component, behavior: options.behavior, anchor: options.anchor });
  if (options.record) {
    // REQ-013: append the consumption receipt (append-only) so the result
    // renderer can add the short disclosure footer for THIS work only.
    const record = options.workId ? { ...consumed.receipt, work_id: options.workId } : consumed.receipt;
    const receiptsFile = path.join(repoRoot, '.agent', 'domain-reference-receipts.jsonl');
    fs.mkdirSync(path.dirname(receiptsFile), { recursive: true });
    fs.appendFileSync(receiptsFile, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  }
  return consumed;
}


export function northStarReferenceSearch(repoRoot: string, packId: string, query: string, limit = 20): ReturnType<typeof searchDomainReferences> {
  const harnessRoot = resolveHarnessRoot(repoRoot);
  const pack = loadDomainPack(harnessRoot, packId);
  return searchDomainReferences(pack, query, limit);
}
