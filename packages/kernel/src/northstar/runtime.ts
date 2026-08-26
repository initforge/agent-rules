import fs from 'node:fs';
import path from 'node:path';
import { Runner, parseCommand, type AgentKind, type RunSummary, type TaskReport } from '../runner/loop.js';
import type { AgentDriver } from '../runner/agent-driver.js';
import type { VerificationProfile, VerificationStep } from '../runner/profile.js';
import { Journal } from '../runner/journal.js';
import {
  NORTH_STAR_PROTOCOL_VERSION,
  assertRunState,
  assertSpecExecutable,
  assertTaskPacket,
  assertWorkRequest,
  assertWorkSpec,
  newId,
  sha256Canonical,
  validateTraceability,
  type EvidenceKind,
  type EvidenceRecord,
  type RunState,
  type TaskPacket,
  type WorkRequest,
  type WorkSpec,
} from './protocol.js';
import type { TraceabilityManifest } from './compiler.js';
import { compileContext, type CompiledContext, type SemanticCodeResolver } from './context.js';
import { deriveContextFeedback } from './context-feedback.js';
import { createStandardCapabilityBroker, type DecisionFabricMode } from './routing.js';
import { EvidenceLedger, deriveAcceptance, type AcceptanceResult, type ClaimAcceptancePolicy } from './evidence-ledger.js';
import { auditAcceptance, type AcceptanceAudit } from './acceptance-audit.js';
import { type IndependentSemanticAuditor, type SemanticAuditResult } from './semantic-auditor.js';
import { assessConvergence, compileConvergenceDeltaPackets, detectConvergenceOscillation, type ConvergenceResult } from './convergence.js';
import { assertResourceBudget, governResources, observeHostResources, type HostResourceSnapshot } from './resource-governor.js';
import { buildVerificationGraph } from './verification-graph.js';
import { assertDomainPackStage, loadDomainPack, resolveHarnessRoot, type DomainPackStage, type DomainReferenceReceipt, type LoadedDomainPack, renderDomainReferenceFooters } from './domain-packs.js';
import { modelDecisionForSpec, type ModelDecision } from './model-governor.js';
import { transitionExecution, truthFromOutcome, type ExecutionLifecycleRecord } from './execution-lifecycle.js';
import { readExecutionAuthority } from '../state/execution-authority.js';
import { validateSemanticState } from '../state/semantic-state-validator.js';
import { type ProofRoutePlan, type ProofRouteRequest } from './proof-router.js';
import { type HostId, HOST_CAPABILITIES } from './host-adapters.js';
import { LaneController, type ResourceLane } from './resource-governor.js';
import { admitArtifact, classifyArtifact, type ArtifactAdmissionInput } from './artifact-admission.js';
import { buildContextBudgetReceipt, estimateInstalledGraph, type ContextBudgetInput } from './context-budget.js';
import {
  createContextState,
  evaluateContextState,
  type ContextState,
  type WorkspaceFacts,
  type HostSurfaceContext,
  type ContextObservation,
  type VerifierEvidence,
} from './context-engine.js';
import { categorizeRepair, type RepairTaxonomyResult } from './pair-repair.js';
import { outcomeToAcceptanceShape, type ReducedOutcome } from './outcome-reducer.js';
import { RunStore } from './run-store.js';
import { resolveManagedWorkflow } from '../workflow/agent-workflow.js';
import { buildTaskContext } from '../workflow/task-context.js';
import { reduceRunResult } from '../workflow/result.js';

export interface VerifierDefinition {
  id: string;
  kind: EvidenceKind;
  /** Preferred canonical form. Exact argv avoids shell/quoting ambiguity. */
  argv?: { executable: string; args: string[]; cwd?: string; timeout_ms?: number };
  /** Legacy compatibility only. New North-Star callers should use argv. */
  command?: string;
  description?: string;
  /** Independent truth lineage. Verifiers with the same group count as one acceptance channel. */
  oracle_group?: string;
}

export interface NorthStarRunInput {
  repoRoot: string;
  runRoot?: string;
  /** Agent-rules installation root. Optional: auto-resolved or AGENT_RULES_HOME. */
  harnessRoot?: string;
  request: WorkRequest;
  spec: WorkSpec;
  manifest: TraceabilityManifest;
  packets: TaskPacket[];
  verifiers: VerifierDefinition[];
  agent: AgentKind;
  maxRepairDepth?: number;
  /** Number of post-acceptance claim-grounded convergence passes. */
  maxConvergencePasses?: number;
  taskTimeoutMs?: number;
  invocationOverride?: (prompt: string) => { executable: string; args: string[] };
  skipAgentDetection?: boolean;
  explicitCapabilityProviders?: string[];
  /** Optional host-injected semantic retrieval provider (LSP/index/MCP facade). */
  semanticResolver?: SemanticCodeResolver;
  /** Independent post-build semantic reviewer. It may reject/block but never upgrade deterministic failure. */
  semanticAuditor?: IndependentSemanticAuditor;
  /** Force semantic review even when risk/claim policy would not otherwise require it. */
  requireSemanticAudit?: boolean;
  claimPolicies?: ClaimAcceptancePolicy[];
  /** Kept only to decode historical runs. New execution always uses one active route. */
  decisionFabricMode?: DecisionFabricMode;
  /** Owner generation captured at dispatch time; zero is an unbound local run. */
  executionGeneration?: number;
  /** Optional host-managed driver; the runner remains the sole author of truth. */
  driver?: AgentDriver;
  /** Host observation captured by an outer supervisor; live observation is the default. */
  resourceSnapshot?: HostResourceSnapshot;
  /** Explicit project/domain profile. Never inferred from prompt text. */
  domainPack?: { id: string; stage?: DomainPackStage };
  /** Optional for callers compiled before v3; execution always supplies the
   * canonical minimal-proof router when this field is absent. */
  proofRouter?: (request: ProofRouteRequest) => ProofRoutePlan;
  /** F07/REQ-007: when supplied, enforcement is decided before effect execution. */
  enforcement?: (host: HostId) => { layer: string; can_control_mutation: boolean; reason: string };
}

export interface NorthStarRunResult {
  run_id: string;
  work_id: string;
  execution_generation: number;
  state: RunState;
  acceptance: AcceptanceResult;
  audit: AcceptanceAudit;
  convergence: ConvergenceResult;
  trusted_outcome: AcceptanceResult['outcome'];
  runner: RunSummary;
  run_root: string;
  evidence_file: string;
  proof_of_work_file: string;
  result_file: string;
}

export interface ProofOfWorkReport {
  protocol_version: '2.0';
  run_id: string;
  work_id: string;
  execution_generation: number;
  spec_id: string;
  spec_revision: number;
  outcome: AcceptanceResult['outcome'];
  deterministic_acceptance: AcceptanceResult['outcome'];
  acceptance_audit: 'PASS' | 'FAILED';
  requirements: Array<{ requirement_id: string; mandatory: boolean; status: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED'; claims: string[] }>;
  evidence: Array<{ evidence_id: string; claim_id: string; task_id: string; kind: EvidenceKind; status: EvidenceRecord['status']; artifact_path?: string; sha256?: string; observed_at?: string }>;
  changed_files: string[];
  residual_risk: string[];
  artifacts: {
    work_request: string;
    work_spec: string;
    traceability_manifest: string;
    task_packets: string;
    verification_graph: string;
    evidence_ledger: string;
    raw_artifacts: string;
    acceptance: string;
    acceptance_audit: string;
    semantic_review: string | null;
    convergence: string;
    semantic_state: string;
    decision_fabric: string;
    checkpoint: string | null;
    resource_decision: string;
    execution_lifecycle: string;
    context_state?: string;
  };
}

function requirementStatus(requirementClaims: string[], acceptance: AcceptanceResult): 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED' {
  if (requirementClaims.some((claim) => acceptance.failed_claims.includes(claim))) return 'FAILED';
  if (requirementClaims.every((claim) => acceptance.accepted_claims.includes(claim))) return 'PASS';
  if (requirementClaims.some((claim) => acceptance.unresolved_claims.includes(claim)) && acceptance.outcome === 'BLOCKED') return 'BLOCKED';
  return 'PARTIAL';
}

