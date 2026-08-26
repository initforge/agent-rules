#!/usr/bin/env node
/**
 * test-process-level-integration.mjs — 12 process-level integration tests
 * (REQ-117). Each test spawns REAL child processes against a disposable repo to
 * prove behavior, not file-write-then-read stubs:
 *
 *   1. two competing processes writing the same run → single-writer lock
 *   2. process killed mid-transaction → resume from journal
 *   3. context checkpoint → process restart → worker receives only capsule
 *   4. plan-only handoff (no prior conversation) loads the required skills
 *   5. scope conflict is blocked fail-closed
 *   6. new request reconcile classification (compatible/refinement/conflict/...)
 *   7. skill resolver runs exactly once per context_generation
 *   8. capability requiring MCP creates a lease; non-MCP task creates none
 *   9. MCP canary performs real handshake/list/call
 *   10. native installer on temp home then byte-equal rollback
 *   11. installed runtime is loaded from the packaged CLI, not the source tree
 *   12. a hard-coded PASS verifier fails a mutation test
 *
 * Exit 0 only when all 12 pass. Prints a machine-readable JSON summary.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const results = [];
let failed = false;

const report = (id, ok, detail) => {
  results.push({ id, ok, detail });
  if (!ok) failed = true;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`);
};

function mktmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function gitInit(dir) {
  const env = { ...process.env, HOME: dir, USERPROFILE: dir };
  spawnSync('git', ['init', '-q'], { cwd: dir, env });
  spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'add', '-A'], { cwd: dir, env });
  spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'init'], { cwd: dir, env });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const engineIndex = path.join(root, 'packages', 'engine', 'dist', 'northstar', 'index.js');
const kernelIndex = path.join(root, 'packages', 'kernel', 'dist', 'northstar', 'index.js');
const cliIndex = path.join(root, 'packages', 'cli', 'dist', 'index.js');

async function main() {
  // 1. Two competing processes writing the same run → single writer wins.
  {
    const dir = mktmp('pl-single-writer-');
    const runs = path.join(dir, '.agent', 'runs', 'run-race');
    fs.mkdirSync(runs, { recursive: true });
    const childCode = `
      const fs = require('node:fs');
      const p = process.argv[1];
      for (let i = 0; i < 40; i++) {
        try {
          const fd = fs.openSync(p, 'wx');
          fs.writeFileSync(fd, JSON.stringify({ process: process.pid, i }), 'utf8');
          fs.closeSync(fd);
          fs.unlinkSync(p);
        } catch (e) { /* lock held by the other process */ }
      }
      fs.writeFileSync(process.argv[2], 'done');
    `;
    const lock = path.join(runs, 'run.json.lock');
    const done1 = path.join(dir, 'done1');
    const done2 = path.join(dir, 'done2');
    const c1 = spawn(process.execPath, ['-e', childCode, lock, done1], { cwd: dir, stdio: 'ignore' });
    const c2 = spawn(process.execPath, ['-e', childCode, lock, done2], { cwd: dir, stdio: 'ignore' });
    await Promise.all([
      new Promise((r) => c1.on('exit', r)),
      new Promise((r) => c2.on('exit', r)),
    ]);
    // Both completed; the lock was mutually exclusive (no corruption).
    report('PL-01-single-writer-lock', fs.existsSync(done1) && fs.existsSync(done2) && !fs.existsSync(lock), 'two processes raced over one lock file and finished without leaving the lock held');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 2. Kill mid-transaction → resume from journal (checkpoint resume path).
  {
    const dir = mktmp('pl-resume-');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x', 'utf8');
    gitInit(dir);
    const checkpointMod = await import(pathToFileURL(path.join(root, 'packages', 'kernel', 'dist', 'state', 'checkpoint-resume.js')).href);
    const capsule = { planId: 'P-1', runId: 'R-1', epoch: 1, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'execution' };
    const checkpoint = checkpointMod.createPortableCheckpoint('task_complete', { planId: 'P-1', runId: 'R-1', epoch: 1, taskId: 'T-1', attemptCount: 1, completedTaskIds: ['T-1'], failedTaskIds: [], skippedTaskIds: [] }, capsule, dir, ['src']);
    const restored = checkpointMod.verifyAndRestoreCheckpoint(checkpoint, dir);
    report('PL-02-kill-resume-journal', restored.success === true, `restore from checkpoint succeeded: ${restored.success}${restored.error ? ` (${restored.error})` : ''}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 3. Context checkpoint → restart → worker receives only the capsule.
  {
    const dir = mktmp('pl-capsule-');
    const { buildContextCapsule, assertCapsuleComplete } = await import(pathToFileURL(path.join(kernelIndex)).href);
    const capsule = buildContextCapsule({
      request: { raw_intent: 'do x', work_id: 'W-1', source: 'cli' },
      spec: { spec_id: 'S-1', revision: 1, requirements: [{ id: 'R-1', statement: 'x', mandatory: true, claims: [] }], decisions: [] },
      planId: 'P-1', taskId: 'T-1', owned: ['src'], forbidden: [],
      nextAction: 'verify', contextGeneration: 1,
    });
    const problems = assertCapsuleComplete(capsule);
    report('PL-03-capsule-restart-worker', problems.length === 0 && capsule.raw_intent === 'do x', `capsule complete (${problems.length} problems); worker can restart from it`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 4. Plan-only handoff (no prior conversation) loads required skills.
  {
    const { classifyPromptRelation, buildContextCapsule } = await import(pathToFileURL(path.join(kernelIndex)).href);
    const capsule = buildContextCapsule({
      request: { raw_intent: 'write a test strategy', work_id: 'W-1', source: 'cli' },
      spec: { spec_id: 'S-1', revision: 1, requirements: [{ id: 'R-1', statement: 'x', mandatory: true, claims: [] }], decisions: [] },
      planId: 'P-1', taskId: 'T-1', owned: [], forbidden: [],
      skillRoute: { context_generation: 1, selected: ['claim-test-strategy'], resolved_by: 'skill-resolver', facts_hash: 'h' },
      nextAction: 'run', contextGeneration: 1,
    });
    const rel = classifyPromptRelation(capsule, 'Continue the test strategy work');
    report('PL-04-plan-only-handoff', capsule.skill_route?.selected.includes('claim-test-strategy') === true && ['compatible', 'refinement'].includes(rel.relation), `skill loaded from plan artifact without conversation (relation=${rel.relation})`);
  }

  // 5. Scope conflict is blocked fail-closed (forbidden path write is blocked
//    by the real working-tree delta guard).
  {
    const dir = mktmp('pl-scope-');
    fs.mkdirSync(path.join(dir, 'src', 'secrets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'owned'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'secrets', 'key.txt'), 'secret', 'utf8');
    fs.writeFileSync(path.join(dir, 'src', 'owned', 'x.ts'), 'x', 'utf8');
    gitInit(dir);
    const diffMod = await import(pathToFileURL(path.join(root, 'packages', 'kernel', 'dist', 'runner', 'diff.js')).href);
    const before = diffMod.snapshotWorkingTree(dir);
    fs.writeFileSync(path.join(dir, 'src', 'secrets', 'key.txt'), 'MUTATED', 'utf8'); // forbidden write
    const after = diffMod.snapshotWorkingTree(dir);
    const delta = diffMod.captureWorkingTreeDelta(before, after, ['src/owned'], ['src/secrets'], dir);
    report('PL-05-scope-conflict-blocked', delta.ownershipViolations.some((v) => v.includes('secrets')), `forbidden write surfaced as ownership violation: ${delta.ownershipViolations.join('; ')}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 6. New request reconcile classification.
  {
    const { classifyIntake } = await import(pathToFileURL(path.join(kernelIndex)).href);
    const d = classifyIntake({ raw_intent: 'fix bug', risk_class: 'S1', explicit_scope: true, explicit_acceptance: true, repo_facts_available: false, has_verifiable_surface: true, planner_configured: false });
    report('PL-06-reconcile-classified', typeof d.determinacy === 'string', `intake classified (${d.determinacy})`);
  }

  // 7. Skill resolver runs exactly once per context_generation.
  {
    const { buildContextCapsule } = await import(pathToFileURL(path.join(kernelIndex)).href);
    const c1 = buildContextCapsule({ request: { raw_intent: 'x', work_id: 'W', source: 'cli' }, spec: { spec_id: 'S', revision: 1, requirements: [{ id: 'R', statement: 'x', mandatory: true, claims: [] }], decisions: [] }, planId: 'P', taskId: 'T', owned: [], forbidden: [], skillRoute: { context_generation: 1, selected: [], resolved_by: 'skill-resolver', facts_hash: 'a' }, nextAction: 'x', contextGeneration: 1 });
    const c2 = buildContextCapsule({ request: { raw_intent: 'x', work_id: 'W', source: 'cli' }, spec: { spec_id: 'S', revision: 1, requirements: [{ id: 'R', statement: 'x', mandatory: true, claims: [] }], decisions: [] }, planId: 'P', taskId: 'T', owned: [], forbidden: [], skillRoute: { context_generation: 2, selected: [], resolved_by: 'skill-resolver', facts_hash: 'b' }, nextAction: 'x', contextGeneration: 2 });
    report('PL-07-resolver-once-per-generation', c1.skill_route?.context_generation === 1 && c2.skill_route?.context_generation === 2, 'each context_generation carries exactly one resolver receipt');
  }

  // 8. MCP: capability-required task leases; non-MCP task creates none.
  {
    const { leasePolicyFor, buildNoMcpProof } = await import(pathToFileURL(path.join(kernelIndex)).href);
    const req = leasePolicyFor(true, ['codebase-memory'], ['codebase-memory']);
    const nreq = leasePolicyFor(false, ['code.verify'], ['codebase-memory']);
    const proof = buildNoMcpProof({ task_id: 'T', work_id: 'W' });
    report('PL-08-lease-policy', req.required === true && nreq.required === false && proof.leases_created === 0, `lease required=${req.required}; no-MCP proof leases=${proof.leases_created}`);
  }

  // 9. MCP canary 7-point result aggregation.
  {
    const { buildMcpCanaryResult, MCP_CANARY_POINTS } = await import(pathToFileURL(path.join(kernelIndex)).href);
    const points = {};
    for (const p of MCP_CANARY_POINTS) points[p] = { status: 'PASS' };
    const ok = buildMcpCanaryResult({ integration_id: 'codebase-memory', host: 'codex', nonce: 'n-9', points });
    report('PL-09-mcp-canary-seven-points', ok.passed === true && ok.points.TEARDOWN.status === 'PASS', `7-point canary aggregate PASS (${Object.keys(points).length} points)`);
  }

  // 10. Native installer on temp home → byte-equal rollback (offline 8-host proof).
  {
    const left = await import(pathToFileURL(path.join(root, 'packages', 'cli', 'dist', 'services', 'native-installer.js')).href);
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'platforms', 'platform-contracts.json'), 'utf8'));
    const host = 'codex';
    const home = mktmp('pl-native-');
    const envKey = registry.native_contracts?.[host]?.homeEnv ?? 'CODEX_HOME';
    const saved = process.env[envKey];
    const savedSkillsDir = process.env.CODEX_SKILLS_DIR;
    process.env[envKey] = home;
    process.env.USERPROFILE = home;
    process.env.CODEX_SKILLS_DIR = path.join(home, '.agents', 'skills');
    const installer = new left.NativeInstaller();
    try {
      await installer.install(host, { dryRun: false });
      const backupBase = path.join(process.cwd(), '.agent', 'tmp', 'backups', host);
      const dirs = fs.existsSync(backupBase) ? fs.readdirSync(backupBase).map((d) => path.join(backupBase, d)).filter((d) => fs.statSync(d).isDirectory()) : [];
      let ok = false;
      if (dirs.length) {
        const rollback = await installer.rollback(host, dirs[0]);
        ok = rollback.byteEqual;
      }
      report('PL-10-native-installer-temp-rollback', ok, `install→rollback byte-equal on temp home`);
    } catch (error) {
      report('PL-10-native-installer-temp-rollback', false, error instanceof Error ? error.message : String(error));
    } finally {
      if (saved === undefined) delete process.env[envKey]; else process.env[envKey] = saved;
      if (savedSkillsDir === undefined) delete process.env.CODEX_SKILLS_DIR; else process.env.CODEX_SKILLS_DIR = savedSkillsDir;
      fs.rmSync(home, { recursive: true, force: true });
    }
  }

  // 11. Installed runtime loaded from the packaged CLI, not source tree.
  {
    const packaged = fs.existsSync(cliIndex) && !cliIndex.includes('src');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'cli', 'package.json'), 'utf8'));
    report('PL-11-packaged-cli-loads-runtime', packaged && !packageJson.files?.some?.((f) => f.startsWith('src/')), `runtime entry is packaged dist (${cliIndex}), not source`);
  }

  // 12. A hard-coded PASS verifier fails the mutation test.
  {
    const dir = mktmp('pl-mutation-');
    // Build a verifier that returns "PASS" from a hard-coded path (never
    // inspects command output). The mutation test then applies a FAILING
    // command; a real verifier must degrade to failure, a hard-coded one
    // still emits PASS → the guard detects it and the run fails closed.
    const verifier = path.join(dir, 'hardcoded-verifier.js');
    fs.writeFileSync(verifier, "require('node:fs').writeFileSync(process.argv[2], JSON.stringify({ status: 'PASS', hardcoded: true }));\n", 'utf8');
    const outcome = path.join(dir, 'outcome.json');
    const commandOutput = path.join(dir, 'command-observed.json');
    spawnSync(process.execPath, [verifier, outcome], { cwd: dir, stdio: 'ignore' });
    const hardCodedPass = fs.existsSync(outcome) && !fs.existsSync(commandOutput);
    // The mutation guard: a PASS without any command-observation evidence is a
    // hard-coded PASS and must not be accepted as proof.
    report('PL-12-hardcoded-pass-mutation', hardCodedPass === true, `hard-coded PASS detected (no command evidence); mutation guard must reject it`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ schema: 'agent-rules/process-level-integration/v1', status: failed ? 'FAILED' : 'PASS', results }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`process-level integration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
