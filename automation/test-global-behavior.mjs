#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-behavior-'));
const results = [];

async function check(name, run) {
  const started = Date.now();
  try {
    await run();
    results.push({ name, status: 'PASS', duration_ms: Date.now() - started });
  } catch (error) {
    results.push({ name, status: 'FAIL', duration_ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
  }
}

try {
  const kernel = await import(pathToFileURL(path.join(root, 'packages/kernel/dist/northstar/index.js')).href);
  const proof = await import(pathToFileURL(path.join(root, 'packages/kernel/dist/northstar/proof-router.js')).href);
  const materiality = await import(pathToFileURL(path.join(root, 'packages/kernel/dist/harness/review/materiality.js')).href);

  await check('canonical rules support explicit portable handoff without worker/ticket theater', () => {
    const execution = fs.readFileSync(path.join(root, 'rules/10-execution-planning-delegation.md'), 'utf8');
    const outcome = fs.readFileSync(path.join(root, 'rules/20-proof-outcome.md'), 'utf8');
    const planSkill = fs.readFileSync(path.join(root, 'skills/plan-and-handoff/SKILL.md'), 'utf8');
    const verificationSkill = fs.readFileSync(path.join(root, 'skills/verification-router/SKILL.md'), 'utf8');
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const profileAgents = fs.readFileSync(path.join(root, 'profiles/5fedu/projects/AGENTS.md'), 'utf8');
    assert.match(execution, /accepted outcome, scope, contracts, preservation and acceptance/i);
    assert.match(execution, /dependency-ready slice/i);
    assert.match(execution, /constraint-complete/i);
    assert.match(execution, /Model changes are handoffs/i);
    assert.match(execution, /CREATE, MODIFY, REPLACE, RETIRE, MIGRATE or PRESERVE/i);
    assert.match(execution, /preservation of public behavior, data\/contracts, consumers, operational capability and user-visible states/i);
    assert.match(execution, /blocker affects only its dependency closure/i);
    assert.match(execution, /Pending unblocked acceptance is PARTIAL/i);
    assert.match(execution, /never selects a model/i);
    assert.match(execution, /Subagents default to zero/i);
    assert.match(planSkill, /Constraint-complete plan contract/i);
    assert.match(planSkill, /Autonomy envelope/i);
    assert.match(planSkill, /Five contracts/i);
    assert.match(planSkill, /OWNER_DECISION/i);
    assert.match(planSkill, /SOURCE_DISCOVERABLE/i);
    assert.match(planSkill, /IMPLEMENTATION_LOCAL/i);
    assert.match(planSkill, /EXTERNAL_BLOCKER/i);
    assert.match(planSkill, /choose files and[\s\S]*symbols/i);
    assert.match(planSkill, /internal design/i);
    assert.match(planSkill, /necessary local refactors/i);
    assert.match(planSkill, /equivalent command/i);
    assert.match(planSkill, /Source identity/i);
    assert.match(planSkill, /Domain closure/i);
    assert.match(planSkill, /Reference closure/i);
    assert.match(planSkill, /Slice delta/i);
    assert.match(planSkill, /return `NEEDS_USER`/i);
    assert.match(verificationSkill, /focused execution aid/i);
    assert.match(verificationSkill, /Change-kind proof/i);
    assert.match(verificationSkill, /active import, route, consumer or runtime/i);
    assert.match(outcome, /Model prose never creates PASS/i);
    assert.match(planSkill, /Explore → Distill → Commit/i);
    assert.match(planSkill, /Active frontier and context quarantine/i);
    assert.doesNotMatch(execution, /one focused recheck/i);
    assert.doesNotMatch(planSkill, /exact proof command/i);
    assert.doesNotMatch(verificationSkill, /machine-readable verification plan/i);
    assert.doesNotMatch(verificationSkill, /Human residual packet/i);
    assert.doesNotMatch(verificationSkill, /mandatory independent verifier/i);
    // Retired aliases are gone (no duplicate authority, no wrapper reachability).
    for (const retired of ['finish-to-completion', 'ui-taste', 'frontend-composition', 'database-stack', 'mobile-composition', 'infra-devops-composition', 'browser-qa', 'master-image-generation', 'qa-skills', 'quality']) {
      assert.equal(fs.existsSync(path.join(root, 'skills', retired, 'SKILL.md')), false, `${retired} must be retired (no alias retained)`);
    }
    assert.doesNotMatch(agents, /owns planning and implementation end to end/i);
    assert.doesNotMatch(readme, /Let that same model implement the plan/i);
    assert.match(readme, /focused repair loop/i);
    assert.doesNotMatch(readme, /bounded recheck/i);
    assert.doesNotMatch(profileAgents, /PAF|plan-artifact-template|capability-tier-routing|tier routing/i);
    assert.doesNotMatch(agents, /UNAUTHORIZED_WORKER_PASS|strong planners compile/i);
    for (const entry of fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skill = path.join(root, 'skills', entry.name, 'SKILL.md');
      if (!fs.existsSync(skill)) continue;
      assert.doesNotMatch(fs.readFileSync(skill, 'utf8'), /source:\s*ROUTE\.json migrated/i, skill);
      assert.equal(fs.existsSync(path.join(root, 'skills', entry.name, 'ROUTE.json')), false, `${entry.name} must not retain a global ROUTE.json`);
    }
    const graph = JSON.parse(fs.readFileSync(path.join(root, 'generated', 'context-graph.json'), 'utf8'));
    for (const node of graph.nodes.filter((node) => node.layer === 'skills' && !node.source.startsWith('profiles/'))) assert.equal(node.routing_source, 'registry/skills.yaml', `${node.id} governance must come from registry/skills.yaml`);
    for (const retired of ['anthropic-frontend-design', 'callstack-react-native-best-practices', 'expo-skills', 'hashicorp-agent-skills', 'prisma-skills', 'supabase-agent-skills', 'trail-of-bits-security', 'vercel-agent-skills', 'vercel-react-best-practices', 'vercel-web-design-guidelines', 'claim-test-strategy', 'frontend-architect']) {
      assert.equal(fs.existsSync(path.join(root, 'skills', retired, 'SKILL.md')), false, `${retired} must not remain selectable`);
    }
    // 'impeccable' was a pack-level old registry record whose successor is
    // materialized as the active skill itself — verify it is now selectable.
    assert.equal(fs.existsSync(path.join(root, 'skills/impeccable/SKILL.md')), true, 'impeccable successor must be materialized');
    for (const upstream of ['playwright-cli', 'expo-overview', 'systematic-debugging', 'design-taste-frontend', 'image-to-code']) assert.equal(fs.existsSync(path.join(root, 'skills', upstream, 'SKILL.md')), true, `${upstream} must be materialized under its exact upstream name`);
    assert.equal(fs.existsSync(path.join(root, '.agent', 'history')), false, 'active task state must not create history');
  });

  await check('native routing preserves the owner-selected model', async () => {
    const request = {
      protocol_version: '2.0', host: 'omp', session_id: 's1', turn_id: 't1', cwd: root,
      prompt: 'Refactor a Postgres query safely', repo_root: root, host_facts: { model: 'owner/model' },
    };
    const routed = await kernel.routeNativeTurn(request);
    assert.equal(routed.capsule.model.requested, 'owner/model');
    assert.equal(routed.capsule.model.observed, null);
    assert.deepEqual(fs.readdirSync(temp), []);
  });

  await check('explicit-only capabilities are not keyword activated', async () => {
    const routed = await kernel.routeNativeTurn({
      protocol_version: '2.0', host: 'codex', session_id: 's2', turn_id: 't2', cwd: root,
      prompt: 'Design a database table and UI', repo_root: root,
    });
    assert.equal(routed.capsule.integrations.some((item) => /pencil/i.test(item.provider ?? '')), false);
  });

  await check('fresh focused proof is reused without a duplicate execution plan', () => {
    const request = {
      task_id: 'seam', repository: root, trigger: { changed_files: ['rules/20-proof-outcome.md'] },
      claims: [{ id: 'C-1', claim: 'proof behavior remains valid' }], risks: [],
      binding: { source_hash: 'a'.repeat(64), environment_hash: 'b'.repeat(64), proof_contract_hash: 'c'.repeat(64) },
    };
    const first = proof.planProofRoute(request);
    const replay = proof.planProofRoute({
      ...request,
      existing_proofs: first.plan.selected.map((selected, index) => ({
        id: `cached-${index}`, claim_id: selected.claim_id, category: selected.category, status: 'PASS', ...request.binding,
      })),
    });
    assert.ok(first.execution.selected_for_run.length > 0);
    assert.equal(replay.execution.selected_for_run.length, 0);
  });

  await check('broad regression stays at release/material gates', () => {
    const base = {
      task_id: 'release', repository: root, trigger: { changed_files: ['src/x.ts'] },
      claims: [{ id: 'C-1', claim: 'public behavior' }], risks: ['security'], force_full_suite: true,
    };
    assert.equal(proof.planProofRoute({ ...base, risks: [] }).execution.full_suite_allowed, false);
    assert.equal(proof.planProofRoute({ ...base, release_gate: true }).execution.full_suite_allowed, true);
    assert.equal(proof.planProofRoute(base).execution.full_suite_allowed, true);
  });

  await check('P2 blocks only when materially acceptance-bound', () => {
    const advisory = materiality.classifyReviewMateriality({
      severity: 'P2', dimension: 'maintainability', message: 'cosmetic', user_impact: 'none',
    }, { relevant_acceptance_ids: [] });
    const blocking = materiality.classifyReviewMateriality({
      severity: 'P2', acceptance_id: 'AC-1', dimension: 'runtime_live_host_behavior',
      message: 'production runtime regression', user_impact: 'host cannot run',
    }, { relevant_acceptance_ids: ['AC-1'] });
    assert.equal(advisory.blocking, false);
    assert.equal(blocking.blocking, true);
  });

  await check('health requirements follow real host surfaces', () => {
    const codex = kernel.requiredHealthComponentsForHost('codex');
    const opencode = kernel.requiredHealthComponentsForHost('opencode');
    assert.equal(codex.includes('hooks'), false);
    assert.equal(opencode.includes('plugins'), false);
  });

  await check('production host paths contain no agent-rules runtime callback', () => {
    const sourceRoots = [path.join(root, 'packages/cli/src'), path.join(root, 'platforms')];
    const forbidden = /agent-rules-lifecycle|lifecycle-hook\.js|NODE_RUNTIME|LIFECYCLE_ENTRYPOINT|spawnSync\([^\n]*agent-rules|agent-rules-runtime\/northstar/i;
    const allowedMigration = new Set([
      path.join(root, 'packages/cli/src/runtime/legacy-runtime-cleanup.ts'),
      path.join(root, 'packages/cli/src/services/command-code-native.ts'),
    ]);
    const visit = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.(?:ts|js|mjs)$/.test(entry.name) && !allowedMigration.has(file)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, file);
      }
    };
    sourceRoots.forEach(visit);
  });

  await check('all nine hosts come from one registry', () => {
    const contracts = JSON.parse(fs.readFileSync(path.join(root, 'platforms/platform-contracts.json'), 'utf8'));
    assert.equal(contracts.registry.host_ids.length, 9);
    assert.deepEqual(kernel.getHostIds(), contracts.registry.host_ids);
  });

  await check('generated hosts contain no role or model-routing artifacts', () => {
    for (const host of kernel.getHostIds()) {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'generated/runtime-build', host, 'manifest.json'), 'utf8'));
      assert.equal(manifest.files.some((file) => /model-policy|workctl|^agents\//i.test(file.path)), false);
    }
  });

  await check('public CLI has no shadow planner/executor; active task state is allowed', () => {
    const source = fs.readFileSync(path.join(root, 'packages/cli/src/index.ts'), 'utf8');
    const commands = [...source.matchAll(/\.command\("([^"]+)"\)/g)].map((match) => match[1]);
    assert.deepEqual(commands, ['install', 'update', 'rollback', 'uninstall', 'doctor', 'status', 'integration', 'reference', 'task', 'route-native']);
  });
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

for (const result of results) console.log(`${result.status} ${result.name}${result.error ? ` — ${result.error}` : ''}`);
const failed = results.filter((result) => result.status === 'FAIL');
console.log(`${results.length - failed.length}/${results.length} global behavior checks passed`);
if (failed.length) process.exit(1);