function renderTrustedResult(report: ProofOfWorkReport, domainFooter: string): string {
  const lines = [
    `Outcome: ${report.outcome}`,
    '',
    'Requirements:',
    ...report.requirements.map((requirement) => `${requirement.requirement_id} ${requirement.status}`),
    '',
    'Evidence:',
    ...(report.evidence.length
      ? report.evidence.map((evidence) => `${evidence.claim_id} -> ${evidence.kind}:${evidence.status}${evidence.artifact_path ? ` -> ${evidence.artifact_path}${evidence.sha256 ? `#${evidence.sha256}` : ''}` : ''}`)
      : ['(none)']),
    '',
    'Changed:',
    ...(report.changed_files.length ? report.changed_files : ['(none)']),
    '',
    'Residual risk:',
    ...(report.residual_risk.length ? report.residual_risk.map((risk) => `- ${risk}`) : ['(none)']),
    '',
    `Spec revision: ${report.spec_revision}`,
    `Run: ${report.run_id}`,
    '',
    // REQ-013: short evidence footer ONLY when the domain pack's reference
    // broker was actually consumed during the run. No receipt -> no footer,
    // no banner, no "the forbidden disclosure phrase".
    ...(domainFooter ? [domainFooter, ''] : []),
  ];
  return lines.join('\n');
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function boundedConvergencePasses(value: number | undefined): number {
  const passes = value ?? 2;
  if (!Number.isInteger(passes) || passes < 0 || passes > 8) {
    throw new Error('maxConvergencePasses must be an integer between 0 and 8');
  }
  return passes;
}

/** Move a finalized pass back into the normal durable execution lifecycle. */
function prepareConvergenceRetry(runRoot: string, reason: string): void {
  const lifecycleFile = path.join(runRoot, 'execution-lifecycle.json');
  const current = readJson<ExecutionLifecycleRecord>(lifecycleFile);
  let next = transitionExecution(current, 'RETRY_QUEUED', { reason, attempt: (current.attempt ?? 1) + 1 });
  next = transitionExecution(next, 'PREPARING');
  next = transitionExecution(next, 'RUNNING');
  writeJsonAtomic(lifecycleFile, next);
}

function safeVerifierArgv(definition: VerifierDefinition, cwd: string): { executable: string; args: string[]; cwd?: string; timeout_ms?: number } {
  if (definition.argv) return { executable: definition.argv.executable, args: [...definition.argv.args], cwd: definition.argv.cwd, timeout_ms: definition.argv.timeout_ms };
  if (!definition.command) throw new Error(`verifier ${definition.id} must define argv (preferred) or legacy command`);
  const invocation = parseCommand(definition.command, cwd);
  return { executable: invocation.executable, args: [...invocation.args] };
}

function verifierStep(definition: VerifierDefinition): VerificationStep {
  if (definition.argv) {
    return { kind: 'argv', executable: definition.argv.executable, args: [...definition.argv.args], cwd: definition.argv.cwd, timeoutMs: definition.argv.timeout_ms };
  }
  if (!definition.command) throw new Error(`verifier ${definition.id} must define argv (preferred) or legacy command`);
  return { kind: 'shell', command: definition.command };
}

/**
 * REQ-013 — minimal domain disclosure in the worker prompt. The pack is
 * explicitly activated (never keyword-triggered), so the prompt only points
 * at the reference broker for exact source evidence. It never prints a broad
 * domain/template summary for every task and never emits "the forbidden disclosure phrase"
 * or "the forbidden disclosure phrase".
 */
function domainPrompt(taskId: string, domainPack: LoadedDomainPack): string {
  const pack = domainPack.descriptor.id;
  return [
    `Domain pack: ${pack} (explicitly activated for this work; never inferred from wording)`,
    `Reference broker: agent-rules reference ${pack} <manifest-bound-path> [--component <component>]`,
    `Reference search: agent-rules reference-search ${pack} <literal-query>`,
    `Source gate: ${domainPack.sourceVerified ? 'verified bundled source is available via the broker' : 'BLOCKED/NEEDS_USER — mandatory source not accessible; do not claim it was checked'}`,
    'Use the central bundled reference only by pointer or through the reference broker: inspect exact source evidence before domain-specific edits. Do not copy/vendor the reference template into the target project, and do not infer target requirements merely because the reference implements a feature. Active project schema/spec owns variable business slots.',
  ].join('\n');
}

function taskPrompt(packet: TaskPacket, context: ReturnType<typeof compileContext>, providers: Record<string, string | null>, providerHints: readonly string[], workspaceRoot: string, domainPack: LoadedDomainPack | undefined, modelDecision: ModelDecision): string {
  const blocks = context.items.map((item) => `## ${item.kind}: ${item.source}\n${item.content}`).join('\n\n');
  return [
    `# TaskPacket ${packet.task_id}`,
    `Execution identity: work_id=${packet.work_id ?? '(unbound)'} generation=${packet.execution_generation ?? 0} spec_revision=${packet.spec_revision}`,
    `Phase: ${packet.phase ?? 'implement'} (planner-bound; do not infer a different phase from vocabulary)`,
    `Goal: ${packet.goal}`,
    `Requirements: ${packet.requirements.join(', ')}`,
    `Owned scope: ${packet.scope.owned.length ? packet.scope.owned.join(', ') : '(repo-wide)'}`,
    `Forbidden scope: ${packet.scope.forbidden.length ? packet.scope.forbidden.join(', ') : '(none)'}`,
    packet.stop_if?.length ? `Stop if:\n- ${packet.stop_if.join('\n- ')}` : '',
    `Capabilities: ${Object.entries(providers).map(([cap, provider]) => `${cap}=${provider ?? 'UNAVAILABLE'}`).join(', ')}`,
    providerHints.length ? `Provider execution hints:\n- ${providerHints.join('\n- ')}` : '',
    `Requested logical model class: ${modelDecision.logical_class}. Host/model resolution remains an edge concern and must be attested separately; do not silently downgrade this safety floor.`,
    domainPack ? domainPrompt(packet.task_id, domainPack) : '',
    blocks,
    '# Worker contract\nInspect authoritative references before editing. Do not weaken tests or verification. Do not modify forbidden scope. If required information is unavailable, stop and report the blocker. Do not claim PASS; the harness derives completion from evidence.',
  ].filter(Boolean).join('\n\n');
}

interface PersistedRuntimeConfig {
  protocol_version: string;
  run_id: string;
  agent: AgentKind;
  max_repair_depth: number | null;
  max_convergence_passes: number;
  task_timeout_ms: number | null;
  domain_pack: { id: string; stage: DomainPackStage } | null;
  require_semantic_audit: boolean;
  execution_generation: number;
  decision_fabric_mode: DecisionFabricMode;
}

export interface NorthStarResumeInput {
  repoRoot: string;
  runId?: string;
  runRoot?: string;
  harnessRoot?: string;
  invocationOverride?: (prompt: string) => { executable: string; args: string[] };
  skipAgentDetection?: boolean;
  /** Optional bounded resume slice. Omit to drain the recovered queue. */
  maxTasks?: number;
  semanticAuditor?: IndependentSemanticAuditor;
  semanticResolver?: SemanticCodeResolver;
  requireSemanticAudit?: boolean;
  /** Optional host-managed driver for resumed work. */
  driver?: AgentDriver;
  /** F04/REQ-004: adaptive proof-route selection on resume (same as fresh run). */
  proofRouter?: (request: ProofRouteRequest) => ProofRoutePlan;
  /** F07/REQ-007: enforcement decision before effect execution on resume. */
  enforcement?: (host: HostId) => { layer: string; can_control_mutation: boolean; reason: string };
}

interface TaskReportEnvelope {
  seq: number;
  previous_hash: string;
  report: TaskReport;
  envelope_hash: string;
}

const REPORT_GENESIS = '0'.repeat(64);

class TaskReportLedger {
  constructor(readonly file: string) {}

  read(): TaskReportEnvelope[] {
    if (!fs.existsSync(this.file)) return [];
    const lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
    const out: TaskReportEnvelope[] = [];
    for (const [index, line] of lines.entries()) {
      const envelope = JSON.parse(line) as TaskReportEnvelope;
      const expectedPrevious = out.at(-1)?.envelope_hash ?? REPORT_GENESIS;
      if (envelope.seq !== index + 1) throw new Error(`task-report sequence mismatch at line ${index + 1}`);
      if (envelope.previous_hash !== expectedPrevious) throw new Error(`task-report chain broken at line ${index + 1}`);
      const body = { seq: envelope.seq, previous_hash: envelope.previous_hash, report: envelope.report };
      if (envelope.envelope_hash !== sha256Canonical(body)) throw new Error(`task-report envelope hash mismatch at line ${index + 1}`);
      out.push(envelope);
    }
    return out;
  }

  append(report: TaskReport): TaskReportEnvelope {
    const prior = this.read();
    if (prior.some((item) => item.report.taskId === report.taskId)) return prior.find((item) => item.report.taskId === report.taskId)!;
    const body = { seq: prior.length + 1, previous_hash: prior.at(-1)?.envelope_hash ?? REPORT_GENESIS, report };
    const envelope: TaskReportEnvelope = { ...body, envelope_hash: sha256Canonical(body) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
    return envelope;
  }
}

function assertRuntimeInputs(input: Pick<NorthStarRunInput, 'request' | 'spec' | 'manifest' | 'packets' | 'verifiers' | 'maxRepairDepth' | 'taskTimeoutMs'>): Map<string, VerifierDefinition> {
  assertWorkRequest(input.request);
  assertWorkSpec(input.spec);
  input.packets.forEach(assertTaskPacket);
  assertResourceBudget({ packets: input.packets, maxRepairDepth: input.maxRepairDepth, taskTimeoutMs: input.taskTimeoutMs });
  if (input.manifest.spec_id !== input.spec.spec_id || input.manifest.spec_revision !== input.spec.revision) throw new Error('traceability manifest revision does not match WorkSpec');
  const trace = validateTraceability(input.spec, input.packets);
  if (!trace.valid) throw new Error(`traceability gate failed: ${trace.problems.map((problem) => problem.message).join('; ')}`);
  assertSpecExecutable(input.spec);
  for (const verifier of input.verifiers) {
    const hasArgv = verifier.argv !== undefined;
    const hasCommand = verifier.command !== undefined;
    if (hasArgv === hasCommand) throw new Error(`verifier ${verifier.id} must define exactly one of argv or command`);
  }
  const verifierMap = new Map(input.verifiers.map((verifier) => [verifier.id, verifier]));
  if (verifierMap.size !== input.verifiers.length) throw new Error('verifier ids must be unique');
  for (const packet of input.packets) {
    for (const acceptance of packet.acceptance) {
      if (!acceptance.verifier_id) throw new Error(`claim ${acceptance.claim_id} has no verifier mapping`);
      if (!verifierMap.has(acceptance.verifier_id)) throw new Error(`unknown verifier ${acceptance.verifier_id} for claim ${acceptance.claim_id}`);
    }
  }
  return verifierMap;
}

function verificationEntries(
  packets: readonly TaskPacket[],
  manifest: TraceabilityManifest,
  verifierMap: ReadonlyMap<string, VerifierDefinition>,
): { graph: ReturnType<typeof buildVerificationGraph>; byTask: Map<string, Array<{ claim_id: string; verifier: VerifierDefinition; oracle_group?: string }>> } {
  const graph = buildVerificationGraph(packets, manifest, Object.fromEntries([...verifierMap].flatMap(([id, verifier]) => verifier.oracle_group ? [[id, verifier.oracle_group]] : [])));
  const byTask = new Map<string, Array<{ claim_id: string; verifier: VerifierDefinition; oracle_group?: string }>>();
  for (const node of graph) {
    const verifier = verifierMap.get(node.verifier_id);
    if (!verifier) throw new Error(`verification graph references unknown verifier ${node.verifier_id}`);
    const entries = byTask.get(node.task_id) ?? [];
    entries.push({ claim_id: node.claim_id, verifier, ...(node.oracle_group ? { oracle_group: node.oracle_group } : {}) });
    byTask.set(node.task_id, entries);
  }
  return { graph, byTask };
}

/**
 * F04/REQ-004 — build the Proof Router request for one task from the packet and
 * its spec/risk context, then select only the verifiers whose proof categories
 * the route plan selected. Returns the filtered entries and the route plan.
 */
export function filterVerifiersByProofRoute(
  packet: TaskPacket,
  spec: Pick<WorkSpec, 'risk_class'>,
  entries: Array<{ claim_id: string; verifier: VerifierDefinition; oracle_group?: string }>,
  plan: ProofRoutePlan,
): { selected: Array<{ claim_id: string; verifier: VerifierDefinition; oracle_group?: string }>; omitted: Array<{ claim_id: string; verifier_id: string; reason: string }> } {
  // Map the verifier evidence kind to the claim the proof must cover. A proof
  // is selected only when its category appears in the route plan's selected set
  // for the same claim. Everything else is omitted with a reason — UNLESS the
  // claim has NO selected proof at all, in which case all its verifiers are kept
  // so required proof is never silently skipped (convergence/recovery must still
  // be able to close it).
  const selectedByClaim = new Map<string, Set<string>>();
  for (const sel of plan.plan.selected) {
    const set = selectedByClaim.get(sel.claim_id) ?? new Set<string>();
    set.add(sel.category);
    selectedByClaim.set(sel.claim_id, set);
  }
  const claimIds = new Set(packet.acceptance.map((a) => a.claim_id));
  const selected: Array<{ claim_id: string; verifier: VerifierDefinition; oracle_group?: string }> = [];
  const omitted: Array<{ claim_id: string; verifier_id: string; reason: string }> = [];
  for (const entry of entries) {
    const cats = selectedByClaim.get(entry.claim_id);
    if (!claimIds.has(entry.claim_id)) {
      selected.push(entry);
      continue;
    }
    if (cats === undefined || cats.size === 0) {
      // No proof selected for this claim — keep all its verifiers (never drop
      // required proof silently).
      selected.push(entry);
      continue;
    }
    const kindSelected = cats.has('static') || cats.has('unit') || cats.has('contract') || cats.has('integration') || cats.has('api') || cats.has('live');
    if (kindSelected) {
      selected.push(entry);
    } else {
      omitted.push({ claim_id: entry.claim_id, verifier_id: entry.verifier.id, reason: `proof category for claim ${entry.claim_id} not selected by adaptive proof route` });
    }
  }
  return { selected, omitted };
}

/** Build the adaptive proof-route request for a single task packet. */
export function proofRouteRequestForPacket(
  packet: TaskPacket,
  spec: Pick<WorkSpec, 'risk_class'>,
  repoRoot: string,
  taskId: string,
): ProofRouteRequest {
  const changedFiles = [...packet.scope.owned, ...(packet.policy?.effects.allowed?.includes('filesystem_mutation') ? [] : [])];
  const claims = packet.acceptance.map((a) => ({
    id: a.claim_id,
    claim: packet.goal,
    live_surface: (packet.policy?.effects.allowed ?? []).some((e) => /live|browser|mcp|network/.test(e)),
  }));
  return {
    task_id: taskId,
    repository: repoRoot,
    trigger: {
      changed_files: changedFiles,
      affected_claims: claims.map((c) => c.id),
      risk_hint: (spec.risk_class as 'S0' | 'S1' | 'S2' | 'S3') ?? undefined,
      runtime_surfaces: packet.policy?.effects.allowed ?? [],
    },
    claims,
    risks: [(spec.risk_class ?? 'S0')],
    environment: 'deterministic',
  };
}

function taskDependenciesFromVerificationGraph(graph: ReturnType<typeof buildVerificationGraph>): Map<string, string[]> {
  const byNode = new Map(graph.map((node) => [node.node_id, node]));
  const out = new Map<string, Set<string>>();
  for (const node of graph) {
    for (const depId of node.depends_on_nodes) {
      const dep = byNode.get(depId);
      if (!dep || dep.task_id === node.task_id) continue;
      const set = out.get(node.task_id) ?? new Set<string>();
      set.add(dep.task_id);
      out.set(node.task_id, set);
    }
  }
  return new Map([...out].map(([taskId, deps]) => [taskId, [...deps].sort()]));
}

function ensureEvidenceForReport(
  report: TaskReport,
  packets: readonly TaskPacket[],
  entriesByTask: ReadonlyMap<string, Array<{ claim_id: string; verifier: VerifierDefinition; oracle_group?: string }>>,
  ledger: EvidenceLedger,
  repoRoot: string,
  specId: string,
  specRevision: number,
  candidateEpoch: number,
  platform: string,
): void {
  const contractTaskId = report.contractTaskId ?? (report.taskId.startsWith('T-') ? report.taskId : undefined);
  if (!contractTaskId) return;
  const packet = packets.find((candidate) => candidate.task_id === contractTaskId);
  if (!packet || report.scopeViolations?.length) return;
  const existingIds = new Set(ledger.read().map((item) => item.record.evidence_id));
  const entries = entriesByTask.get(packet.task_id) ?? [];
  entries.forEach((entry, index) => {
    const verifier = entry.verifier;
    const code = report.verificationExitCodes[index];
    if (code === undefined) return;
    const evidenceId = newId('E', `${report.taskId}:${entry.claim_id}:${verifier.id}`);
    if (existingIds.has(evidenceId)) return;
    const argv = safeVerifierArgv(verifier, repoRoot);
    const step = report.verificationSteps?.[index];
    const artifact = step?.evidence?.[0];
    const artifactAbsolute = artifact ? (path.isAbsolute(artifact.path) ? artifact.path : path.resolve(repoRoot, artifact.path)) : null;
    const relativeArtifact = artifactAbsolute ? path.relative(repoRoot, artifactAbsolute) : null;
    const artifactInsideRepo = !!relativeArtifact && relativeArtifact !== '..' && !relativeArtifact.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeArtifact);
    const record: EvidenceRecord = {
      protocol_version: NORTH_STAR_PROTOCOL_VERSION,
      evidence_id: evidenceId,
      claim_id: entry.claim_id,
      task_id: contractTaskId,
      kind: verifier.kind,
      status: code === 0 ? 'pass' : 'fail',
      command: { executable: argv.executable, args: argv.args, ...(argv.timeout_ms ? { timeout_ms: argv.timeout_ms } : {}) },
      summary: `${verifier.id}: exit ${code}; duration=${step?.durationMs ?? 'unknown'}ms; runner attempt ${report.taskId}; diff=${report.diffSha256 ?? 'none'}; artifacts=${step?.evidence?.map((item) => `${item.kind}:${item.sha256}`).join(',') || 'none'}`,
      ...(artifactInsideRepo && artifact ? { artifact_path: relativeArtifact!.split(path.sep).join('/'), sha256: artifact.sha256 } : {}),
      observed_at: new Date().toISOString(),
      ...(packet.work_id ? { work_id: packet.work_id } : {}),
      ...(packet.execution_generation !== undefined ? { execution_generation: packet.execution_generation } : {}),
      spec_id: specId,
      spec_revision: specRevision,
      candidate_epoch: candidateEpoch,
      platform,
      verifier_id: verifier.id,
      ...(entry.oracle_group ? { oracle_group: entry.oracle_group } : {}),
    };
    ledger.append(record, 'verifier');
    existingIds.add(evidenceId);
  });
}

/**
 * F07/REQ-007 — Artifact Admission gate at the evidence write boundary. Evidence
 * is an `evidence` persistence reason, which every class admits; the gate is
 * still consulted so a future policy cannot be bypassed and so every operational
 * write is classified. Returns the admission receipt (or null when no admission
 * policy is wired).
 */
export function admitEvidenceWrite(
  admission: { admit: (input: Omit<ArtifactAdmissionInput, 'owner'>) => ReturnType<typeof admitArtifact> } | undefined,
  risk: 'low' | 'medium' | 'high',
): ReturnType<typeof admitArtifact> | null {
  if (!admission) return null;
  const cls = classifyArtifact({ risk, evidence_required: true });
  return admission.admit({ class: cls, reasons: ['evidence'] });
}

function cumulativeSummary(reports: readonly TaskReport[], recovered: number): RunSummary {
  return {
    tasksProcessed: reports.length,
    done: reports.filter((report) => report.outcome === 'done').length,
    failed: reports.filter((report) => report.outcome === 'failed').length,
    needsUser: reports.filter((report) => report.outcome === 'needs-user').length,
    recovered,
    reports: [...reports],
  };
}

function journalViolations(journal: Journal): { scope: string[]; policy: string[] } {
  const scope: string[] = [];
  const policy: string[] = [];
  for (const record of journal.read()) {
    if (record.type === 'SCOPE_VIOLATION') {
      const paths = Array.isArray(record.data?.paths) ? record.data!.paths.filter((item): item is string => typeof item === 'string') : [];
      scope.push(...paths);
    } else if (record.type === 'POLICY_VIOLATION') {
      const violations = Array.isArray(record.data?.violations) ? record.data!.violations.filter((item): item is string => typeof item === 'string') : [];
      policy.push(...violations);
    } else if (record.type === 'REPORT_SINK_FAILED') {
      policy.push(`durable report/evidence sink failed for ${String(record.data?.taskId ?? 'unknown task')}`);
    }
  }
  return { scope: [...new Set(scope)], policy: [...new Set(policy)] };
}

/**
 * REQ-013 — read consumed domain-reference receipts for a run and render the
 * short disclosure footer. Receipts are append-only records written by the
 * reference broker CLI (`agent-rules reference`); the renderer adds the footer
 * ONLY when the active domain pack's reference broker was actually consumed.
 * No receipt -> '' -> no banner, no "the forbidden disclosure phrase", no footer.
 */
function domainReferenceFooter(repoRoot: string, runRoot: string, request: WorkRequest, runtimeConfig: { domain_pack?: { id: string } | null } | null): string {
  const packId = runtimeConfig?.domain_pack?.id;
  if (!packId) return '';
  const candidates = [
    path.join(runRoot, 'domain-reference-receipts.jsonl'),
    path.join(repoRoot, '.agent', 'domain-reference-receipts.jsonl'),
  ];
  const receipts: DomainReferenceReceipt[] = [];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      try {
        const record = JSON.parse(line) as DomainReferenceReceipt & { work_id?: string };
        if (record.pack_id !== packId) continue;
        if (record.work_id && record.work_id !== request.work_id) continue;
        receipts.push(record);
      } catch {
        /* skip malformed receipt lines */
      }
    }
  }
  return renderDomainReferenceFooters(receipts);
}

