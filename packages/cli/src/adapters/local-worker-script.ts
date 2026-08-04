import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Security: explicit trusted command policy
// Dangerous shell operators that enable injection/chaining - NOT quotes or spaces (needed for args)
// NOTE: `(`/`)` excluded — legit in `node -e`/`npx -p` argument code strings.
// Chaining/substitution ops (`;` `|` `&` `` ` `` `$` `>` `<` `!` ...) still fail-closed.
const SHELL_INJECTION_OPS = /[;&|`${}[\]\\!<>?~#]/;

// Blocked sensitive paths that should never be accessible
const SENSITIVE_PATTERNS = [/^\.env/, /^\.aws/, /^\.ssh/, /^\.git/, /^\.docker/, /^\.credentials/, /^\.kube/, /^\.azure/, /^\.gcloud/];

// Blocked directories for owned paths (no reads allowed)
const BLOCKED_DIRS = ['generated', '.agent'];

// Interpreters that accept eval-like flags — must check ALL of them, not just `node`.
const EVAL_INTERPRETERS = new Set(['node', 'npx', 'tsx', 'ts-node']);
const EVAL_FLAGS = new Set(['-e', '--eval']);

// Commands that are never allowed regardless of arguments
const FORBIDDEN_COMMANDS = new Set([
  'curl', 'wget', 'nc', 'netcat', 'ssh', 'scp', 'sftp',
  'rm', 'del', 'format', 'dd', 'mkfs',
  'bash', 'sh', 'cmd', 'powershell', 'pwsh', 'exec',
  'chmod', 'chown', 'chgrp', 'sudo',
  'cat', 'less', 'more', 'head', 'tail', 'strings',
  'eval', 'source', '.',
  'python', 'python3', 'ruby', 'perl', 'php', 'lua',
  'awk', 'sed', 'grep', 'egrep', 'fgrep',
  'base64', 'xxd', 'hexdump',
  'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'bzip2', 'xz',
  'mount', 'umount', 'fdisk', 'parted',
  'iptables', 'ip', 'ifconfig', 'route', 'netstat',
  'kill', 'killall', 'pkill',
  'docker', 'podman', 'kubectl',
  'git', 'svn', 'hg',
]);

interface DelegationAssignment {
  taskId: string;
  reqIds: string[];
  objective: string;
  ownedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  model: string;
  effort: string;
  root?: string;
}

interface DelegationReceipt {
  taskId: string;
  filesChanged: string[];
  commandsRun: string[];
  exitCodes: number[];
  testsRun: string[];
  evidencePaths: string[];
  diffHashes: Record<string, string>;
  status: 'PASS' | 'PARTIAL' | 'FAIL' | 'BLOCKED';
  retries: number;
  assumptions: string[];
  unresolvedFindings: string[];
}

function fatal(msg: string): never {
  process.stderr.write(`WORKER_ERROR: ${msg}\n`);
  process.exit(1);
}

/**
 * Validates a verification command against the trusted command policy.
 * Returns { valid: true, argv } on success, { valid: false, reason } on failure.
 */
export function validateCommand(cmd: string): { valid: true; argv: string[] } | { valid: false; reason: string } {
  // REJECT: empty or whitespace-only
  if (!cmd.trim()) {
    return { valid: false, reason: 'Empty command' };
  }

  // REJECT: newline/carriage return in command (can bypass validation)
  if (/\r|\n/.test(cmd)) {
    return { valid: false, reason: 'Command contains newline or carriage return' };
  }

  // REJECT: null byte in command (can bypass validation, inject embedded args)
  if (cmd.includes('\0')) {
    return { valid: false, reason: 'Command contains null byte' };
  }

  // REJECT: shell operators indicate injection attempt (chaining, substitution, redirection)
  if (SHELL_INJECTION_OPS.test(cmd)) {
    return { valid: false, reason: `Command contains dangerous shell operators: ${cmd}` };
  }

  // Parse argv (simple split on whitespace, preserving only first token as command)
  const argv = cmd.trim().split(/\s+/);
  const program = argv[0];

  // REJECT: forbidden commands regardless of arguments
  if (FORBIDDEN_COMMANDS.has(program.toLowerCase())) {
    return { valid: false, reason: `Forbidden command: ${program}` };
  }

  // ALLOW: explicit allowlist of trusted verification commands
  const ALLOWED_COMMANDS = new Set([
    'node', 'npm', 'npx',
    'pnpm', 'yarn', 'bun',
    'vitest', 'jest', 'mocha', 'tap', 'ava',
    'ts-node', 'tsx',
    'cargo', 'rustc', 'pytest',
    'go', 'gradle', 'mvn', 'make', 'cmake',
    'clang', 'gcc', 'g++', 'cc',
  ]);
  if (!ALLOWED_COMMANDS.has(program.toLowerCase())) {
    return { valid: false, reason: `Command not in allowlist: ${program}` };
  }

  // REJECT: traversal args in command arguments (path escape attempts)
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const normalized = path.normalize(arg);
    if (normalized.includes('..') || path.isAbsolute(arg)) {
      return { valid: false, reason: `Argument contains path traversal or absolute path: ${arg}` };
    }
  }

  // REJECT: interpreter eval flags (code injection via -e/--eval) for all interpreters
  if (EVAL_INTERPRETERS.has(program.toLowerCase()) && argv.slice(1).some(a => EVAL_FLAGS.has(a))) {
    return { valid: false, reason: `Interpreter eval flag not allowed: ${program} -e/--eval` };
  }

  return { valid: true, argv };
}

function main(): void {
  const assignmentPath = process.argv[2];
  if (!assignmentPath) {
    fatal('Usage: local-worker-script.ts <assignment-json-path>');
  }

  let assignment: DelegationAssignment;
  try {
    const raw = fs.readFileSync(assignmentPath, 'utf-8');
    assignment = JSON.parse(raw) as DelegationAssignment;
  } catch (err) {
    fatal(`Cannot read assignment: ${(err as Error).message}`);
  }

  if (!assignment.taskId) fatal('Missing taskId in assignment');
  if (!assignment.objective) fatal('Missing objective in assignment');
  if (!Array.isArray(assignment.ownedPaths)) fatal('Missing ownedPaths in assignment');

  // F2: resolve root once; realpath is authoritative against symlink escape.
  const lexicalRoot = path.resolve(assignment.root ?? process.cwd());
  let root: string;
  try {
    root = fs.realpathSync(lexicalRoot);
  } catch {
    root = lexicalRoot;
  }

  const filesChanged: string[] = [];
  const commandsRun: string[] = [];
  const testsRun: string[] = [];
  const assumptions: string[] = [];
  const unresolvedFindings: string[] = [];
  const exitCodes: number[] = [];
  const diffHashes: Record<string, string> = {};

  for (const p of assignment.ownedPaths) {
    // Security: validate no null bytes (can bypass checks; JSON-encoded \u0000 also caught)
    if (p.includes('\0') || p.includes('\u0000')) {
      unresolvedFindings.push(`Owned path contains null.byte: ${p}`);
      continue;
    }

    // Security: reject ownedPaths that are in the forbidden list
    if (assignment.forbiddenPaths && assignment.forbiddenPaths.includes(p)) {
      unresolvedFindings.push(`Owned path is forbidden: ${p}`);
      continue;
    }

    // Security: reject sensitive file patterns (.env, .aws, .git, etc.)
    const basename = path.basename(p);
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(basename) || pattern.test(p))) {
      unresolvedFindings.push(`Owned path is sensitive, blocked: ${p}`);
      continue;
    }

    // Security: reject blocked directories (generated, .agent) — platform-independent check
    const normalizedP = p.split(path.sep).join('/');
    if (BLOCKED_DIRS.some(dir => normalizedP === dir || normalizedP.startsWith(dir + '/'))) {
      unresolvedFindings.push(`Owned path is in blocked directory: ${p}`);
      continue;
    }

    // Security: reject explicit parent traversal
    if (p.includes('..')) {
      unresolvedFindings.push(`Owned path contains parent traversal: ${p}`);
      continue;
    }

    // GAP-1: confine ownedPaths to the project root — reject absolute paths
    // outside root and parent traversal (mirrors engine SecureFsRoot policy).
    const abs = path.isAbsolute(p) ? p : path.resolve(root, p);
    let rel: string;
    try {
      rel = path.relative(root, abs);
    } catch {
      // Cross-device on Windows: path.relative throws
      unresolvedFindings.push(`Owned path escapes project root (cross-device): ${p}`);
      continue;
    }

    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      unresolvedFindings.push(`Owned path escapes project root (${root}): ${p}`);
      continue;
    }

    // F2: statSync/readFileSync follow symlinks, so the lexical check is not
    // enough — verify the resolved (realpath) target stays inside the root.
    if (!fs.existsSync(abs)) {
      unresolvedFindings.push(`Owned path does not exist: ${p}`);
      continue;
    }

    let resolvedAbs: string;
    try {
      resolvedAbs = fs.realpathSync(abs);
    } catch {
      unresolvedFindings.push(`Owned path does not exist: ${p}`);
      continue;
    }

    const resolvedRel = path.relative(root, resolvedAbs);
    if (resolvedRel.startsWith('..') || path.isAbsolute(resolvedRel)) {
      unresolvedFindings.push(`Owned path escapes project root (${root}): ${p} (resolves to ${resolvedAbs})`);
      continue;
    }

    // Security: verify resolved path is not in blocked directory either
    const resolvedBasename = path.basename(resolvedAbs);
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(resolvedBasename) || pattern.test(resolvedAbs))) {
      unresolvedFindings.push(`Resolved owned path is sensitive, blocked: ${p}`);
      continue;
    }
    if (BLOCKED_DIRS.some(dir => resolvedAbs.startsWith(dir + path.sep) || resolvedAbs.endsWith(path.sep + dir) || path.basename(resolvedAbs) === dir)) {
      unresolvedFindings.push(`Resolved owned path is in blocked directory: ${p}`);
      continue;
    }

    const fullPath = resolvedAbs;
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // HARDEN: every readable owned file gets a content hash so receipts
        // cannot claim files that were never touched.
        diffHashes[p] = createHash('sha256').update(content).digest('hex');
        // Original semantics: include any readable file (lines.length > 0 is always true)
        const lines = content.split('\n');
        if (lines.length > 0) {
          filesChanged.push(p);
        }
      }
    } catch {
      unresolvedFindings.push(`Could not read owned path: ${p}`);
    }
  }

  const verifyCmds = assignment.verificationCommands ?? [];
  for (const cmd of verifyCmds) {
    // Security: validate command against trusted policy before execution.
    // Fail-closed: a policy violation aborts the worker (exit 1, WORKER_ERROR),
    // never degrades to a FAIL receipt.
    const validation = validateCommand(cmd);
    if (!validation.valid) {
      fatal(`Command rejected by security policy: ${validation.reason} – "${cmd}"`);
    }

    commandsRun.push(cmd);
    let exitCode = 1;
    try {
      // Safe: execFileSync with validated argv — no shell interpretation,
      // shell metacharacters stay literal arguments to the program.
      execFileSync(validation.argv[0], validation.argv.slice(1), { stdio: 'pipe', timeout: 30_000, cwd: root });
      exitCode = 0;
      testsRun.push(cmd);
    } catch (err) {
      exitCode = (err as Error & { status?: number }).status ?? 1;
      unresolvedFindings.push(`Verification command failed: ${cmd} – exit ${exitCode}`);
    } finally {
      exitCodes.push(exitCode);
    }
  }

  let status: DelegationReceipt['status'] = 'PASS';
  if (unresolvedFindings.length > 0 && filesChanged.length === 0) {
    status = 'FAIL';
  } else if (unresolvedFindings.length > 0) {
    status = 'PARTIAL';
  }

  const receipt: DelegationReceipt = {
    taskId: assignment.taskId,
    filesChanged,
    commandsRun,
    exitCodes,
    testsRun,
    evidencePaths: filesChanged,
    diffHashes,
    status,
    retries: 0,
    assumptions,
    unresolvedFindings,
  };

  process.stdout.write(JSON.stringify(receipt));
  process.exit(0);
}

// Only execute main() when this file is run directly as a script
// (not when imported as a module by tests or other code).
const isMainModule = (() => {
  try {
    const modulePath = fileURLToPath(import.meta.url);
    return process.argv[1] === modulePath || process.argv[2] === modulePath;
  } catch {
    return false;
  }
})();
if (isMainModule) {
  main();
}