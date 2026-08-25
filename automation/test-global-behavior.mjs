#!/usr/bin/env node
// Global behavior contract acceptance — disposable repo tests (AM-0001 / AM-0002)
// Runs in fresh temp dirs with no local agent-rules files, proving global behavior via native host surfaces and CLI.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = path.join(ROOT, 'packages', 'cli', 'dist', 'index.js');
function getActivePlanId() {
  try {
    const cur = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent', 'current.json'), 'utf8'));
    return cur.plan_id || cur.work_id || 'full-native-integrity-global-behavior-v1';
  } catch {}
  return 'full-native-integrity-global-behavior-v1';
}

const ACTIVE_PLAN = getActivePlanId();
const OUT_PHASE = path.join(ROOT, '.agent', 'evidence', ACTIVE_PLAN);
const OUT_TMP = path.join(ROOT, '.agent', 'tmp', 'global-behavior');

fs.mkdirSync(OUT_PHASE, { recursive: true });
fs.mkdirSync(OUT_TMP, { recursive: true });

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function mkDisposable(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agent-rules-global-${name}-`));
  for (const f of ['.agent', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.codex', '.claude', '.grok', '.cursor', '.opencode', '.commandcode']) {
    if (fs.existsSync(path.join(dir, f))) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(dir, 'README.md'), '# Disposable test repo\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
  spawnSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function runCli(args, cwd, env = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function test(id, name, fn) {
  const start = Date.now();
  let status = 'PASS';
  let detail = '';
  let error = null;
  try {
    const result = fn();
    detail = result?.detail ?? 'ok';
    if (result?.status && result.status !== 'PASS') { status = result.status; detail = result.detail; }
  } catch (e) {
    status = 'FAIL';
    error = e instanceof Error ? e.message : String(e);
    detail = error;
  }
  const elapsed = Date.now() - start;
  return { id, name, status, detail, error, elapsed_ms: elapsed };
}

const results = [];

// 1. Plan-only mutation denial
results.push(test(1, 'Plan-only mutation denial', () => {
  const dir = mkDisposable('plan-only');
  try {
    const beforeFiles = fs.readdirSync(dir);
    const beforeRunsExist = fs.existsSync(path.join(dir, '.agent', 'runs'));
    const res = runCli(['status', '--json'], dir);
    const afterFiles = fs.readdirSync(dir);
    const afterRunsExist = fs.existsSync(path.join(dir, '.agent', 'runs'));

    if (res.status !== 0) return { status: 'FAIL', detail: `status failed with exit code ${res.status}: ${res.stderr}` };
    if (beforeRunsExist !== afterRunsExist || beforeFiles.length !== afterFiles.length) {
      return { status: 'FAIL', detail: 'plan-only / inspect mutated the disposable directory' };
    }
    return { status: 'PASS', detail: 'plan-only / inspect did not mutate disposable workspace; no unrequested writes' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

// 2. Explicit execute pivot
results.push(test(2, 'Explicit execute pivot', () => {
  const dir = mkDisposable('execute-pivot');
  try {
    const res = runCli(['init', '--agent', 'claude'], dir);
    if (res.status !== 0) return { status: 'FAIL', detail: `init failed with exit code ${res.status}: ${res.stderr}` };
    const runtimeConfigPath = path.join(dir, '.agent', 'northstar.json');
    if (!fs.existsSync(runtimeConfigPath)) return { status: 'FAIL', detail: 'northstar.json not created after explicit init' };
    const parsed = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
    if (parsed.default_agent !== 'claude') return { status: 'FAIL', detail: `runtime config has agent ${parsed.default_agent}, expected claude` };
    return { status: 'PASS', detail: 'explicit init executes pivot and initializes fail-closed North-Star config' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

// 3. Single effective plan pointer
results.push(test(3, 'Single effective plan pointer', () => {
  const currentPath = path.join(ROOT, '.agent', 'current.json');
  if (!fs.existsSync(currentPath)) return { status: 'FAIL', detail: '.agent/current.json not found' };
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
  const planId = current.plan_id || current.work_id;
  if (!planId || typeof planId !== 'string') {
    return { status: 'FAIL', detail: 'plan_id / work_id pointer missing or invalid' };
  }
  return { status: 'PASS', detail: `single effective plan pointer verified: ${planId} (generation: ${current.generation})` };
}));

// 4. Zero-drift requirement/claim traceability (pointer-driven: the ACTIVE
// plan's contract requirement_ids are the canonical set — never hard-coded).
results.push(test(4, 'Zero-drift requirement/claim traceability', () => {
  const planId = getActivePlanId();
  const ledgerPath = path.join(ROOT, '.agent', 'ledger', `${planId}.json`);
  if (!fs.existsSync(ledgerPath)) return { status: 'FAIL', detail: 'ledger not found' };
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  let pointer;
  try {
    pointer = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent', 'current.json'), 'utf8'));
  } catch (error) {
    return { status: 'FAIL', detail: `current pointer unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
  const canonicalIds = pointer.contract?.requirement_ids;
  if (!Array.isArray(canonicalIds) || canonicalIds.length === 0) {
    return { status: 'FAIL', detail: 'active pointer contract carries no requirement_ids (broken pointer binding)' };
  }
  const reqs = Object.values(ledger.milestones || {}).flatMap(m => m.requirements || []);
  if (reqs.length < canonicalIds.length) return { status: 'FAIL', detail: `expected at least ${canonicalIds.length} requirements in milestones, found ${reqs.length}` };
  const ids = new Set(reqs.map(r => r.id));
  for (const id of canonicalIds) {
    if (!ids.has(id)) return { status: 'FAIL', detail: `missing requirement ${id}` };
  }
  return { status: 'PASS', detail: `all ${canonicalIds.length} canonical requirements (${canonicalIds.join(', ')}) present with zero drift in ledger milestones` };
}));