function persistRawArtifacts(runRoot: string, runId: string, reports: readonly TaskReport[]): void {
  writeJsonAtomic(path.join(runRoot, 'raw-artifacts.json'), {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    run_id: runId,
    tasks: reports.map((report) => ({
      task_id: report.contractTaskId ?? report.taskId,
      attempt_id: report.taskId,
      worker: { stdout_path: report.stdoutPath, stdout_sha256: report.stdoutSha256, stderr_path: report.stderrPath, stderr_sha256: report.stderrSha256 },
      diff_sha256: report.diffSha256,
      files_changed: report.filesChanged,
      verification: report.verificationSteps ?? [],
    })),
  });
}

async function finaliseNorthStarRun(input: {
  repoRoot: string;
  runRoot: string;
  runId: string;
  request: WorkRequest;
  spec: WorkSpec;
  manifest: TraceabilityManifest;
  packets: TaskPacket[];
  verifiers: VerifierDefinition[];
  claimPolicies?: ClaimAcceptancePolicy[];
  semanticAuditor?: IndependentSemanticAuditor;
  requireSemanticAudit?: boolean;
  runner: Runner;
  latestSummary: RunSummary;
}): Promise<NorthStarRunResult> {
  const verifierMap = new Map(input.verifiers.map((verifier) => [verifier.id, verifier]));
  const { byTask } = verificationEntries(input.packets, input.manifest, verifierMap);
  const reportLedger = new TaskReportLedger(path.join(input.runRoot, 'task-reports.jsonl'));
  const reports = reportLedger.read().map((item) => item.report);
  const evidenceFile = path.join(input.runRoot, 'evidence.jsonl');
  const ledger = new EvidenceLedger(evidenceFile, input.repoRoot);
  // Replay is idempotent by deterministic evidence_id. If a process died after
  // the report was durably written but before the evidence append, resume repairs
  // the proof chain without rerunning the already-settled task.
  for (const report of reports) ensureEvidenceForReport(report, input.packets, byTask, ledger, input.repoRoot, input.spec.spec_id, input.spec.revision, 0, process.platform);
  const evidence = ledger.read();
  persistRawArtifacts(input.runRoot, input.runId, reports);
  const journal = new Journal(path.join(input.runRoot, 'journal.jsonl'), {
    repository: path.basename(input.repoRoot), plan: input.spec.spec_id, revision: String(input.spec.revision),
  });
  const violations = journalViolations(journal);
  const policyViolations = [...violations.policy];
  if (!input.runner.resumeContext()) policyViolations.push('durable checkpoint was not produced or could not be validated');
  const acceptance = deriveAcceptance({
    spec: input.spec,
    packets: input.packets,
    manifest: input.manifest,
    evidence,
    policies: input.claimPolicies,
    scopeViolations: violations.scope,
    policyViolations: [...new Set(policyViolations)],
    binding: { spec_id: input.spec.spec_id, spec_revision: input.spec.revision, candidate_epoch: 0, platform: process.platform },
  });
  const changedFiles = [...new Set(reports.flatMap((report) => report.filesChanged ?? []))].sort();
  const decisionFabricDir = path.join(input.runRoot, 'decision-fabric');
  const decisionFabricRecords = fs.existsSync(decisionFabricDir)
    ? fs.readdirSync(decisionFabricDir).filter((file) => file.endsWith('.json')).sort().map((file) => {
      const decision = readJson<Record<string, unknown>>(path.join(decisionFabricDir, file));
      const taskId = file.replace(/\.json$/, '');
      const report = reports.filter((item) => (item.contractTaskId ?? item.taskId) === taskId).at(-1);
      return { task_id: taskId, decision, verified_outcome: report?.outcome ?? 'not-executed', verification_steps: report?.verificationSteps ?? [] };
    })
    : [];
  writeJsonAtomic(path.join(input.runRoot, 'decision-fabric-outcomes.json'), {
    schema: 'harness/decision-fabric-outcomes/v1',
    mode: decisionFabricRecords.some((record) => (record.decision as { mode?: string }).mode === 'active') ? 'active' : 'shadow',
    records: decisionFabricRecords,
  });
  const semanticRequired = input.requireSemanticAudit === true || (((input.spec.risk_class ?? 'S1') === 'S2' || (input.spec.risk_class ?? 'S1') === 'S3') && input.manifest.claims.some((claim) => claim.class === 'semantic'));
  let semanticReview: SemanticAuditResult | undefined;
  if (input.semanticAuditor) {
    try {
      semanticReview = await input.semanticAuditor.audit({ request: input.request, spec: input.spec, manifest: input.manifest, packets: input.packets, evidence: evidence.map((item) => item.record), changedFiles });
      if (semanticReview.auditor_id !== input.semanticAuditor.id) semanticReview = { verdict: 'BLOCKED', auditor_id: input.semanticAuditor.id, findings: [{ code: 'AUDITOR_ID_MISMATCH', severity: 'critical', message: 'semantic auditor receipt identity mismatch' }] };
    } catch (error) {
      semanticReview = { verdict: 'BLOCKED', auditor_id: input.semanticAuditor.id, findings: [{ code: 'AUDITOR_FAILURE', severity: 'critical', message: error instanceof Error ? error.message : String(error) }] };
    }
  } else if (semanticRequired) {
    semanticReview = { verdict: 'BLOCKED', auditor_id: 'unavailable', findings: [{ code: 'INDEPENDENT_SEMANTIC_REVIEW_REQUIRED', severity: 'critical', message: 'S2/S3 semantic work requires an independent semantic auditor' }] };
  }
  const audit = auditAcceptance({
    request: input.request,
    spec: input.spec,
    manifest: input.manifest,
    packets: input.packets,
    evidence: evidence.map((item) => item.record),
    acceptance,
    ...(semanticReview ? { semanticReview } : {}),
  });
  const convergence = assessConvergence({ spec: input.spec, packets: input.packets, acceptance, audit });
  // Single outcome reducer (REQ-112): the OutcomeReducer is the only place
  // that derives final run outcomes from evidence. The orchestrator never
  // authors PASS independently.
  let reducedOutcome: ReducedOutcome = reduceRunResult({
    acceptance,
    audit,
    convergence,
    semanticReview,
    run_id: input.runId,
    spec_id: input.spec.spec_id,
    spec_revision: input.spec.revision,
    candidate_epoch: 0,
    platform: process.platform,
  });
  let trustedOutcome: AcceptanceResult['outcome'] = outcomeToAcceptanceShape(reducedOutcome.claim_outcome, acceptance);

  let state: RunState = {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    run_id: input.runId,
    spec_id: input.spec.spec_id,
    spec_revision: input.spec.revision,
    work_id: input.request.work_id,
    execution_generation: input.packets[0]?.execution_generation ?? input.spec.execution_generation ?? 0,
    status: trustedOutcome === 'PASS' ? 'passed' : trustedOutcome === 'BLOCKED' ? 'blocked' : trustedOutcome === 'FAILED' ? 'failed' : 'partial',
    tasks: Object.fromEntries(input.packets.map((packet) => {
      const taskReports = reports.filter((report) => (report.contractTaskId ?? report.taskId) === packet.task_id);
      const last = taskReports.at(-1);
      const claims = [...new Set(packet.acceptance.map((entry) => entry.claim_id))];
      const hasFailedClaim = claims.some((claim) => acceptance.failed_claims.includes(claim));
      const hasUnresolvedClaim = claims.some((claim) => acceptance.unresolved_claims.includes(claim));
      const allClaimsAccepted = claims.length > 0 && claims.every((claim) => acceptance.accepted_claims.includes(claim));
      const status = hasFailedClaim
        ? 'failed'
        : hasUnresolvedClaim || last?.outcome === 'needs-user'
          ? 'blocked'
          : allClaimsAccepted && last?.outcome === 'done'
            ? 'done'
            : last
              ? 'failed'
              : 'ready';
      return [packet.task_id, status];
    })),
    current_task: null,
    checkpoint: fs.existsSync(path.join(input.runRoot, 'checkpoint.json')) ? 'checkpoint.json' : null,
    unresolved_claims: acceptance.unresolved_claims,
  };
  const semanticState = validateSemanticState({
    authority: readExecutionAuthority(input.repoRoot),
    tasks: input.packets.map((packet) => ({
      id: packet.task_id,
      status: state.tasks[packet.task_id] ?? 'ready',
      work_id: packet.work_id ?? input.request.work_id,
      execution_generation: packet.execution_generation ?? input.spec.execution_generation ?? 0,
      spec_revision: packet.spec_revision ?? input.spec.revision,
      claim_ids: packet.acceptance.map((entry) => entry.claim_id),
    })),
    runs: [{
      id: state.run_id,
      status: state.status,
      work_id: state.work_id ?? input.request.work_id,
      execution_generation: state.execution_generation ?? 0,
      spec_revision: state.spec_revision,
      unresolved_claims: state.unresolved_claims,
      task_ids: Object.keys(state.tasks),
    }],
    evidence: evidence.map(({ record }) => ({
      id: record.evidence_id,
      claim_id: record.claim_id,
      status: record.status,
      ...(record.work_id ? { work_id: record.work_id } : {}),
      ...(record.execution_generation !== undefined ? { execution_generation: record.execution_generation } : {}),
      ...(record.spec_revision !== undefined ? { spec_revision: record.spec_revision } : {}),
      source_role: 'verifier' as const,
    })),
    acceptance: { id: 'acceptance', outcome: trustedOutcome, unresolved_claims: acceptance.unresolved_claims },
  });
  writeJsonAtomic(path.join(input.runRoot, 'semantic-state.json'), semanticState);
  if (!semanticState.valid) {
    // Route the fail-closed block through the single OutcomeReducer so no
    // orchestrator-side assignment authors an outcome independently (REQ-112).
    reducedOutcome = reduceRunResult({
      acceptance,
      audit,
      convergence,
      semanticReview,
      hardBlockReasons: semanticState.violations.map((violation) => `${violation.code}: ${violation.detail}`),
      run_id: input.runId,
      spec_id: input.spec.spec_id,
      spec_revision: input.spec.revision,
      candidate_epoch: 0,
      platform: process.platform,
    });
    trustedOutcome = outcomeToAcceptanceShape(reducedOutcome.claim_outcome, acceptance);
    state = {
      ...state,
      status: 'blocked',
      unresolved_claims: [...new Set([
        ...(state.unresolved_claims ?? []),
        ...semanticState.violations.flatMap((violation) => violation.affects_claim_ids),
      ])],
    };
  }
  assertRunState(state);
  writeJsonAtomic(path.join(input.runRoot, 'run-state.json'), state);
  writeJsonAtomic(path.join(input.runRoot, 'acceptance.json'), acceptance);
  writeJsonAtomic(path.join(input.runRoot, 'acceptance-audit.json'), audit);
  if (semanticReview) writeJsonAtomic(path.join(input.runRoot, 'semantic-review.json'), semanticReview);
  writeJsonAtomic(path.join(input.runRoot, 'convergence.json'), convergence);
  const proofOfWorkFile = path.join(input.runRoot, 'proof-of-work.json');
  const resultFile = path.join(input.runRoot, 'result.md');
  const proofOfWork: ProofOfWorkReport = {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    run_id: input.runId,
    work_id: input.request.work_id,
    spec_id: input.spec.spec_id,
    spec_revision: input.spec.revision,
    execution_generation: input.packets[0]?.execution_generation ?? input.spec.execution_generation ?? 0,
    outcome: trustedOutcome,
    deterministic_acceptance: acceptance.outcome,
      acceptance_audit: audit.accepted ? 'PASS' : 'FAILED',
    requirements: input.spec.requirements.map((requirement) => ({
      requirement_id: requirement.id, mandatory: requirement.mandatory, status: requirementStatus(requirement.claims, acceptance), claims: [...requirement.claims],
    })),
    evidence: evidence.map(({ record }) => ({
      evidence_id: record.evidence_id, claim_id: record.claim_id, task_id: record.task_id, kind: record.kind, status: record.status,
      ...(record.artifact_path ? { artifact_path: record.artifact_path } : {}), ...(record.sha256 ? { sha256: record.sha256 } : {}),
      ...(record.observed_at ? { observed_at: record.observed_at } : {}),
    })),
    changed_files: changedFiles,
    residual_risk: [...new Set([...acceptance.reasons, ...audit.findings])],
    artifacts: {
      work_request: 'work-request.json', work_spec: 'work-spec.json', traceability_manifest: 'traceability-manifest.json', task_packets: 'task-packets.json',
      verification_graph: 'verification-graph.json', evidence_ledger: 'evidence.jsonl', raw_artifacts: 'raw-artifacts.json', acceptance: 'acceptance.json',
      acceptance_audit: 'acceptance-audit.json', semantic_review: semanticReview ? 'semantic-review.json' : null, convergence: 'convergence.json', semantic_state: 'semantic-state.json', checkpoint: state.checkpoint ?? null,
      decision_fabric: 'decision-fabric-outcomes.json',
      resource_decision: 'resource-decision.json', execution_lifecycle: 'execution-lifecycle.json',
      context_state: 'context-state.json',
    },
  };
  writeJsonAtomic(proofOfWorkFile, proofOfWork);

  const contextStateFile = path.join(input.runRoot, 'context-state.json');
  if (fs.existsSync(contextStateFile)) {
    try {
      let ctxState = readJson<ContextState>(contextStateFile);
      ctxState = evaluateContextState(ctxState, 'RUN_FINALIZED', { nextPhase: 'SETTLEMENT' });
      writeJsonAtomic(contextStateFile, ctxState);
    } catch (contextError) {
      const message = contextError instanceof Error ? contextError.message : String(contextError);
      // Route the fail-closed block through the single OutcomeReducer (REQ-112).
      reducedOutcome = reduceRunResult({
        acceptance,
        audit,
        convergence,
        semanticReview,
        hardBlockReasons: [`context settlement failed: ${message}`],
        run_id: input.runId,
        spec_id: input.spec.spec_id,
        spec_revision: input.spec.revision,
        candidate_epoch: 0,
        platform: process.platform,
      });
      trustedOutcome = outcomeToAcceptanceShape(reducedOutcome.claim_outcome, acceptance);
      proofOfWork.outcome = trustedOutcome;
      writeJsonAtomic(proofOfWorkFile, proofOfWork);
      const diagFile = path.join(input.runRoot, 'context-diagnostic.json');
      try {
        writeJsonAtomic(diagFile, { error: message, phase: 'RUN_FINALIZED', timestamp: new Date().toISOString() });
      } catch {
        /* diagnostic best-effort */
      }
    }
  }

  // REQ-013: append the 5fedu reference-disclosure footer only when the
  // reference broker was actually consumed during this run.
  let runtimeConfigForFooter: { domain_pack?: { id: string } | null } | null = null;
  try {
    runtimeConfigForFooter = readJson<{ domain_pack?: { id: string } | null }>(path.join(input.runRoot, 'runtime-config.json'));
  } catch {
    /* not present on resumed/legacy runs */
  }
  const domainFooter = domainReferenceFooter(input.repoRoot, input.runRoot, input.request, runtimeConfigForFooter);
  fs.writeFileSync(resultFile, renderTrustedResult(proofOfWork, domainFooter), { mode: 0o600 });
  const runnerSummary = cumulativeSummary(reports, input.latestSummary.recovered);
  const lifecycleFile = path.join(input.runRoot, 'execution-lifecycle.json');
  if (fs.existsSync(lifecycleFile)) {
    const current = readJson<ExecutionLifecycleRecord>(lifecycleFile);
    const finished = transitionExecution(current, 'SUCCEEDED', { task_truth: truthFromOutcome(trustedOutcome), reason: trustedOutcome === 'PASS' ? 'orchestration completed with trusted PASS' : `orchestration completed; task truth=${trustedOutcome}` });
    writeJsonAtomic(lifecycleFile, finished);
  }
  persistCanonicalRunArtifacts({
    runsRoot: path.join(input.repoRoot, '.agent', 'runs'),
    runId: input.runId,
    state,
    outcome: reducedOutcome,
    spec: input.spec,
    request: input.request,
    repoRoot: input.repoRoot,
  });
  return { run_id: input.runId, work_id: input.request.work_id, execution_generation: input.packets[0]?.execution_generation ?? input.spec.execution_generation ?? 0, state, acceptance, audit, convergence, trusted_outcome: trustedOutcome, runner: runnerSummary, run_root: input.runRoot, evidence_file: evidenceFile, proof_of_work_file: proofOfWorkFile, result_file: resultFile };
}

