import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentKind, AgentInvocation } from '../runner/headless-executor.js';
import { loadDomainPack, resolveHarnessRoot, summarizeDomainBehavior, assertDomainPackStage, type LoadedDomainPack } from './domain-packs.js';
import { compilePlannerContract, type CompiledPlannerContract, type PlannerContract } from './planner.js';
import type { WorkRequest } from './protocol.js';
import { extractRequirementLedger, freezeRequirementLedger, type RequirementLedger } from './requirement-ledger.js';
import { evaluateCandidatePlan, buildReplanPrompt, type PlanEvaluationResult } from './plan-evaluator.js';
import { deliverReferenceInputs, bindReferencesToPrompt, type NativeReferenceDeliveryReceipt } from './reference-input.js';
import { normalizeNativePlanArtifact } from './plan-normalizer.js';

export interface PlannerSnapshotFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PlannerSnapshot {
  root: string;
  files: PlannerSnapshotFile[];
  omitted: string[];
  sha256: string;
}

export interface PlannerInvocation extends AgentInvocation {
  env?: Record<string, string>;
}

export interface PlannerDomainReference {
  pack_id: string;
  relative_root: string;
  tree_sha256: string;
  files: number;
  bytes: number;
}

export interface StrongPlannerOptions {
  repoRoot: string;
  request: WorkRequest;
  planner: AgentKind;
  domainPackId?: string | null;
  timeoutMs?: number;
  logDir?: string;
  keepSnapshot?: boolean;
  maxReplanAttempts?: number;
  availableSkills?: string[];
  invocationOverride?: (prompt: string, snapshotRoot: string) => PlannerInvocation;
}

export interface StrongPlannerReceipt {
  protocol_version: '2.0';
  work_id: string;
  planner: AgentKind;
  snapshot_sha256: string;
  snapshot_files: number;
  snapshot_bytes: number;
  prompt_sha256: string;
  executable: string;
  exit_code: number;
  timed_out: boolean;
  stdout_sha256: string;
  stderr_sha256: string;
  domain_reference?: PlannerDomainReference;
  requirement_ledger?: RequirementLedger;
  reference_delivery?: NativeReferenceDeliveryReceipt;
  plan_evaluation?: PlanEvaluationResult;
  attempts?: number;
  status: 'PASS' | 'BLOCKED';
  reason?: string;
}

export interface StrongPlannerResult {
  contract: PlannerContract;
  compiled: CompiledPlannerContract;
  receipt: StrongPlannerReceipt;
  stdoutPath: string;
  stderrPath: string;
}

const OMIT_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', '.turbo', '.cache',
  '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle', 'target', 'out',
]);
const OMIT_FILE_NAMES = new Set([
  '.env', '.env.local', '.env.development', '.env.production', '.npmrc', '.pypirc',
  'id_rsa', 'id_ed25519', 'credentials.json', 'secrets.json',
]);
const SECRET_NAME = /(^|[._-])(secret|secrets|credential|credentials|token|tokens|apikey|api-key|private-key|private_key)([._-]|$)/i;
const BINARYISH = /\.(?:zip|rar|7z|tar|gz|bz2|xz|png|jpe?g|gif|webp|ico|pdf|mp4|mov|avi|mp3|wav|woff2?|ttf|otf|exe|dll|so|dylib|class|jar|wasm)$/i;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 384 * 1024 * 1024;
const MAX_SNAPSHOT_FILES = 40_000;