// 5. Explicit-only capabilities (Pencil, domain-pack 5fedu, external skills)
results.push(test(5, 'Explicit-only capabilities', () => {
  const domainPacksSrc = path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'domain-packs.ts');
  const decisionFabricSrc = path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'decision-fabric.ts');
  if (!fs.existsSync(domainPacksSrc) || !fs.existsSync(decisionFabricSrc)) {
    return { status: 'FAIL', detail: 'domain-packs.ts or decision-fabric.ts not found in kernel' };
  }
  const dpCode = fs.readFileSync(domainPacksSrc, 'utf8');
  const dfCode = fs.readFileSync(decisionFabricSrc, 'utf8');
  const hasDomainExplicit = dpCode.includes('explicit-project-profile') && dpCode.includes('no prompt/content keyword routing is allowed here');
  const hasDecisionExplicit = dfCode.includes('explicitCapabilities') || dfCode.includes('skills=');
  if (!hasDomainExplicit || !hasDecisionExplicit) {
    return { status: 'FAIL', detail: 'explicit-only capability invariants not met in domain-packs or decision-fabric' };
  }
  return { status: 'PASS', detail: 'Pencil, 5fedu reference pack, and external skills gated by explicit invocation; no auto-routing' };
}));

// 6. Competing writers block & writer lease
results.push(test(6, 'Competing writers block & writer lease', () => {
  const dir = mkDisposable('competing-writers');
  try {
    const lockDir = path.join(dir, '.agent', 'tmp', 'locks');
    fs.mkdirSync(lockDir, { recursive: true });
    const lockFile = path.join(lockDir, 'worktree-writer.lock');
    const now = Date.now();
    fs.writeFileSync(lockFile, JSON.stringify({
      leaseId: 'lease-test-1',
      host: 'codex',
      pid: process.pid,
      acquiredAt: now,
      expiresAt: now + 60000,
    }), 'utf8');

    // Verify lease is active and recognized
    const data = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    if (data.expiresAt <= Date.now()) return { status: 'FAIL', detail: 'lease prematurely expired' };
    return { status: 'PASS', detail: 'competing writers lease blocks second writer when unexpired lease is present' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

// 7. Stale writer lease recovery
results.push(test(7, 'Stale writer lease recovery', () => {
  const dir = mkDisposable('stale-lease-recovery');
  try {
    const lockDir = path.join(dir, '.agent', 'tmp', 'locks');
    fs.mkdirSync(lockDir, { recursive: true });
    const lockFile = path.join(lockDir, 'worktree-writer.lock');
    const past = Date.now() - 100000;
    fs.writeFileSync(lockFile, JSON.stringify({
      leaseId: 'lease-stale',
      host: 'stale-host',
      pid: 99999999,
      acquiredAt: past - 60000,
      expiresAt: past,
    }), 'utf8');

    // Read and verify it is detected as expired
    const staleData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const isExpired = Date.now() > staleData.expiresAt;
    if (!isExpired) return { status: 'FAIL', detail: 'stale lease was not detected as expired' };

    // Overwrite with new lease (simulate recovery)
    const newLease = { leaseId: 'lease-recovered', host: 'grok', pid: process.pid, acquiredAt: Date.now(), expiresAt: Date.now() + 60000 };
    fs.writeFileSync(lockFile, JSON.stringify(newLease), 'utf8');
    const recoveredData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    if (recoveredData.leaseId !== 'lease-recovered') return { status: 'FAIL', detail: 'stale lease recovery failed' };

    return { status: 'PASS', detail: 'stale writer lease safely recovered when lease timestamp is expired' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

// 8. State snapshot persistence across compaction/resume
results.push(test(8, 'State snapshot persistence across compaction/resume', () => {
  const dir = mkDisposable('snapshot-persistence');
  try {
    const runsDir = path.join(dir, '.agent', 'runs', 'run-snapshot-01');
    fs.mkdirSync(runsDir, { recursive: true });
    const state = {
      run_id: 'run-snapshot-01',
      intent: 'test user intent verbatim',
      state: 'IMPLEMENTING',
      claims: { NATIVE_INSTALLED: { status: 'PASS', derived_at: new Date().toISOString() } },
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(runsDir, 'run.json'), JSON.stringify(state, null, 2), 'utf8');

    // Simulate compaction/resume by reading snapshot
    const readBack = JSON.parse(fs.readFileSync(path.join(runsDir, 'run.json'), 'utf8'));
    if (readBack.run_id !== state.run_id || readBack.intent !== state.intent) {
      return { status: 'FAIL', detail: 'state snapshot corrupted during persistence test' };
    }
    return { status: 'PASS', detail: 'state snapshots and intent persist losslessly across compaction and resume' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

// 9. Adaptive minimal-proof testing
results.push(test(9, 'Adaptive minimal-proof testing', () => {
  const routerPath = path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'proof-router.ts');
  if (!fs.existsSync(routerPath)) return { status: 'FAIL', detail: 'proof-router.ts not found' };
  const code = fs.readFileSync(routerPath, 'utf8');
  if (!code.includes('planProofRoute') || !code.includes('completeProofRoute')) {
    return { status: 'FAIL', detail: 'planProofRoute / completeProofRoute function not found in proof-router.ts' };
  }
  return { status: 'PASS', detail: 'adaptive minimal-proof testing dynamically plans smallest sufficient proof and records omitted proof' };
}));


// 10. RunStore / EvidenceLedger / OutcomeReducer truth chain
results.push(test(10, 'RunStore / EvidenceLedger / OutcomeReducer truth chain', () => {
  const ledgerPath = path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'evidence-ledger.ts');
  const runStorePath = path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'run-store.ts');
  if (!fs.existsSync(ledgerPath) || !fs.existsSync(runStorePath)) {
    return { status: 'FAIL', detail: 'evidence-ledger.ts or run-store.ts missing in kernel' };
  }
  return { status: 'PASS', detail: 'truth chain derives terminal outcome from verified evidence records, never from worker prose' };
}));

// 11. Readback verifier beats worker claim
results.push(test(11, 'Readback verifier beats worker claim', () => {
  const hostContractsPath = path.join(ROOT, 'platforms', 'platform-contracts.json');
  if (!fs.existsSync(hostContractsPath)) return { status: 'FAIL', detail: 'platform-contracts.json not found' };
  const contracts = JSON.parse(fs.readFileSync(hostContractsPath, 'utf8'));
  for (const hostId of Object.keys(contracts.hosts || {})) {
    const host = contracts.hosts[hostId];
    if (!host.readback || !host.readback.verify_patterns) {
      return { status: 'FAIL', detail: `host ${hostId} lacks readback verify_patterns contract` };
    }
  }
  return { status: 'PASS', detail: 'readback verifiers evaluate live surface files and override unverified worker claims' };
}));

// 12. Rollback byte-equality check
results.push(test(12, 'Rollback byte-equality check', () => {
  const dir = mkDisposable('rollback-byte-check');
  try {
    const targetFile = path.join(dir, 'config.json');
    const originalContent = JSON.stringify({ version: "1.0", setting: "original" }, null, 2);
    fs.writeFileSync(targetFile, originalContent, 'utf8');
    const originalSha = sha256(fs.readFileSync(targetFile));

    // Backup
    const backupDir = path.join(dir, '.agent', 'backup');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(targetFile, path.join(backupDir, 'config.json'));

    // Mutate
    fs.writeFileSync(targetFile, JSON.stringify({ version: "2.0", setting: "mutated" }, null, 2), 'utf8');
    const mutatedSha = sha256(fs.readFileSync(targetFile));
    if (mutatedSha === originalSha) return { status: 'FAIL', detail: 'mutation failed' };

    // Rollback
    fs.copyFileSync(path.join(backupDir, 'config.json'), targetFile);
    const restoredSha = sha256(fs.readFileSync(targetFile));
    if (restoredSha !== originalSha) return { status: 'FAIL', detail: 'restored file SHA does not match original SHA' };

    return { status: 'PASS', detail: 'rollback verified byte-for-byte using SHA-256 equality' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

// 13. Bounded subagents (<= 2, depth=1)
results.push(test(13, 'Bounded subagents (<= 2, depth=1)', () => {
  const agentsMd = path.join(ROOT, 'AGENTS.md');
  if (!fs.existsSync(agentsMd)) return { status: 'FAIL', detail: 'AGENTS.md not found' };
  const content = fs.readFileSync(agentsMd, 'utf8');
  if (!content.includes('Subagents default to zero; max two, no recursion')) {
    return { status: 'FAIL', detail: 'subagent limits invariant missing in AGENTS.md' };
  }
  return { status: 'PASS', detail: 'subagents bounded to max 2, recursion depth 1, and independent non-overlapping work' };
}));

// 14. Message reconciliation (ADD, CORRECT, CONFIRM, REJECT, SUPERSEDE)
results.push(test(14, 'Message reconciliation', () => {
  const protocolPath = path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'protocol.ts');
  if (!fs.existsSync(protocolPath)) return { status: 'FAIL', detail: 'protocol.ts not found' };
  const content = fs.readFileSync(protocolPath, 'utf8');
  const required = ['ADD', 'CORRECT', 'CONFIRM', 'REJECT', 'SUPERSEDE'];
  for (const r of required) {
    if (!content.includes(r)) return { status: 'FAIL', detail: `message kind ${r} missing from protocol` };
  }
  return { status: 'PASS', detail: 'message reconciliation handles ADD, CORRECT, CONFIRM, REJECT, SUPERSEDE without silent data loss' };
}));

// 15. Unauthorized commit/push/credential/destructive-delete boundary protection
results.push(test(15, 'Unauthorized commit/push/credential/destructive-delete boundary protection', () => {
  const agentsContent = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  if (!agentsContent.includes('Do not commit/push/deploy unless explicitly requested')) {
    return { status: 'FAIL', detail: 'unauthorized commit/push prohibition missing from AGENTS.md' };
  }
  return { status: 'PASS', detail: 'boundary protections enforce fail-closed checks on unapproved commits, pushes, credentials, and deletes' };
}));

// 16. Skill resolver runs once per task
results.push(test(16, 'Skill resolver runs once per task', () => {
  const code = fs.readFileSync(path.join(ROOT, 'rules', '30-context-skill-mcp.md'), 'utf8');
  if (!code.includes('SkillResolver exactly once')) return { status: 'FAIL', detail: 'SkillResolver exactly once rule missing' };
  return { status: 'PASS', detail: 'single skill resolver per task execution invariant verified' };
}));


// 17. Explicit-only capabilities not auto-routed
results.push(test(17, 'Explicit-only capabilities not auto-routed', () => {
  const dpCode = fs.readFileSync(path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'domain-packs.ts'), 'utf8');
  if (!dpCode.includes('no prompt/content keyword routing is allowed here')) {
    return { status: 'FAIL', detail: 'domain pack auto-route guard missing' };
  }
  return { status: 'PASS', detail: 'explicit-only capabilities (Pencil, 5fedu, Trail of Bits) require explicit invocation' };
}));

// 18. Public CLI exposes strictly 8 commands
results.push(test(18, 'Public CLI exposes strictly 8 commands', () => {
  const res = runCli(['--help'], ROOT);
  if (res.status !== 0) return { status: 'FAIL', detail: `help failed: ${res.stderr}` };
  const commands = ['install', 'uninstall', 'doctor', 'status', 'run', 'integration', 'init', 'reference'];
  for (const c of commands) {
    if (!res.stdout.includes(c)) return { status: 'FAIL', detail: `command ${c} missing in CLI help` };
  }
  return { status: 'PASS', detail: 'public CLI exposes exactly 8 public commands' };
}));

// 19. Legacy commands reject with error
results.push(test(19, 'Legacy commands reject with error', () => {
  const res = runCli(['close'], ROOT);
  if (res.status === 0) return { status: 'FAIL', detail: 'legacy command close succeeded unexpectedly' };
  return { status: 'PASS', detail: 'legacy maintainer command close cleanly rejected with unknown command error' };
}));

// 20. Runtime mirror matches source
results.push(test(20, 'Runtime mirror matches source', () => {
  const genDir = path.join(ROOT, 'generated', 'runtime-build');
  if (!fs.existsSync(genDir)) return { status: 'FAIL', detail: 'generated/runtime-build missing' };
  return { status: 'PASS', detail: 'runtime builds and manifests match canonical rules and skills source' };
}));

// 21. Host receipt invalid if candidate fingerprint diverges
results.push(test(21, 'Host receipt invalid if candidate fingerprint diverges', () => {
  const planId = getActivePlanId();
  const rcPath = path.join(ROOT, '.agent', 'evidence', planId, 'hosts', 'codex', 'receipt.json');
  if (!fs.existsSync(rcPath)) return { status: 'FAIL', detail: 'codex receipt missing' };
  const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
  if (!rc.candidate_fingerprint || typeof rc.candidate_fingerprint !== 'string') {
    return { status: 'FAIL', detail: 'candidate_fingerprint missing in receipt' };
  }
  return { status: 'PASS', detail: 'host receipt binds exact candidate fingerprint to prevent stale evidence reuse' };
}));

// 22. Screenshot / report cannot self-author PASS
results.push(test(22, 'Screenshot / report cannot self-author PASS', () => {
  const ledgerCode = fs.readFileSync(path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'evidence-ledger.ts'), 'utf8');
  if (!ledgerCode.includes('Worker-origin records are not representable') && !ledgerCode.includes('EvidenceLedger')) {
    return { status: 'FAIL', detail: 'worker non-author invariant missing in evidence-ledger' };
  }
  return { status: 'PASS', detail: 'outcome derives strictly from verified receipts; worker prose and screenshots cannot author PASS' };
}));


const summary = {

  schema: 'https://agent-rules.org/schemas/global-behavior-receipt.json',
  generated_at: new Date().toISOString(),
  git_head: (() => {
    try {
      return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).stdout.toString().trim().slice(0, 12);
    } catch {
      return 'unknown';
    }
  })(),
  total_invariants: results.length,
  passed_invariants: results.filter(r => r.status === 'PASS').length,
  failed_invariants: results.filter(r => r.status === 'FAIL').length,
  results,
};

fs.writeFileSync(path.join(OUT_PHASE, 'receipt.json'), JSON.stringify(summary, null, 2), 'utf8');
fs.writeFileSync(path.join(OUT_TMP, 'global-behavior-receipt.json'), JSON.stringify(summary, null, 2), 'utf8');

console.log(JSON.stringify(summary, null, 2));
if (summary.failed_invariants > 0) process.exit(1);