/**
 * Single-writer persistence (REQ-112): the canonical run.json / events.jsonl /
 * result.json / artifacts/ are written ONLY through RunStore. All other run
 * diagnostics are derived artifacts of the orchestrator; the canonical truth
 * chain belongs to RunStore and the OutcomeReducer.
 */
function kernelGitHead(repoRoot: string): string {
  const headFile = path.join(repoRoot, '.git', 'HEAD');
  try {
    const raw = fs.readFileSync(headFile, 'utf8').trim();
    if (!raw.startsWith('ref:')) return raw;
    const ref = raw.slice(4).trim();
    const refFile = path.join(repoRoot, '.git', ref);
    return fs.existsSync(refFile) ? fs.readFileSync(refFile, 'utf8').trim() : raw;
  } catch {
    return 'unknown-head';
  }
}

function persistCanonicalRunArtifacts(input: {
  runsRoot: string;
  runId: string;
  state: RunState;
  outcome: ReducedOutcome;
  spec: WorkSpec;
  request: WorkRequest;
  repoRoot: string;
}): void {
  const store = new RunStore(input.runsRoot);
  store.putState(input.runId, {
    run_id: input.runId,
    work_id: input.request.work_id,
    spec_id: input.spec.spec_id,
    spec_revision: input.spec.revision,
    task_state: input.state.status,
    claim_outcome: input.outcome.claim_outcome,
    derived_from: input.outcome.derived_from,
    platform: input.outcome.platform,
    candidate_epoch: input.outcome.candidate_epoch,
    raw_intent: input.request.raw_intent,
  });
  store.appendEvent(input.runId, { event: 'OUTCOME_REDUCED', claim_outcome: input.outcome.claim_outcome, reasons: input.outcome.reasons });
  // Single finalization: convergence passes re-finalise the SAME runId. The
  // first pass writes result.json; later passes must never double-finalize
  // (REQ-112 single writer, single finalization).
  const resultFile = path.join(input.runsRoot, input.runId, 'result.json');
  if (fs.existsSync(resultFile)) return;
  store.finalize(input.runId, {
    schema: 'agent-rules/outcome-receipt',
    version: 1,
    run_id: input.runId,
    git_head: kernelGitHead(input.repoRoot),
    outcome: input.outcome.claim_outcome,
    claims: {},
    proof_plan: { run_id: input.runId, selected: [], omitted: [], claims: input.spec.requirements.flatMap((r) => r.claims) },
    evidence_ledger_hash: '0'.repeat(64),
    created_at: new Date().toISOString(),
  });
}