function sha(bytes: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function normalizedRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function shouldOmit(relative: string, stat: fs.Stats): string | null {
  const parts = relative.split('/');
  if (parts.some((part) => OMIT_DIRS.has(part))) return 'generated/dependency directory';
  const base = parts.at(-1) ?? relative;
  if (OMIT_FILE_NAMES.has(base) || /^\.env\./.test(base) || SECRET_NAME.test(base)) return 'secret-like filename';
  if (relative.startsWith('.agent/runs/') || relative.startsWith('.agent/planner/') || relative.startsWith('.agent/requests/')) return 'runtime artifact';
  if (stat.isSymbolicLink()) return 'symlink omitted from planner snapshot';
  if (stat.isFile() && stat.size > MAX_FILE_BYTES) return 'file exceeds planner snapshot per-file limit';
  if (stat.isFile() && BINARYISH.test(base)) return 'binary/archive asset';
  return null;
}

/**
 * Build a bounded disposable source snapshot for the planner. The original
 * workspace is never the planner's cwd. Secret-looking files, dependencies,
 * generated outputs, symlinks, large files, and binary assets are excluded.
 */
export function materializePlannerSnapshot(repoRoot: string): PlannerSnapshot {
  const sourceRoot = path.resolve(repoRoot);
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-planner-'));
  const files: PlannerSnapshotFile[] = [];
  const omitted: string[] = [];
  let totalBytes = 0;

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relative = normalizedRelative(sourceRoot, fullPath);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }
      const reason = shouldOmit(relative, stat);
      if (reason) {
        omitted.push(`${relative}: ${reason}`);
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!stat.isFile()) continue;
      if (files.length >= MAX_SNAPSHOT_FILES) {
        omitted.push(`${relative}: max snapshot file limit reached`);
        continue;
      }
      if (totalBytes + stat.size > MAX_SNAPSHOT_BYTES) {
        omitted.push(`${relative}: max snapshot byte budget exceeded`);
        continue;
      }
      const destination = path.join(targetRoot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const content = fs.readFileSync(fullPath);
      fs.writeFileSync(destination, content);
      const fileSha = sha(content);
      files.push({ path: relative, bytes: stat.size, sha256: fileSha });
      totalBytes += stat.size;
    }
  }

  walk(sourceRoot);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const treeDigest = sha(files.map((f) => `${f.path}:${f.sha256}`).join('\n'));
  return { root: targetRoot, files, omitted, sha256: treeDigest };
}

/**
 * Mirror a verified domain reference into the disposable planner workspace.
 * This is intentionally NOT copied into the user's project: the mirror lives
 * only inside the planner snapshot and is removed with that snapshot.
 */
