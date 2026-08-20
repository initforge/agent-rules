import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentKind, AgentInvocation } from '../runner/headless-executor.js';
import { loadDomainPack, resolveHarnessRoot, summarizeDomainBehavior, assertDomainPackStage, type LoadedDomainPack } from './domain-packs.js';
import { compilePlannerContract, type CompiledPlannerContract, type PlannerContract } from './planner.js';
import type { WorkRequest } from './protocol.js';

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
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) throw new Error(`planner source workspace does not exist: ${sourceRoot}`);
  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-planner-'));
  const files: PlannerSnapshotFile[] = [];
  const omitted: string[] = [];
  let totalBytes = 0;

  const walk = (sourceDir: string, destinationDir: string): void => {
    fs.mkdirSync(destinationDir, { recursive: true, mode: 0o700 });
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const source = path.join(sourceDir, entry.name);
      const relative = normalizedRelative(sourceRoot, source);
      const stat = fs.lstatSync(source);
      const omit = shouldOmit(relative, stat);
      if (omit) {
        // Avoid a huge omission list for dependency trees: record only the directory root.
        if (!relative.includes('/node_modules/') && !relative.includes('/.git/')) omitted.push(`${relative}: ${omit}`);
        continue;
      }
      const destination = path.join(destinationDir, entry.name);
      if (stat.isDirectory()) {
        walk(source, destination);
        continue;
      }
      if (!stat.isFile()) {
        omitted.push(`${relative}: non-regular file`);
        continue;
      }
      if (files.length >= MAX_SNAPSHOT_FILES) throw new Error(`planner snapshot exceeds ${MAX_SNAPSHOT_FILES} source files`);
      if (totalBytes + stat.size > MAX_SNAPSHOT_BYTES) throw new Error(`planner snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`);
      const bytes = fs.readFileSync(source);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.writeFileSync(destination, bytes, { mode: stat.mode & 0o777 });
      const digest = sha(bytes);
      files.push({ path: relative, bytes: bytes.length, sha256: digest });
      totalBytes += bytes.length;
    }
  };

  try {
    walk(sourceRoot, snapshotRoot);
    files.sort((a, b) => a.path.localeCompare(b.path));
    const digest = sha(files.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join(''));
    fs.writeFileSync(path.join(snapshotRoot, '.agent-rules-planner-snapshot.json'), `${JSON.stringify({ version: 1, sha256: digest, files, omitted }, null, 2)}\n`, { mode: 0o600 });
    return { root: snapshotRoot, files, omitted, sha256: digest };
  } catch (error) {
    fs.rmSync(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Mirror a verified domain reference into the disposable planner workspace.
 * This is intentionally NOT copied into the user's project: the mirror lives
 * only inside the planner snapshot and is removed with that snapshot.
 */
export function materializePlannerDomainReference(snapshotRoot: string, pack: LoadedDomainPack): PlannerDomainReference {
  if (!pack.sourceVerified || !pack.sourceRoot || !pack.sourceManifest) {
    throw new Error(`domain pack ${pack.descriptor.id} has no verified bundled reference source`);
  }
  const relativeRoot = `.agent-reference/${pack.descriptor.id}`;
  const destinationRoot = path.resolve(snapshotRoot, relativeRoot);
  const snapshotBoundary = path.resolve(snapshotRoot) + path.sep;
  if (!destinationRoot.startsWith(snapshotBoundary)) throw new Error('domain reference destination escapes planner snapshot');
  fs.mkdirSync(destinationRoot, { recursive: true, mode: 0o700 });

  let totalBytes = 0;
  for (const entry of pack.sourceManifest.files) {
    const source = path.resolve(pack.sourceRoot, entry.path);
    const sourceBoundary = path.resolve(pack.sourceRoot) + path.sep;
    if (!source.startsWith(sourceBoundary)) throw new Error(`domain reference source path escapes source root: ${entry.path}`);
    const destination = path.resolve(destinationRoot, entry.path);
    const destinationBoundary = destinationRoot + path.sep;
    if (!destination.startsWith(destinationBoundary)) throw new Error(`domain reference path escapes planner mirror: ${entry.path}`);
    const bytes = fs.readFileSync(source);
    const digest = sha(bytes);
    if (digest !== entry.sha256 || bytes.length !== entry.bytes) {
      throw new Error(`domain reference integrity drift while materializing: ${entry.path}`);
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
    files: pack.sourceManifest.file_count,
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

export function buildStrongPlannerPrompt(input: { request: WorkRequest; snapshot: PlannerSnapshot; domainSummary?: string; domainPackId?: string | null; domainReference?: PlannerDomainReference }): string {
  const risk = input.request.risk_hint ?? 'S1';
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
      // The disposable snapshot is the hard boundary. Codex read-only sandbox is an
      // additional host-level guard, not the sole safety mechanism.
      return { executable: 'codex', args: ['exec', '--sandbox', 'read-only', prompt] };
    case 'opencode':
      return {
        executable: 'opencode', args: ['run', prompt], env: {
          OPENCODE_DISABLE_AUTOUPDATE: '1',
          OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { '*': 'deny', read: 'allow', glob: 'allow', grep: 'allow', list: 'allow', lsp: 'allow', webfetch: 'deny', websearch: 'deny', edit: 'deny', bash: 'deny', task: 'deny', external_directory: 'deny' } }),
        },
      };
    case 'mimocode':
      // MiMoCode documents a read-only plan agent, but its headless selector is not
      // treated as stable here. We therefore rely on deny rules plus the disposable
      // snapshot, and never use --dangerously-skip-permissions for planning.
      return {
        executable: 'mimo', args: ['run', prompt], env: {
          OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { '*': 'deny', read: 'allow', glob: 'allow', grep: 'allow', list: 'allow', lsp: 'allow', edit: 'deny', bash: 'deny', task: 'deny', external_directory: 'deny' } }),
        },
      };
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
 * validate its JSON as an untrusted data contract, and persist a hash-based
 * receipt. A planner failure is BLOCKED; it never falls back to execution.
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
    const prompt = buildStrongPlannerPrompt({ request: options.request, snapshot, domainSummary, domainPackId: options.domainPackId, domainReference });
    const invocation = options.invocationOverride
      ? options.invocationOverride(prompt, snapshot.root)
      : buildStrongPlannerInvocation(options.planner, prompt);
    const result = await runChild(invocation, snapshot.root, options.timeoutMs ?? 10 * 60 * 1000, stdoutPath, stderrPath);
    const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : '';
    const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : '';
    const baseReceipt = {
      protocol_version: '2.0' as const,
      work_id: options.request.work_id,
      planner: options.planner,
      snapshot_sha256: snapshot.sha256,
      snapshot_files: snapshot.files.length,
      snapshot_bytes: snapshot.files.reduce((sum, entry) => sum + entry.bytes, 0),
      prompt_sha256: sha(prompt),
      executable: invocation.executable,
      exit_code: result.exitCode,
      timed_out: result.timedOut,
      stdout_sha256: sha(stdout),
      stderr_sha256: sha(stderr),
      ...(domainReference ? { domain_reference: domainReference } : {}),
    };
    if (result.exitCode !== 0 || result.timedOut) {
      const receipt: StrongPlannerReceipt = { ...baseReceipt, status: 'BLOCKED', reason: result.timedOut ? 'planner timed out' : `planner process exited ${result.exitCode}` };
      writeJsonAtomic(receiptPath, receipt);
      throw new Error(`strong planner BLOCKED: ${receipt.reason}; stderr=${stderrPath}`);
    }
    let raw: unknown;
    try {
      raw = parsePlannerStdout(stdout);
    } catch (error) {
      const receipt: StrongPlannerReceipt = { ...baseReceipt, status: 'BLOCKED', reason: `planner output is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
      writeJsonAtomic(receiptPath, receipt);
      throw new Error(`strong planner BLOCKED: ${receipt.reason}`);
    }
    let compiled: CompiledPlannerContract;
    try {
      compiled = compilePlannerContract(options.request, raw);
    } catch (error) {
      const receipt: StrongPlannerReceipt = { ...baseReceipt, status: 'BLOCKED', reason: `planner contract rejected: ${error instanceof Error ? error.message : String(error)}` };
      writeJsonAtomic(receiptPath, receipt);
      throw new Error(`strong planner BLOCKED: ${receipt.reason}`);
    }
    const receipt: StrongPlannerReceipt = { ...baseReceipt, status: 'PASS' };
    writeJsonAtomic(receiptPath, receipt);
    writeJsonAtomic(path.join(logDir, `${options.request.work_id}.contract.json`), raw);
    return { contract: raw as PlannerContract, compiled, receipt, stdoutPath, stderrPath };
  } finally {
    if (!options.keepSnapshot) fs.rmSync(snapshot.root, { recursive: true, force: true });
  }
}