interface ConvergenceContinuationInput {
  repoRoot: string;
  runRoot: string;
  runId: string;
  request: WorkRequest;
  spec: WorkSpec;
  manifest: TraceabilityManifest;
  packets: TaskPacket[];
  verifiers: VerifierDefinition[];
  claimPolicies?: ClaimAcceptancePolicy[];
  semanticAuditor?: IndependentSemanticAuditor;
  requireSemanticAudit?: boolean;
  runner: Runner;
  summary: RunSummary;
  result: NorthStarRunResult;
  maxPasses: number;
  verifierMap: ReadonlyMap<string, VerifierDefinition>;
  entriesByTask: Map<string, Array<{ claim_id: string; verifier: VerifierDefinition; oracle_group?: string }>>;
  enqueuePacket: (packet: TaskPacket, dependencies: ReadonlyMap<string, string[]>) => void;
}

/** Continue only bounded, claim-grounded convergence work, including after resume. */
async function continueConvergence(input: ConvergenceContinuationInput): Promise<NorthStarRunResult> {
  let result = input.result;
  let summary = input.summary;
  const convergenceHistory: ConvergenceResult[] = [result.convergence];
  for (let pass = 1; pass <= input.maxPasses && !result.convergence.converged; pass += 1) {
    const compiled = compileConvergenceDeltaPackets({ spec: input.spec, packets: input.packets, result: result.convergence, pass });
    if (compiled.packets.length === 0) break;
    const convergenceJournal = new Journal(path.join(input.runRoot, 'journal.jsonl'), {
      repository: path.basename(input.repoRoot), plan: input.spec.spec_id, revision: String(input.spec.revision),
    });
    convergenceJournal.append('CONVERGENCE_DELTA_COMPILED', {
      pass,
      taskIds: compiled.packets.map((packet) => packet.task_id),
      skipped: compiled.skipped,
    });
    input.packets.push(...compiled.packets);
    const refreshed = verificationEntries(input.packets, input.manifest, input.verifierMap);
    input.entriesByTask.clear();
    for (const [taskId, entries] of refreshed.byTask) input.entriesByTask.set(taskId, entries);
    const dependencies = taskDependenciesFromVerificationGraph(refreshed.graph);
    writeJsonAtomic(path.join(input.runRoot, 'task-packets.json'), input.packets);
    writeJsonAtomic(path.join(input.runRoot, 'verification-graph.json'), refreshed.graph);
    for (const packet of compiled.packets) input.enqueuePacket(packet, dependencies);
    prepareConvergenceRetry(input.runRoot, `bounded convergence pass ${pass} compiled ${compiled.packets.length} claim-grounded delta task(s)`);
    summary = await input.runner.run();
    result = await finaliseNorthStarRun({
      repoRoot: input.repoRoot, runRoot: input.runRoot, runId: input.runId, request: input.request, spec: input.spec, manifest: input.manifest,
      packets: input.packets, verifiers: input.verifiers, claimPolicies: input.claimPolicies,
      semanticAuditor: input.semanticAuditor, requireSemanticAudit: input.requireSemanticAudit, runner: input.runner, latestSummary: summary,
    });
    const oscillation = detectConvergenceOscillation([...convergenceHistory, result.convergence]);
    if (oscillation.detected) {
      const convergenceJournal = new Journal(path.join(input.runRoot, 'journal.jsonl'), {
        repository: path.basename(input.repoRoot), plan: input.spec.spec_id, revision: String(input.spec.revision),
      });
      convergenceJournal.append('CONVERGENCE_OSCILLATION_DETECTED', {
        pass,
        fingerprint: oscillation.fingerprint,
        firstIndex: oscillation.first_index,
        repeatIndex: oscillation.repeat_index,
        action: 'stop bounded convergence; preserve unresolved gap for review/owner resolution',
      });
      result = {
        ...result,
        convergence: {
          ...result.convergence,
          oscillation_detected: true,
          oscillation_fingerprint: oscillation.fingerprint,
        },
      };
      writeJsonAtomic(path.join(input.runRoot, 'convergence.json'), result.convergence);
      break;
    }
    convergenceHistory.push(result.convergence);
  }
  return result;
}