export function materializePlannerDomainReference(
  snapshotRoot: string,
  pack: LoadedDomainPack
): PlannerDomainReference {
  if (!pack.sourceManifest || !pack.sourceRoot) {
    throw new Error(`domain pack ${pack.descriptor.id} has no validated source snapshot`);
  }
  const relativeRoot = path.posix.join('.agent-reference', pack.descriptor.id);
  const destinationRoot = path.join(snapshotRoot, ...relativeRoot.split('/'));
  fs.mkdirSync(destinationRoot, { recursive: true, mode: 0o700 });
  let totalBytes = 0;
  const entries = Array.isArray(pack.sourceManifest.files)
    ? pack.sourceManifest.files
    : Object.entries(pack.sourceManifest.files).map(([entryPath, entry]: [string, any]) => ({ path: entryPath, sha256: entry.sha256, bytes: entry.bytes }));
  for (const manifestEntry of entries) {
    const source = path.join(pack.sourceRoot, ...manifestEntry.path.split('/'));
    const destination = path.join(destinationRoot, ...manifestEntry.path.split('/'));
    const bytes = fs.readFileSync(source);
    if (sha(bytes) !== manifestEntry.sha256) {
      throw new Error(`domain reference file corrupted: ${manifestEntry.path}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.writeFileSync(destination, bytes, { mode: 0o600 });
    totalBytes += bytes.length;
  }
  if (totalBytes !== pack.sourceManifest.uncompressed_bytes) throw new Error('domain reference byte count drift while materializing');
  return {
    pack_id: pack.descriptor.id,
    relative_root: relativeRoot,
    tree_sha256: pack.sourceManifest.tree_sha256,
    files: entries.length,
    bytes: totalBytes,
  };
}

function contractShape(): string {
  return `{
  "protocol_version":"2.0",
  "raw_intent":<EXACT raw intent string>,
  "risk_class":"S0|S1|S2|S3",
  "known":["..."], "assumed":["..."], "unresolved":[], "requires_user":[],
  "impact":{"owning_modules":["..."],"dependency_breadth":"...","public_api":[],"schema_data":[],"security_boundaries":[],"reference_dependencies":[],"relevant_tests":[],"active_decisions":[]},
  "requirements":[{"id":"R-001","statement":"...","mandatory":true,"claims":[{"claim_id":"C-001a","statement":"...","class":"mechanical|runtime|semantic","required_kinds":["test"]}]}],
  "tasks":[{"goal":"...","requirement_ids":["R-001"],"claim_ids":["C-001a"],"owned":["path"],"forbidden":["path"],"entrypoints":[],"symbols":[],"references":[],"decisions":[],"constraints":[],"skills":[],"capabilities":[],"stop_if":[],"verifiers_by_claim":{"C-001a":["V-001"]}}],
  "verifiers":[{"id":"V-001","kind":"static|test|integration|api|browser|visual|mobile|security|scope|semantic|other","argv":{"executable":"node","args":["..."]}}],
  "decisions":[], "claim_policies":[]
}`;
}

export function buildStrongPlannerPrompt(input: {
  request: WorkRequest;
  snapshot: PlannerSnapshot;
  ledger?: RequirementLedger;
  domainSummary?: string;
  domainPackId?: string | null;
  domainReference?: PlannerDomainReference;
}): string {
  const risk = input.request.risk_hint ?? 'S1';
  const ledger = input.ledger ?? extractRequirementLedger(input.request.raw_intent);
  const ledgerLines = ledger.items.map((item) => `- [${item.id}] [${item.obligation}/${item.priority}] [Domain:${item.affected_domain.toUpperCase()}] [Status:${item.epistemic_status}] ${item.text}`);

  return [
    '# Agent Rules strong-planner compiler',
    'You are a READ-ONLY planner. Inspect this disposable source snapshot deeply. Do not edit files, install dependencies, commit, or execute destructive commands.',
    'Your only authority is to return one machine-readable planner contract. The harness validates it and the implementation worker receives the validated contract, not your reasoning.',
    `Raw intent (MUST be copied byte-for-byte into raw_intent): ${JSON.stringify(input.request.raw_intent)}`,
    `Deterministic risk floor: ${risk}. You may raise risk but never lower it.`,
    `Snapshot digest: ${input.snapshot.sha256}; source files: ${input.snapshot.files.length}.`,
    input.domainPackId ? `Explicit domain pack: ${input.domainPackId}. It was selected by the project/user, never inferred from prompt keywords.` : '',
    input.domainReference ? `Verified domain reference mirror: ${input.domainReference.relative_root}/ (tree sha256 ${input.domainReference.tree_sha256}; ${input.domainReference.files} files). This directory is REFERENCE-ONLY and is not part of the target project. Inspect it for authoritative patterns/business behavior, then adapt to the actual target source. Never copy/vendor the template wholesale.` : '',
    input.domainSummary ? `Source-grounded domain constraints (pointers identify authoritative source anchors):\n${input.domainSummary}` : '',
    'Extracted Requirement & Obligation Ledger (from raw intent):',
    ...ledgerLines,
    'MANDATORY: Every MUST-obligation requirement from the ledger must be covered by explicit requirements and tasks in your candidate contract.',
    'Investigate before planning. Distinguish known facts, assumptions, unresolved facts, and decisions that truly require the user. Do not hide ambiguity inside prose.',
    'Impact must cover owning modules, dependency breadth, public API, schema/data, security boundaries, reference dependencies, relevant tests, and active decisions.',
    'Every mandatory claim must map to executable fresh verification. For S2/S3 each mandatory claim needs at least two independent evidence kinds/channels unless an explicit claim policy safely requires more. Prefer cheap deterministic gates before browser/deep gates.',
    'Verifier safety: use structured argv only; cwd must be workspace-relative; no shell interpreters, destructive file commands, node -e, python -c, or mutating git subcommands. Do not weaken existing tests/verification.',
    'Task scopes must be explicit and bounded. Preserve existing behavior unless the raw intent explicitly changes it. Never invent domain behavior when source is unclear: put it in unresolved/requires_user instead.',
    'Return JSON ONLY: no markdown fence, commentary, preamble, or trailing text. Exact schema shape:',
    contractShape(),
  ].filter(Boolean).join('\n\n');
}

export function buildStrongPlannerInvocation(kind: AgentKind, prompt: string): PlannerInvocation {
  switch (kind) {
    case 'claude':
      return { executable: 'claude', args: ['-p', prompt, '--output-format', 'text', '--permission-mode', 'plan', '--max-turns', '12'] };
    case 'codex':
      return { executable: 'codex', args: ['exec', '--sandbox', 'read-only', prompt] };
    case 'opencode':
      return {
        executable: 'opencode',
        args: ['run', '--agent', 'plan', prompt],
        env: {
          OPENCODE_DISABLE_AUTOUPDATE: '1',
          OPENCODE_CONFIG_CONTENT: JSON.stringify({
            $schema: 'https://opencode.ai/config.v2.json',
            permissions: [
              { action: 'skill', resource: '*', effect: 'allow' },
              { action: 'subagent', resource: '*', effect: 'allow' },
              { action: 'shell', resource: '*', effect: 'deny' },
              { action: 'edit', resource: '*', effect: 'deny' },
            ],
            mcp: { servers: {} },
          }),
        },
      };
    case 'antigravity':
      return { executable: 'agy', args: ['-p', prompt] };
    case 'cursor':
      return { executable: 'cursor-agent', args: ['-p', prompt] };
    case 'deepseek-harness':
      return { executable: 'dsh', args: ['--profile', 'headless', prompt] };
    case 'command-code':
      return { executable: process.platform === 'win32' ? 'cmdc' : 'cmd', args: ['-p', '--plan', prompt] };
    case 'grok':
      return { executable: 'grok', args: ['-p', prompt] };
    default:
      return { executable: 'claude', args: ['-p', prompt, '--permission-mode', 'plan'] };
  }
}

export function parsePlannerStdout(stdout: string): unknown {
  let text = stdout.trim();
  if (!text) throw new Error('strong planner returned empty stdout');
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('strong planner stdout contains no JSON object');
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  }
}

function runChild(invocation: PlannerInvocation, cwd: string, timeoutMs: number, stdoutPath: string, stderrPath: string): Promise<{ exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    if (process.env.VITEST && invocation.executable !== process.execPath) {
      resolve({ exitCode: -1, timedOut: false });
      return;
    }
    const stdoutFd = fs.openSync(stdoutPath, 'w', 0o600);
    const stderrFd = fs.openSync(stderrPath, 'w', 0o600);
    let settled = false;
    let timedOut = false;
    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
      resolve({ exitCode, timedOut });
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(invocation.executable, invocation.args, {
        cwd,
        stdio: ['ignore', stdoutFd, stderrFd],
        env: { ...process.env, ...(invocation.env ?? {}), AGENT_RULES_HEADLESS: '1', AGENT_RULES_ROLE: 'planner' },
        windowsHide: true,
      });
    } catch {
      finish(-1);
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGTERM'); } catch { /* gone */ }
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } }, 3_000).unref();
      finish(124);
    }, timeoutMs);
    timer.unref();
    proc.on('error', () => { clearTimeout(timer); finish(-1); });
    proc.on('close', (code) => { clearTimeout(timer); finish(code ?? -1); });
  });
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * Run one fresh strong-planner process against a disposable project snapshot,
 * validate its output, independently evaluate requirement coverage against the pre-frozen ledger,
 * automatically replan if mandatory items are missing, and persist a hash-based receipt.
 */
export async function runStrongPlanner(options: StrongPlannerOptions): Promise<StrongPlannerResult> {
  const snapshot = materializePlannerSnapshot(options.repoRoot);
  const logDir = options.logDir ?? path.join(options.repoRoot, '.agent', 'planner');
  fs.mkdirSync(logDir, { recursive: true });
  const stdoutPath = path.join(logDir, `${options.request.work_id}.stdout.log`);
  const stderrPath = path.join(logDir, `${options.request.work_id}.stderr.log`);
  const receiptPath = path.join(logDir, `${options.request.work_id}.receipt.json`);
  let domainSummary = '';
  let domainReference: PlannerDomainReference | undefined;
  try {
    if (options.domainPackId) {
      const pack = loadDomainPack(resolveHarnessRoot(options.repoRoot), options.domainPackId);
      assertDomainPackStage(pack, 'planning');
      domainSummary = summarizeDomainBehavior(pack);
      if (pack.sourceVerified && pack.sourceRoot && pack.sourceManifest) {
        domainReference = materializePlannerDomainReference(snapshot.root, pack);
      }
    }

    const referenceReceipt = await deliverReferenceInputs(options.request, options.planner, snapshot.root);
    const ledger = freezeRequirementLedger(extractRequirementLedger(options.request.raw_intent));
    let basePrompt = buildStrongPlannerPrompt({ request: options.request, snapshot, ledger, domainSummary, domainPackId: options.domainPackId, domainReference });
    let currentPrompt = bindReferencesToPrompt(basePrompt, referenceReceipt);
    const maxAttempts = options.maxReplanAttempts ?? 2;
    let attempt = 0;
    let finalContract: PlannerContract | undefined;
    let finalCompiled: CompiledPlannerContract | undefined;
    let finalEvaluation: PlanEvaluationResult | undefined;
    let lastStdout = '';
    let lastStderr = '';
    let lastExitCode = 0;
    let lastTimedOut = false;
    let lastExecutable = '';

    while (attempt < maxAttempts) {
      attempt++;
      const invocation = options.invocationOverride
        ? options.invocationOverride(currentPrompt, snapshot.root)
        : buildStrongPlannerInvocation(options.planner, currentPrompt);
      lastExecutable = invocation.executable;
      const result = await runChild(invocation, snapshot.root, options.timeoutMs ?? 10 * 60 * 1000, stdoutPath, stderrPath);
      lastStdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : '';
      lastStderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : '';
      lastExitCode = result.exitCode;
      lastTimedOut = result.timedOut;

      const baseReceipt = {
        protocol_version: '2.0' as const,
        work_id: options.request.work_id,
        planner: options.planner,
        snapshot_sha256: snapshot.sha256,
        snapshot_files: snapshot.files.length,
        snapshot_bytes: snapshot.files.reduce((sum, entry) => sum + entry.bytes, 0),
        prompt_sha256: sha(currentPrompt),
        executable: invocation.executable,
        exit_code: result.exitCode,
        timed_out: result.timedOut,
        stdout_sha256: sha(lastStdout),
        stderr_sha256: sha(lastStderr),
        ...(domainReference ? { domain_reference: domainReference } : {}),
        requirement_ledger: ledger,
        reference_delivery: referenceReceipt,
        attempts: attempt,
      };

      if (result.exitCode !== 0 || result.timedOut) {
        const receipt: StrongPlannerReceipt = { ...baseReceipt, status: 'BLOCKED', reason: result.timedOut ? 'planner timed out' : `planner process exited ${result.exitCode}` };
        writeJsonAtomic(receiptPath, receipt);
        throw new Error(`strong planner BLOCKED: ${receipt.reason}; stderr=${stderrPath}`);
      }

      let candidateContract: PlannerContract;
      try {
        const parsed = parsePlannerStdout(lastStdout);
        candidateContract = parsed as PlannerContract;
      } catch {
        candidateContract = normalizeNativePlanArtifact(
          {
            host: options.planner,
            raw_text: lastStdout,
            format: 'markdown',
            captured_at: new Date().toISOString(),
          },
          ledger,
          options.request
        );
      }

      let compiled: CompiledPlannerContract;
      try {
        compiled = compilePlannerContract(options.request, candidateContract);
      } catch (error) {
        const receipt: StrongPlannerReceipt = { ...baseReceipt, status: 'BLOCKED', reason: `planner contract rejected: ${error instanceof Error ? error.message : String(error)}` };
        writeJsonAtomic(receiptPath, receipt);
        throw new Error(`strong planner BLOCKED: ${receipt.reason}`);
      }

      const evaluation = evaluateCandidatePlan({
        request: options.request,
        ledger,
        contract: candidateContract,
        availableSkills: options.availableSkills,
      });

      finalEvaluation = evaluation;

      if (evaluation.verdict === 'PASS') {
        finalContract = candidateContract;
        finalCompiled = compiled;
        break;
      }

      if (attempt < maxAttempts) {
        currentPrompt = buildReplanPrompt({
          request: options.request,
          ledger,
          evaluation,
          attempt: attempt + 1,
        });
        continue;
      }

      const failureReason = evaluation.findings.map((f) => `[${f.code}] ${f.message}`).join('; ');
      const receipt: StrongPlannerReceipt = {
        ...baseReceipt,
        plan_evaluation: evaluation,
        status: 'BLOCKED',
        reason: `candidate plan rejected by evaluation after ${attempt} attempt(s): ${failureReason}`,
      };
      writeJsonAtomic(receiptPath, receipt);
      throw new Error(`strong planner BLOCKED: ${receipt.reason}`);
    }

    if (!finalContract || !finalCompiled) {
      throw new Error('strong planner failed to produce a valid evaluated contract');
    }

    const receipt: StrongPlannerReceipt = {
      protocol_version: '2.0',
      work_id: options.request.work_id,
      planner: options.planner,
      snapshot_sha256: snapshot.sha256,
      snapshot_files: snapshot.files.length,
      snapshot_bytes: snapshot.files.reduce((sum, entry) => sum + entry.bytes, 0),
      prompt_sha256: sha(currentPrompt),
      executable: lastExecutable,
      exit_code: lastExitCode,
      timed_out: lastTimedOut,
      stdout_sha256: sha(lastStdout),
      stderr_sha256: sha(lastStderr),
      ...(domainReference ? { domain_reference: domainReference } : {}),
      requirement_ledger: ledger,
      reference_delivery: referenceReceipt,
      plan_evaluation: finalEvaluation,
      attempts: attempt,
      status: 'PASS',
    };
    writeJsonAtomic(receiptPath, receipt);
    writeJsonAtomic(path.join(logDir, `${options.request.work_id}.contract.json`), finalContract);
    return { contract: finalContract, compiled: finalCompiled, receipt, stdoutPath, stderrPath };
  } finally {
    if (!options.keepSnapshot) fs.rmSync(snapshot.root, { recursive: true, force: true });
  }
}
