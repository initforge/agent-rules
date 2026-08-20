#!/usr/bin/env node
/**
 * Deterministic structural audit for the owner-provided 101-section directive.
 * Behavioral proof remains in the North-Star and workspace test suites; this
 * audit prevents the durable plan from silently losing criteria or authority.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) throw new Error(`${id}: ${detail}`);
};

const index = read('.agent/plans/v3-decision-fabric/criteria-index.yaml');
const criteria = [...index.matchAll(/\bid: C-(\d{3})\b/g)].map((m) => Number(m[1]));
check('criteria-count', criteria.length === 101 && new Set(criteria).size === 101 && Math.min(...criteria) === 1 && Math.max(...criteria) === 101, `indexed ${criteria.length} unique sections`);
check('architecture-map', /## A\. Authority and raw intent/.test(read('.agent/plans/v3-decision-fabric/architecture-map.md')) && /## W\. Closure and residual truth/.test(read('.agent/plans/v3-decision-fabric/architecture-map.md')), 'A-W output is present');

const pointer = JSON.parse(read('.agent/current.json'));
check('current-authority', pointer.kind === 'current-pointer' && typeof pointer.work_id === 'string' && pointer.work_id.length > 0, `work_id=${pointer.work_id ?? '<missing>'}`);
check('current-generation', Number.isSafeInteger(pointer.generation) && pointer.generation >= 1, `generation=${pointer.generation}`);
const pointerSource = read('packages/kernel/src/state/current-pointer.ts');
const authoritySource = read('packages/kernel/src/state/execution-authority.ts');
check('pointer-no-plan-fallback', /readonly work_id: string/.test(pointerSource) && /return pointer\.work_id;/.test(authoritySource), 'work_id is explicit and plan_id is not an authority fallback');
check('generation-gates', /isCurrentExecution/.test(authoritySource) && /execution_generation/.test(authoritySource), 'identity comparison is generation-bound');

const fabric = read('packages/kernel/src/northstar/decision-fabric.ts');
check('typed-fabric', /RepoFacts/.test(fabric) && /ChangeFacts/.test(fabric) && /TaskFacts/.test(fabric) && /database\.migration\.verify/.test(fabric), 'typed facts and migration proof route exist');
check('zero-skill-default', /skills: \[\.\.\.input\.packet\.skills \?\? \[\]\]/.test(fabric), 'skills remain explicit/empty by default');
check('observed-change-facts', /observed_paths/.test(fabric) && /observation: 'planned' \| 'observed'/.test(fabric), 'planned and observed change facts are distinct');

const routing = read('packages/kernel/src/northstar/routing.ts');
check('effect-approval', /capabilityAuthorizationReason/.test(routing) && /approval required/.test(routing), 'effectful providers fail closed without authority');
check('explicit-provider-boundary', /explicit-only provider was not requested/.test(routing), 'explicit-only providers are not activated by installation');
check('pencil-boundary', /activation !== 'explicit-only'/.test(routing) && /pencil-mcp/.test(read('integrations/manual/pencil-mcp/manifest.json')), 'Pencil remains manual explicit-only');

const agentDriver = read('packages/kernel/src/runner/agent-driver.ts');
check('worker-pass-boundary', !/status:\s*['"]PASS['"]/.test(agentDriver), 'AgentDriver receipts do not author PASS');
check('bounded-context', /bounded/.test(read('packages/kernel/src/northstar/context.ts')) && /maxHits|MAX_HITS/.test(read('packages/kernel/src/northstar/context.ts')), 'context compilation has bounded retrieval');
check('control-plane-authority', /readExecutionAuthority/.test(read('packages/control-plane/src/routes/authority.ts')), 'Control Plane reads canonical authority');
check('artifact-lifecycle', fs.existsSync(path.join(root, '.agent', 'tombstones', 'README.md')) && /lifecycle/.test(read('.agent/cleanup-policy.json')), 'tombstone and cleanup policy are present');
check('handoff-contract', /assertHandoffBinding/.test(read('packages/kernel/src/artifact-handoff.ts')), 'cross-host handoff has a bound artifact contract');
check('provider-effects', /effect_level/.test(read('schemas/integration-effect.schema.json')) && /provider_evidence/.test(read('integrations/registry.json')), 'provider effects and evidence are declared');
check('legacy-parity', fs.existsSync(path.join(root, 'automation/validate-route-parity.py')), 'legacy route parity gate remains active');
check('independent-verification', /independent/.test(read('packages/kernel/src/northstar/evidence-ledger.ts')) && /verifier/.test(read('packages/kernel/src/northstar/evidence-ledger.ts')), 'acceptance uses independent verifier evidence');
check('dogfood-wiring', /CHECK: Decision Fabric dogfood/.test(read('automation/verify-all.mjs')) && fs.existsSync(path.join(root, 'packages/engine/test/northstar-governance.test.ts')), 'dogfood gate is in verify-all and tests');
check('ci-closure', /npm run ci:quality/.test(read('.agent/plans/v3-decision-fabric/requirements.yaml')) && /green remote CI/.test(read('.agent/plans/v3-decision-fabric/requirements.yaml')), 'closure requires local and remote evidence');

console.log(JSON.stringify({ schema: 'harness/v3-directive-audit/v1', status: 'PASS', criteria: 101, checks }, null, 2));