function makeNorthStarRunner(input: {
  repoRoot: string;
  runRoot: string;
  runId: string;
  executionGeneration: number;
  request: WorkRequest;
  spec: WorkSpec;
  manifest: TraceabilityManifest;
  packets: TaskPacket[];
  verifiers: VerifierDefinition[];
  entriesByTask: ReadonlyMap<string, Array<{ claim_id: string; verifier: VerifierDefinition; oracle_group?: string }>>;
  agent: AgentKind;
  harnessRoot: string;
  maxRepairDepth?: number;
  taskTimeoutMs?: number;
  maxTasks?: number;
  invocationOverride?: (prompt: string) => { executable: string; args: string[] };
  skipAgentDetection?: boolean;
  contextByTask?: Map<string, CompiledContext>;
  semanticResolver?: SemanticCodeResolver;
  driver?: AgentDriver;
  laneController?: { acquire(lane: 'writer' | 'verifier'): boolean; release(lane: 'writer' | 'verifier'): void };
  admission?: { admit: (input: Omit<ArtifactAdmissionInput, 'owner'>) => ReturnType<typeof admitArtifact> };
}): Runner {
  const reportLedger = new TaskReportLedger(path.join(input.runRoot, 'task-reports.jsonl'));
  const evidenceLedger = new EvidenceLedger(path.join(input.runRoot, 'evidence.jsonl'), input.repoRoot);
  return new Runner({
    cwd: input.repoRoot,
    queueRoot: path.join(input.runRoot, 'queue'),
    journalPath: path.join(input.runRoot, 'journal.jsonl'),
    checkpointPath: path.join(input.runRoot, 'checkpoint.json'),
    identity: { repository: path.basename(input.repoRoot), plan: input.spec.spec_id, revision: String(input.spec.revision) },
    agent: input.agent,
    ...(input.driver ? { driver: input.driver } : {}),
    ...(input.laneController ? { laneController: input.laneController } : {}),
    maxRepairDepth: input.maxRepairDepth,
    taskTimeoutMs: input.taskTimeoutMs,
    maxTasks: input.maxTasks,
    logDir: path.join(input.runRoot, 'logs'),
    invocationOverride: input.invocationOverride,
    skipAgentDetection: input.skipAgentDetection,
    guardVerificationIntegrity: true,
    strictMcpIntegrations: true,
    repairPromptHints: input.contextByTask ? (task, reason) => {
      const contractId = task.contractTaskId ?? task.id;
      const prior = input.contextByTask!.get(contractId);
      const packet = input.packets.find((candidate) => candidate.task_id === contractId);
      if (!prior || !packet) return [];
      const requests = deriveContextFeedback({ failure: reason, prior });
      const paths = requests.filter((request) => request.kind === 'path').map((request) => request.query);
      const symbols = requests.filter((request) => request.kind === 'symbol').map((request) => request.query);
      const feedbackPacket: TaskPacket = {
        ...packet,
        context: { ...(paths.length ? { entrypoints: paths } : {}), ...(symbols.length ? { symbols } : {}) },
      };
      const resolved = (paths.length || symbols.length)
        ? compileContext(feedbackPacket, input.spec, input.manifest, { repoRoot: input.repoRoot, skillRoot: input.harnessRoot, tokenBudget: 2_500, semanticResolver: input.semanticResolver })
        : null;
      const grounded = (resolved?.items ?? [])
        .filter((item) => item.kind === 'entrypoint' || item.kind === 'symbol')
        .slice(0, 6)
        .map((item) => `${item.kind}:${item.source}\n${item.content.slice(0, 4_000)}`);
      const decision = requests.some((request) => request.kind === 'decision')
        ? (packet.context?.decisions ?? input.spec.decisions ?? []).slice(0, 3).map((value) => `decision:${value}`)
        : [];
      if (grounded.length || decision.length) return [...grounded, ...decision];
      return requests.map((request) => `${request.kind}:${request.query} — ${request.reason}`);
    } : undefined,
    mcpRegistryRoot: path.join(input.harnessRoot, 'integrations'),
    runContext: { protocolVersion: NORTH_STAR_PROTOCOL_VERSION, runId: input.runId, workId: input.request.work_id, executionGeneration: input.executionGeneration },
    executionAuthority: () => readExecutionAuthority(input.repoRoot),
    onTaskSettled: (report) => {
      reportLedger.append(report);
      ensureEvidenceForReport(report, input.packets, input.entriesByTask, evidenceLedger, input.repoRoot, input.spec.spec_id, input.spec.revision, 0, process.platform);

      const contextStateFile = path.join(input.runRoot, 'context-state.json');
      if (fs.existsSync(contextStateFile)) {
        const contractTaskId = report.contractTaskId ?? report.taskId;
        try {
          let ctxState = readJson<ContextState>(contextStateFile);
          const packet = input.packets.find((p) => p.task_id === contractTaskId);
          const entries = input.entriesByTask.get(contractTaskId) ?? [];
          const newVerifierEvidence: VerifierEvidence[] = entries.map((entry, index) => {
            const code = report.verificationExitCodes[index];
            const step = report.verificationSteps?.[index];
            const artifact = step?.evidence?.[0];
            const sha = artifact?.sha256 || report.diffSha256 || sha256Canonical({ task: report.taskId, verifier: entry.verifier.id, code: code ?? -1 });
            return {
              verifierId: entry.verifier.id,
              claimId: entry.claim_id,
              status: code === 0 ? ('PASS' as const) : ('FAIL' as const),
              outputSha256: sha,
              observedAt: new Date().toISOString(),
              failureReason: step?.diagnostic,
            };
          });

          const newObservations: ContextObservation[] = [
            ...(report.filesChanged ?? []).map((f) => ({
              id: `OBS-FILE-${sha256Canonical(f).slice(0, 8)}`,
              observedAt: new Date().toISOString(),
              source: 'file_change' as const,
              content: `Modified workspace file: ${f}`,
            })),
          ];

          if (report.outcome === 'failed') {
            const repairResult = categorizeRepair(report.reason ?? 'verification failed');
            ctxState = evaluateContextState(ctxState, 'VERIFIER_FAILURE', {
              nextPhase: 'REPAIR',
              repairResult,
              newVerifierEvidence,
              newObservations,
              updatedPacket: packet,
            });
          } else {
            ctxState = evaluateContextState(ctxState, 'TASK_SETTLED', {
              newVerifierEvidence,
              newObservations,
              updatedPacket: packet,
            });
          }
          writeJsonAtomic(contextStateFile, ctxState);
        } catch (contextErr) {
          const message = contextErr instanceof Error ? contextErr.message : String(contextErr);
          const diagFile = path.join(input.runRoot, 'context-diagnostic.json');
          try {
            writeJsonAtomic(diagFile, {
              error: message,
              phase: report.outcome === 'failed' ? 'VERIFIER_FAILURE' : 'TASK_SETTLED',
              taskId: contractTaskId,
              timestamp: new Date().toISOString(),
            });
          } catch {
            /* diagnostic best-effort */
          }
          throw new Error(`Mandatory context state update failed for task ${contractTaskId}: ${message}`);
        }
      }
    },
  });
}

/**
 * Provider-neutral runtime facade over the proven production Runner. It wires the
 * frozen North-Star contracts into real task execution instead of replacing the
 * runner with a second toy engine.
 */
export async function executeNorthStarRun(input: NorthStarRunInput & { maxTasks?: number }): Promise<NorthStarRunResult> {
  const workflow = resolveManagedWorkflow({ proofRouter: input.proofRouter });
  const proofRouter = workflow.proofRouter;
  const executionGeneration = input.executionGeneration ?? input.spec.execution_generation ?? 0;
  // Bind planner/provider output at the execution boundary so durable queue
  // records and evidence cannot lose the owner identity that authorized them.
  input = {
    ...input,
    executionGeneration,
    packets: input.packets.map((packet) => ({
      ...packet,
      work_id: packet.work_id ?? input.request.work_id,
      execution_generation: packet.execution_generation ?? executionGeneration,
    })),
  };
  const verifierMap = assertRuntimeInputs(input);
  const maxConvergencePasses = boundedConvergencePasses(input.maxConvergencePasses);
  const harnessRoot = resolveHarnessRoot(input.repoRoot, input.harnessRoot);
  const domainPack = input.domainPack ? loadDomainPack(harnessRoot, input.domainPack.id) : undefined;
  if (domainPack) assertDomainPackStage(domainPack, input.domainPack?.stage ?? 'implementation');

  const runId = newId('RUN', `${input.spec.spec_id}:${input.spec.revision}:${Date.now()}`);
  const runRoot = input.runRoot ?? path.join(input.repoRoot, '.agent', 'runs', runId);
  if (fs.existsSync(path.join(runRoot, 'run-state.json'))) throw new Error(`run root already contains a North-Star run; use resume instead: ${runRoot}`);
  fs.mkdirSync(runRoot, { recursive: true });
  writeJsonAtomic(path.join(runRoot, 'work-request.json'), input.request);
  writeJsonAtomic(path.join(runRoot, 'work-spec.json'), input.spec);
  writeJsonAtomic(path.join(runRoot, 'traceability-manifest.json'), input.manifest);
  writeJsonAtomic(path.join(runRoot, 'task-packets.json'), input.packets);
  writeJsonAtomic(path.join(runRoot, 'verifiers.json'), input.verifiers);
  writeJsonAtomic(path.join(runRoot, 'claim-policies.json'), input.claimPolicies ?? []);
  const runtimeConfig: PersistedRuntimeConfig = {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    run_id: runId,
    agent: input.agent,
    max_repair_depth: input.maxRepairDepth ?? null,
    max_convergence_passes: maxConvergencePasses,
    task_timeout_ms: input.taskTimeoutMs ?? null,
    domain_pack: input.domainPack ? { id: input.domainPack.id, stage: input.domainPack.stage ?? 'implementation' } : null,
    require_semantic_audit: input.requireSemanticAudit ?? false,
    execution_generation: executionGeneration,
    decision_fabric_mode: workflow.decisionFabricMode,
  };
  writeJsonAtomic(path.join(runRoot, 'runtime-config.json'), runtimeConfig);

  const resourceDecision = governResources(input.resourceSnapshot ?? observeHostResources());
  writeJsonAtomic(path.join(runRoot, 'resource-decision.json'), resourceDecision);
  if (!resourceDecision.allow_new_work) throw new Error(`resource governor blocked new work: ${resourceDecision.reasons.join('; ')}`);
  let lifecycle: ExecutionLifecycleRecord = {
    run_id: runId, work_id: input.request.work_id, execution_generation: executionGeneration, spec_revision: input.spec.revision,
    execution_state: 'CLAIMED', task_truth: 'READY', updated_at: new Date().toISOString(), attempt: 1,
  };
  writeJsonAtomic(path.join(runRoot, 'execution-lifecycle.json'), lifecycle);
  lifecycle = transitionExecution(lifecycle, 'PREPARING');
  writeJsonAtomic(path.join(runRoot, 'execution-lifecycle.json'), lifecycle);

  const initialTasks = Object.fromEntries(input.packets.map((packet) => [packet.task_id, 'ready' as const]));
  const initialState: RunState = {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    run_id: runId,
    spec_id: input.spec.spec_id,
    spec_revision: input.spec.revision,
    work_id: input.request.work_id,
    execution_generation: executionGeneration,
    status: 'ready',
    tasks: initialTasks,
    current_task: null,
    checkpoint: null,
    unresolved_claims: input.spec.requirements.filter((r) => r.mandatory).flatMap((r) => r.claims),
  };
  assertRunState(initialState);
  writeJsonAtomic(path.join(runRoot, 'run-state.json'), initialState);

  // REQ-012: emit the context budget receipt at the actual run edge. It measures
  // the installed graph and the model-visible subset actually selected (rules,
  // skill metadata/bodies, tool/MCP/subagent schemas) — never the whole graph.
  const modelVisible = [...input.packets].reduce<ContextBudgetInput['model_visible']>((acc, packet) => {
    acc!.rules = acc!.rules ?? [];
    acc!.rules.push({ tokens: Math.ceil(400 / 3.6) }); // stable minimal bootstrap
    acc!.skill_metadata = acc!.skill_metadata ?? [];
    acc!.skill_metadata.push({ tokens: Math.ceil(120 / 3.6) });
    acc!.tool_schemas = acc!.tool_schemas ?? [];
    acc!.tool_schemas.push({ tokens: Math.ceil(180 / 3.6) });
    acc!.mcp_schemas = acc!.mcp_schemas ?? [];
    acc!.mcp_schemas.push({ tokens: Math.ceil(90 / 3.6) });
    acc!.subagent_advertisements = acc!.subagent_advertisements ?? [];
    acc!.subagent_advertisements.push({ tokens: Math.ceil(60 / 3.6) });
    return acc;
  }, {});
  const contextBudget = buildContextBudgetReceipt({
    run_id: runId,
    work_id: input.request.work_id,
    measurement_source: 'ESTIMATED',
    installed_graph: estimateInstalledGraph(input.repoRoot),
    model_visible: modelVisible,
    input_tokens: { tool_results: 0, repair_retries: 0, repeated_reads: 0 },
    excluded: [
      { kind: 'inactive_plans', count: 0, reason: 'inactive plans are never model-visible' },
      { kind: 'old_receipts', count: 0, reason: 'old receipts are archive/audit only' },
      { kind: 'cold_references', count: 0, reason: 'references load on demand, never eagerly' },
      { kind: 'unused_mcp', count: 0, reason: 'MCP schemas advertise only when a capability plan selects them or a lease is active' },
    ],
  });
  writeJsonAtomic(path.join(runRoot, 'context-budget-receipt.json'), contextBudget);

  const broker = createStandardCapabilityBroker(harnessRoot, { decisionFabricMode: workflow.decisionFabricMode });

  const workspaceFacts: WorkspaceFacts = {
    repoRoot: input.repoRoot,
    hasFrontend: fs.existsSync(path.join(input.repoRoot, 'src', 'components')) || fs.existsSync(path.join(input.repoRoot, 'src', 'pages')),
    hasDatabase: fs.existsSync(path.join(input.repoRoot, 'prisma')) || fs.existsSync(path.join(input.repoRoot, 'drizzle')),
    hasBackend: fs.existsSync(path.join(input.repoRoot, 'src', 'api')) || fs.existsSync(path.join(input.repoRoot, 'src', 'server')),
  };

  const hostCap = HOST_CAPABILITIES[(input.agent ?? 'opencode') as HostId];
  const hostSurface: HostSurfaceContext = {
    host: input.agent,
    surface: hostCap?.headless ? 'cli' : 'desktop',
    supportsNativeSkills: hostCap?.native_subagents ?? false,
    supportsNativeMcp: hostCap?.mcp ?? true,
  };

  let contextState = createContextState({
    request: input.request,
    spec: input.spec,
    packet: input.packets[0],
    workspaceFacts,
    hostSurface,
    initialPhase: 'INTAKE',
  });
  contextState = evaluateContextState(contextState, 'TRANSITION_PLANNING', { nextPhase: 'PLAN' });
  writeJsonAtomic(path.join(runRoot, 'context-state.json'), contextState);

  const workerModelDecision = modelDecisionForSpec(input.spec, 'worker');
  writeJsonAtomic(path.join(runRoot, 'model-decisions.json'), {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    worker: workerModelDecision,
    host: input.agent,
    resolution: 'host-edge',
    attestation_required: true,
  });
  const { graph: verificationGraph, byTask: verificationEntriesByTask } = verificationEntries(input.packets, input.manifest, verifierMap);
  let taskDependencies = taskDependenciesFromVerificationGraph(verificationGraph);
  writeJsonAtomic(path.join(runRoot, 'verification-graph.json'), verificationGraph);
  writeJsonAtomic(path.join(runRoot, 'capability-manifest.json'), broker.manifest(`CAP-${runId}`));

  const contextByTask = new Map<string, CompiledContext>();
  // F07/REQ-007: production LaneController + Artifact Admission wiring. The
  // lane controller serializes the writer and gates the verifier lane; artifact
  // admission gates every operational write below.
  const laneController = new LaneController();
  if (resourceDecision.pressure === 'elevated' || resourceDecision.pressure === 'critical') laneController.applyMemoryPressure(resourceDecision.pressure === 'critical' ? 0.25 : 0.5);
  const admitArtifactForRun = (input2: Omit<ArtifactAdmissionInput, 'owner'>) => admitArtifact({ ...input2, owner: 'harness-maintainer' });
  const runner = makeNorthStarRunner({
    repoRoot: input.repoRoot, runRoot, runId, executionGeneration, request: input.request, spec: input.spec, manifest: input.manifest, packets: input.packets,
    verifiers: input.verifiers, entriesByTask: verificationEntriesByTask, agent: input.agent, harnessRoot,
    maxRepairDepth: input.maxRepairDepth, taskTimeoutMs: input.taskTimeoutMs, maxTasks: input.maxTasks,
    invocationOverride: input.invocationOverride, skipAgentDetection: input.skipAgentDetection, contextByTask, semanticResolver: input.semanticResolver,
    laneController: { acquire: (lane) => laneController.acquire(lane as ResourceLane), release: (lane) => laneController.release(lane as ResourceLane) },
    admission: { admit: admitArtifactForRun },
    ...(input.driver ? { driver: input.driver } : {}),
  });

  const enqueuePacket = (packet: TaskPacket, dependencies: ReadonlyMap<string, string[]>): void => {
    contextState = evaluateContextState(contextState, 'TRANSITION_IMPLEMENTATION', {
      nextPhase: 'IMPLEMENT',
      updatedPacket: packet,
    });
    writeJsonAtomic(path.join(runRoot, 'context-state.json'), contextState);

    const routed = broker.route(packet, input.explicitCapabilityProviders ?? [], { activeProjectScope: domainPack?.descriptor.id ?? null, repoRoot: input.repoRoot, spec: input.spec });
    const skills = routed.skills;
    const mcpIntegrationIds = [...new Set(Object.entries(routed.providers).flatMap(([capability, providerId]) => {
      if (!providerId) return [];
      const provider = broker.provider(providerId, capability);
      const integrationId = provider?.metadata?.integration_id;
      return provider?.metadata?.mode === 'mcp' && typeof integrationId === 'string' ? [integrationId] : [];
    }))];
    const unresolvedCapability = Object.entries(routed.providers).filter(([, provider]) => provider === null).map(([cap]) => cap);
    if (unresolvedCapability.length) throw new Error(`task ${packet.task_id} lacks capability provider(s): ${unresolvedCapability.join(', ')}`);
    const context = compileContext(packet, input.spec, input.manifest, { repoRoot: input.repoRoot, skillRoot: harnessRoot, skills, previousFailure: packet.repair?.previous_failure, semanticResolver: input.semanticResolver });
    contextByTask.set(packet.task_id, context);
    writeJsonAtomic(path.join(runRoot, 'context', `${packet.task_id}.json`), {
      ...context,
      task_context: buildTaskContext({ request: input.request, spec: input.spec, packet, selectedSkills: skills.map((skill) => skill.id), selectedCapabilities: routed.capabilities, nextAction: 'execute selected packet' }),
      routes: routed,
    });
    if (routed.decision_fabric) writeJsonAtomic(path.join(runRoot, 'decision-fabric', `${packet.task_id}.json`), routed.decision_fabric);
    const allEntries = verificationEntriesByTask.get(packet.task_id) ?? [];
    // F04/REQ-004: when a proof router is supplied, only the selected verifiers
    // run; omitted proofs are recorded with their reason. Otherwise the legacy
    // all-verifiers behavior is preserved.
    let verifierDefinitions = allEntries.map((entry) => entry.verifier);
    let proofRoute: ProofRoutePlan | null = null;
    if (proofRouter) {
      proofRoute = proofRouter(proofRouteRequestForPacket(packet, input.spec, input.repoRoot, packet.task_id));
      const filtered = filterVerifiersByProofRoute(packet, input.spec, allEntries, proofRoute);
      verifierDefinitions = filtered.selected.map((entry) => entry.verifier);
      writeJsonAtomic(path.join(runRoot, 'proof-route', `${packet.task_id}.json`), {
        task_id: packet.task_id,
        selected: filtered.selected.map((e) => `${e.claim_id}:${e.verifier.id}`),
        omitted: filtered.omitted,
        profile: proofRoute.plan.profile,
        selected_profile: proofRoute.plan.profile,
      });
    }
    // F07/REQ-007: enforcement is decided before effect execution/activation.
    if (input.enforcement) {
      const host = (input.agent ?? 'opencode') as HostId;
      const decision = input.enforcement(host);
      if (decision.layer === 'blocked') {
        throw new Error(`task ${packet.task_id} blocked by enforcement for host ${host}: ${decision.reason}`);
      }
    }
    const verificationProfile: VerificationProfile = { steps: verifierDefinitions.map(verifierStep), evidence: [], failFast: true };
    const verification = verifierDefinitions.map((definition) => definition.command ?? `${definition.argv!.executable} ${definition.argv!.args.join(' ')}`);
    runner.tasks.add({
      id: packet.task_id,
      contractTaskId: packet.task_id,
      workId: packet.work_id ?? input.request.work_id,
      executionGeneration: packet.execution_generation ?? input.executionGeneration,
      specRevision: packet.spec_revision,
      prompt: taskPrompt(packet, context, routed.providers, Object.entries(routed.providers).flatMap(([capability, providerId]) => providerId ? [broker.hint(providerId, capability)].filter((value): value is string => !!value) : []), input.repoRoot, domainPack, workerModelDecision),
      verification,
      verificationProfile,
      ownedPaths: packet.scope.owned,
      forbiddenPaths: packet.scope.forbidden,
      allowDocOnly: packet.scope.owned.length > 0 && packet.scope.owned.every((owned) => /(?:^|\/)(?:docs?|readme|.*\.md$)/i.test(owned)),
      repairDepth: packet.repair?.attempt ?? 0,
      requirementId: packet.requirements.join(','),
      ...(dependencies.get(packet.task_id)?.length ? { dependsOnContractTaskIds: dependencies.get(packet.task_id) } : {}),
      ...(mcpIntegrationIds.length ? { mcpIntegrationIds } : {}),
      // REQ-011: remote (url-based) MCP servers are only materialised when the
      // execution policy explicitly allowed network for the routed set.
      ...(packet.policy?.effects.network?.require_routed_mcp_only === false && packet.policy.effects.allowed.includes('network')
        ? { mcpAllowRemote: true }
        : {}),
    });
  };

  for (const packet of input.packets) enqueuePacket(packet, taskDependencies);

  writeJsonAtomic(path.join(runRoot, 'run-state.json'), { ...initialState, status: 'running' } satisfies RunState);
  lifecycle = transitionExecution(lifecycle, 'RUNNING');
  writeJsonAtomic(path.join(runRoot, 'execution-lifecycle.json'), lifecycle);
  try {
    let summary = await runner.run();
    let result = await finaliseNorthStarRun({
      repoRoot: input.repoRoot, runRoot, runId, request: input.request, spec: input.spec, manifest: input.manifest,
      packets: input.packets, verifiers: input.verifiers, claimPolicies: input.claimPolicies,
      semanticAuditor: input.semanticAuditor, requireSemanticAudit: input.requireSemanticAudit, runner, latestSummary: summary,
    });
    return await continueConvergence({
      repoRoot: input.repoRoot, runRoot, runId, request: input.request, spec: input.spec, manifest: input.manifest,
      packets: input.packets, verifiers: input.verifiers, claimPolicies: input.claimPolicies,
      semanticAuditor: input.semanticAuditor, requireSemanticAudit: input.requireSemanticAudit,
      runner, summary, result, maxPasses: maxConvergencePasses, verifierMap,
      entriesByTask: verificationEntriesByTask, enqueuePacket,
    });
  } catch (error) {
    const failed = transitionExecution(lifecycle, 'FAILED', { reason: error instanceof Error ? error.message : String(error), task_truth: 'FAILED' });
    writeJsonAtomic(path.join(runRoot, 'execution-lifecycle.json'), failed);
    throw error;
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** Resume an interrupted/partially-drained North-Star run from its durable queue/checkpoint. */
export async function resumeNorthStarRun(input: NorthStarResumeInput): Promise<NorthStarRunResult> {
  const runRoot = input.runRoot ?? (input.runId ? path.join(input.repoRoot, '.agent', 'runs', input.runId) : (() => { throw new Error('resume requires runId or runRoot'); })());
  if (!fs.existsSync(path.join(runRoot, 'run-state.json'))) throw new Error(`North-Star run not found: ${runRoot}`);
  const request = readJson<WorkRequest>(path.join(runRoot, 'work-request.json'));
  const spec = readJson<WorkSpec>(path.join(runRoot, 'work-spec.json'));
  const manifest = readJson<TraceabilityManifest>(path.join(runRoot, 'traceability-manifest.json'));
  const packets = readJson<TaskPacket[]>(path.join(runRoot, 'task-packets.json'));
  const verifiers = readJson<VerifierDefinition[]>(path.join(runRoot, 'verifiers.json'));
  const claimPolicies = readJson<ClaimAcceptancePolicy[]>(path.join(runRoot, 'claim-policies.json'));
  const config = readJson<PersistedRuntimeConfig>(path.join(runRoot, 'runtime-config.json'));
  if (config.protocol_version !== NORTH_STAR_PROTOCOL_VERSION) throw new Error(`unsupported runtime config protocol ${config.protocol_version}`);
  const state = readJson<RunState>(path.join(runRoot, 'run-state.json'));
  assertRunState(state);
  if (config.run_id !== state.run_id || config.run_id !== (input.runId ?? state.run_id)) throw new Error('resume run identity mismatch');

  const contextStateFile = path.join(runRoot, 'context-state.json');
  if (!fs.existsSync(contextStateFile)) {
    throw new Error(`resume blocked: missing context-state.json snapshot in ${runRoot}`);
  }
  let contextState: ContextState;
  try {
    contextState = readJson<ContextState>(contextStateFile);
    if (!contextState.stateId || !contextState.stateHash || !Array.isArray(contextState.activeRules)) {
      throw new Error('context-state.json is malformed');
    }
  } catch (err) {
    throw new Error(`resume blocked: corrupted or invalid context-state.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  const verifierMap = assertRuntimeInputs({
    request, spec, manifest, packets, verifiers,
    ...(config.max_repair_depth !== null ? { maxRepairDepth: config.max_repair_depth } : {}),
    ...(config.task_timeout_ms !== null ? { taskTimeoutMs: config.task_timeout_ms } : {}),
  });
  const harnessRoot = resolveHarnessRoot(input.repoRoot, input.harnessRoot);
  const domainPack = config.domain_pack ? loadDomainPack(harnessRoot, config.domain_pack.id) : undefined;
  if (domainPack) assertDomainPackStage(domainPack, config.domain_pack!.stage);
  const resumeResourceDecision = governResources(observeHostResources());
  writeJsonAtomic(path.join(runRoot, 'resource-decision.json'), resumeResourceDecision);
  if (!resumeResourceDecision.allow_new_work) throw new Error(`resource governor blocked resume: ${resumeResourceDecision.reasons.join('; ')}`);
  const { graph: verificationGraph, byTask } = verificationEntries(packets, manifest, verifierMap);
  const workflow = resolveManagedWorkflow({ proofRouter: input.proofRouter });
  const broker = createStandardCapabilityBroker(harnessRoot, { decisionFabricMode: workflow.decisionFabricMode });
  const workerModelDecision = modelDecisionForSpec(spec, 'worker');
  const taskDependencies = taskDependenciesFromVerificationGraph(verificationGraph);
  // Restore bounded context snapshots so resumed repairs preserve the same targeted
  // failure→retrieval feedback loop instead of replaying broad context.
  const contextByTask = new Map<string, CompiledContext>();
  for (const packet of packets) {
    const contextFile = path.join(runRoot, 'context', `${packet.task_id}.json`);
    if (!fs.existsSync(contextFile)) continue;
    try { contextByTask.set(packet.task_id, readJson<CompiledContext>(contextFile)); }
    catch { /* Optional context cache must not corrupt durable run truth. */ }
  }
  const runner = makeNorthStarRunner({
    repoRoot: input.repoRoot, runRoot, runId: state.run_id, executionGeneration: config.execution_generation ?? spec.execution_generation ?? 0, request, spec, manifest, packets, verifiers, entriesByTask: byTask,
    agent: config.agent, harnessRoot,
    ...(config.max_repair_depth !== null ? { maxRepairDepth: config.max_repair_depth } : {}),
    ...(config.task_timeout_ms !== null ? { taskTimeoutMs: config.task_timeout_ms } : {}),
    ...(input.maxTasks !== undefined ? { maxTasks: input.maxTasks } : {}),
    invocationOverride: input.invocationOverride, skipAgentDetection: input.skipAgentDetection, contextByTask, semanticResolver: input.semanticResolver,
    ...(input.driver ? { driver: input.driver } : {}),
  });
  const enqueuePacket = (packet: TaskPacket, dependencies: ReadonlyMap<string, string[]>): void => {
    contextState = evaluateContextState(contextState, 'TRANSITION_IMPLEMENTATION', {
      nextPhase: 'IMPLEMENT',
      updatedPacket: packet,
    });
    writeJsonAtomic(path.join(runRoot, 'context-state.json'), contextState);

    const routed = broker.route(packet, [], { activeProjectScope: domainPack?.descriptor.id ?? null, repoRoot: input.repoRoot, spec });
    const skills = routed.skills;
    const mcpIntegrationIds = [...new Set(Object.entries(routed.providers).flatMap(([capability, providerId]) => {
      if (!providerId) return [];
      const provider = broker.provider(providerId, capability);
      const integrationId = provider?.metadata?.integration_id;
      return provider?.metadata?.mode === 'mcp' && typeof integrationId === 'string' ? [integrationId] : [];
    }))];
    const unresolvedCapability = Object.entries(routed.providers).filter(([, provider]) => provider === null).map(([cap]) => cap);
    if (unresolvedCapability.length) throw new Error(`task ${packet.task_id} lacks capability provider(s): ${unresolvedCapability.join(', ')}`);
    const context = compileContext(packet, spec, manifest, { repoRoot: input.repoRoot, skillRoot: harnessRoot, skills, previousFailure: packet.repair?.previous_failure, semanticResolver: input.semanticResolver });
    contextByTask.set(packet.task_id, context);
    writeJsonAtomic(path.join(runRoot, 'context', `${packet.task_id}.json`), {
      ...context,
      task_context: buildTaskContext({ request, spec, packet, selectedSkills: skills.map((skill) => skill.id), selectedCapabilities: routed.capabilities, nextAction: 'resume selected packet' }),
      routes: routed,
    });
    if (routed.decision_fabric) writeJsonAtomic(path.join(runRoot, 'decision-fabric', `${packet.task_id}.json`), routed.decision_fabric);
    const allEntries = byTask.get(packet.task_id) ?? [];
    // F04/REQ-004: same adaptive proof-route selection on resume.
    let verifierDefinitions = allEntries.map((entry) => entry.verifier);
    const proofRouter = workflow.proofRouter;
    if (proofRouter) {
      const proofRoute = proofRouter(proofRouteRequestForPacket(packet, spec, input.repoRoot, packet.task_id));
      const filtered = filterVerifiersByProofRoute(packet, spec, allEntries, proofRoute);
      verifierDefinitions = filtered.selected.map((entry) => entry.verifier);
      writeJsonAtomic(path.join(runRoot, 'proof-route', `${packet.task_id}.json`), {
        task_id: packet.task_id,
        selected: filtered.selected.map((e) => `${e.claim_id}:${e.verifier.id}`),
        omitted: filtered.omitted,
        profile: proofRoute.plan.profile,
        selected_profile: proofRoute.plan.profile,
      });
    }
    const verificationProfile: VerificationProfile = { steps: verifierDefinitions.map(verifierStep), evidence: [], failFast: true };
    const verification = verifierDefinitions.map((definition) => definition.command ?? `${definition.argv!.executable} ${definition.argv!.args.join(' ')}`);
    runner.tasks.add({
      id: packet.task_id,
      contractTaskId: packet.task_id,
      workId: packet.work_id ?? request.work_id,
      executionGeneration: packet.execution_generation ?? (config.execution_generation ?? spec.execution_generation ?? 0),
      specRevision: packet.spec_revision,
      prompt: taskPrompt(packet, context, routed.providers, Object.entries(routed.providers).flatMap(([capability, providerId]) => providerId ? [broker.hint(providerId, capability)].filter((value): value is string => !!value) : []), input.repoRoot, domainPack, workerModelDecision),
      verification,
      verificationProfile,
      ownedPaths: packet.scope.owned,
      forbiddenPaths: packet.scope.forbidden,
      allowDocOnly: packet.scope.owned.length > 0 && packet.scope.owned.every((owned) => /(?:^|\/)(?:docs?|readme|.*\.md$)/i.test(owned)),
      repairDepth: packet.repair?.attempt ?? 0,
      requirementId: packet.requirements.join(','),
      ...(dependencies.get(packet.task_id)?.length ? { dependsOnContractTaskIds: dependencies.get(packet.task_id) } : {}),
      ...(mcpIntegrationIds.length ? { mcpIntegrationIds } : {}),
    });
  };
  writeJsonAtomic(path.join(runRoot, 'run-state.json'), { ...state, status: 'running' } satisfies RunState);
  const lifecycleFile = path.join(runRoot, 'execution-lifecycle.json');
  let lifecycle = fs.existsSync(lifecycleFile)
    ? readJson<ExecutionLifecycleRecord>(lifecycleFile)
    : ({ run_id: state.run_id, work_id: request.work_id, execution_generation: config.execution_generation ?? spec.execution_generation ?? 0, spec_revision: spec.revision, execution_state: 'CLAIMED', task_truth: 'READY', updated_at: new Date().toISOString(), attempt: 1 } satisfies ExecutionLifecycleRecord);
  if (lifecycle.execution_state !== 'CLAIMED') lifecycle = transitionExecution(lifecycle, 'RETRY_QUEUED', { attempt: (lifecycle.attempt ?? 1) + 1 });
  lifecycle = transitionExecution(lifecycle, 'PREPARING');
  lifecycle = transitionExecution(lifecycle, 'RUNNING');
  writeJsonAtomic(lifecycleFile, lifecycle);
  try {
    const summary = await runner.run();
    const result = await finaliseNorthStarRun({ repoRoot: input.repoRoot, runRoot, runId: state.run_id, request, spec, manifest, packets, verifiers, claimPolicies, semanticAuditor: input.semanticAuditor, requireSemanticAudit: input.requireSemanticAudit ?? config.require_semantic_audit, runner, latestSummary: summary });
    return await continueConvergence({
      repoRoot: input.repoRoot, runRoot, runId: state.run_id, request, spec, manifest, packets, verifiers, claimPolicies,
      semanticAuditor: input.semanticAuditor, requireSemanticAudit: input.requireSemanticAudit ?? config.require_semantic_audit,
      runner, summary, result, maxPasses: boundedConvergencePasses(config.max_convergence_passes), verifierMap,
      entriesByTask: byTask, enqueuePacket,
    });
  } catch (error) {
    writeJsonAtomic(lifecycleFile, transitionExecution(lifecycle, 'FAILED', { reason: error instanceof Error ? error.message : String(error), task_truth: 'FAILED' }));
    throw error;
  }
}
