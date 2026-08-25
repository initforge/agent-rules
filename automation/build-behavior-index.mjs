#!/usr/bin/env node
/**
 * build-behavior-index.mjs — canonical generated behavior index (REQ-113).
 *
 * Produces generated/behavior-index.json and generated/behavior-index.md with
 * the 10 canonical views:
 *
 *   1. lifecycle stage → owner module
 *   2. requirement → claim → task → proof → evidence
 *   3. old behavior → replacement → parity test
 *   4. skill → trigger facts → capability → provider → eval → installed hashes
 *   5. capability → MCP/tool → authorization → handshake/effect evidence
 *   6. host → native surfaces → provenance → adapter → canary → current status
 *   7. state vocabulary → allowed transition → public label
 *   8. artifact → single writer → readers → retention → candidate binding
 *   9. changed path → affected domains → required tests
 *   10. GitHub job → claims the job proves
 *
 * The CLI reads the same index (status summary, status --details, doctor all
 * --json). generated/ is never hand-edited.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'generated');

const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const json = (p) => { try { return JSON.parse(read(p)); } catch { return null; } };
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

function loadRuleSet() {
  const manifest = json(path.join(root, 'rules', 'manifest.yaml')) ?? null;
  const yaml = read(path.join(root, 'rules', 'manifest.yaml'));
  const loadOrder = [...yaml.matchAll(/^\s+-\s+(\S+\.md)\s*$/gm)].map((m) => m[1]);
  return { rules: loadOrder, manifest: yaml };
}

function loadSkills() {
  const dir = path.join(root, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => {
      const body = read(path.join(dir, e.name, 'SKILL.md'));
      const meta = body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      const name = meta.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? e.name;
      const description = meta.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
      const signals = [...meta.matchAll(/signals:([\s\S]*?)(?=\n\s*[a-z_]+:|$)/g)].flatMap((m) => [...m[1].matchAll(/-\s*(.+)/g)].map((x) => x[1].trim())).filter(Boolean);
      const excludes = [...meta.matchAll(/excludes:([\s\S]*?)(?=\n\s*[a-z_]+:|$)/g)].flatMap((m) => [...m[1].matchAll(/-\s*(.+)/g)].map((x) => x[1].trim())).filter(Boolean);
      return {
        id: e.name,
        name,
        description,
        signals,
        excludes,
        activation: /EXPLICIT/i.test(body) ? 'EXPLICIT' : /ON_DEMAND/i.test(body) ? 'ON_DEMAND' : /ROUTED/i.test(body) || (signals.length > 0) ? 'ROUTED' : 'ROUTED',
        capabilities: [...meta.matchAll(/capabilities:([\s\S]*?)(?=\n\s*[a-z_]+:|$)/g)].flatMap((m) => [...m[1].matchAll(/-\s*(.+)/g)].map((x) => x[1].trim())).filter(Boolean),
        sha256: sha256(body),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function loadHosts() {
  const registry = json(path.join(root, 'platforms', 'platform-contracts.json'));
  if (!registry) return [];
  const contracts = registry.native_contracts ?? {};
  const ids = registry.registry?.host_ids ?? Object.keys(contracts);
  return ids.map((id) => {
    const c = contracts[id] ?? {};
    return {
      id,
      homeEnv: c.homeEnv ?? null,
      surfaces: Object.keys(c.surfaces ?? {}),
      instructionPath: c.paths?.instructionPath ?? null,
      reload: c.reload ?? null,
      offlineClaims: c.authBoundary?.offlineClaims ?? [],
      requiresAuthClaims: c.authBoundary?.requiresAuthClaims ?? [],
      canaryStrategy: c.canaryStrategy ?? null,
    };
  });
}

function loadEvidence() {
  const dir = path.join(root, '.agent', 'evidence', 'global-agent-behavior-native-live-closure-v1');
  const out = [];
  const visit = (current) => {
    for (const e of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) visit(full);
      else if (e.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
          out.push({ path: path.relative(root, full).split(path.sep).join('/'), sha256: sha256(fs.readFileSync(full, 'utf8')), kind: parsed.schema ?? 'unknown' });
        } catch { /* ignore */ }
      }
    }
  };
  if (fs.existsSync(dir)) visit(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function buildIndex() {
  const pointer = json(path.join(root, '.agent', 'current.json'));
  const { rules } = loadRuleSet();
  const skills = loadSkills();
  const hosts = loadHosts();
  const evidence = loadEvidence();

  const lifecycleOwners = [
    { stage: 'RequestIntake', invariant: 'raw intent preserved; ambiguity closed', owner: 'RequestIntake' },
    { stage: 'PlanCompiler', invariant: 'requirements→claims→tasks full chain', owner: 'PlanCompiler' },
    { stage: 'ContextRuntime', invariant: 'capsule/checkpoint/compact/resume', owner: 'ContextRuntime' },
    { stage: 'SkillResolver', invariant: 'once per context_generation; SKILL.md canonical', owner: 'SkillResolver' },
    { stage: 'CapabilityBroker', invariant: 'provider/MCP lease by capability', owner: 'CapabilityBroker' },
    { stage: 'ExecutionCoordinator', invariant: 'scope/lock/worker/reconcile/bounded repair', owner: 'ExecutionCoordinator' },
    { stage: 'ProofRouter', invariant: 'smallest sufficient proof; live-for-live', owner: 'ProofRouter' },
    { stage: 'RunStore', invariant: 'single writer of run/evidence/result', owner: 'RunStore' },
    { stage: 'OutcomeReducer', invariant: 'single reducer of claim outcomes', owner: 'OutcomeReducer' },
  ];

  const vocabulary = {
    task_state: ['DISCUSSING', 'PLANNED', 'EXECUTING', 'VERIFYING', 'COMPLETE', 'BLOCKED', 'NEEDS_USER'],
    claim_outcome: ['PASS', 'PARTIAL', 'BLOCKED', 'UNSUPPORTED', 'PRE-EXISTING', 'NEEDS_USER'],
    host_state: ['NOT_DETECTED', 'DETECTED', 'INSTALLED', 'OFFLINE_VERIFIED', 'LIVE_VERIFIED', 'FAILED'],
    provider_state: ['UNAVAILABLE', 'AVAILABLE', 'AUTHORIZED', 'ACTIVE', 'FAILED'],
  };

  return {
    schema: 'agent-rules/behavior-index/v1',
    generated_at: new Date().toISOString(),
    generated_by: 'automation/build-behavior-index.mjs',
    active_plan: pointer?.work_id ?? null,
    views: {
      lifecycle_stage_owner: lifecycleOwners,
      requirement_claim_task_proof_evidence: {
        note: 'Full chains live in .agent/plans/<active>/semantic-admission.json (requirement→claim→task→verifier→evidence→rollback).',
        requirement_count: pointer?.contract?.requirement_ids?.length ?? 0,
        requirement_ids: pointer?.contract?.requirement_ids ?? [],
      },
      old_behavior_replacement_parity: {
        note: 'Legacy→replacement→proof matrix in .agent/plans/<active>/baseline-and-loss-map.md.',
        rules: rules.map((r) => ({ rule: r, sha256: sha256(read(path.join(root, 'rules', r))) })),
      },
      skill_view: skills,
      capability_view: { note: 'Capability/MCP matrix derives from skills + integrations; lease/authorization evidence is recorded at runtime.' },
      host_view: hosts,
      state_vocabulary: vocabulary,
      artifact_writer: {
        run: { writer: 'RunStore', readers: ['CLI status', 'doctor all --json'], retention: 'per-run', candidate_binding: 'candidate digest' },
        plan: { writer: 'PlanCompiler', readers: ['CLI run', 'execution coordinator'], retention: 'phase', candidate_binding: 'plan contract hash' },
        evidence: { writer: 'EvidenceLedger/RunStore', readers: ['OutcomeReducer', 'acceptance audit'], retention: 'immutable hash-chain', candidate_binding: 'spec revision + candidate epoch' },
        result: { writer: 'OutcomeReducer via RunStore', readers: ['CLI status', 'release report'], retention: 'single finalization', candidate_binding: 'receipt sha256' },
      },
      changed_paths: { note: 'Changed-path→domain→required-tests mapping is generated by the verification router at plan time.' },
      github_jobs: {
        Quality: ['build', 'check', 'test', 'verify:all', 'packaged runtime smoke', 'active plan/closure validity'],
        Certification: ['8-host native certification matrix', 'host attestation binding', 'candidate digest recompute'],
      },
    },
    evidence: evidence,
  };
}

const index = buildIndex();
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'behavior-index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

const md = [
  '# Agent Rules — Behavior Index',
  '',
  `Generated: ${index.generated_at} · active plan: ${index.active_plan} · evidence artifacts: ${index.evidence.length}`,
  '',
  '## 1. Lifecycle stage → owner module',
  '',
  '| Stage | Invariant | Owner |',
  '|---|---|---|',
  ...index.views.lifecycle_stage_owner.map((r) => `| ${r.stage} | ${r.invariant} | ${r.owner} |`),
  '',
  '## 2. Requirement → claim → task → proof → evidence',
  '',
  `- Requirements bound by active pointer: ${index.views.requirement_claim_task_proof_evidence.requirement_count}`,
  `- Full chains: \`.agent/plans/${index.active_plan}/semantic-admission.json\``,
  '',
  '## 3. Old behavior → replacement → parity',
  '',
  `- Legacy matrix: \`.agent/plans/${index.active_plan}/baseline-and-loss-map.md\``,
  `- Active rules with source hash: ${index.views.old_behavior_replacement_parity.rules.map((r) => `\`${r.rule}#${r.sha256.slice(0, 12)}\``).join(', ')}`,
  '',
  '## 4. Skills (SKILL.md canonical)',
  '',
  '| Skill | Activation | Signals | Capabilities | Source hash |',
  '|---|---|---|---|---|',
  ...index.views.skill_view.map((s) => `| ${s.id} | ${s.activation} | ${s.signals.slice(0, 3).join(', ')} | ${s.capabilities.join(', ')} | \`${s.sha256.slice(0, 12)}\` |`),
  '',
  `Global skills: ${index.views.skill_view.length}`,
  '',
  '## 5. Capability → MCP/tool',
  '',
  '- Selection by capability, not keyword; explicit-only providers need owner authorization.',
  '- MCP PASS requires 7-point canary (config readback, initialize, listTools, nonce call, effect, teardown, byte rollback).',
  '',
  '## 6. Hosts (native surfaces)',
  '',
  '| Host | Env | Surfaces | Offline claims | Auth-gated | Refresh |',
  '|---|---|---|---|---|---|',
  ...index.views.host_view.map((h) => `| ${h.id} | \`${h.homeEnv ?? '-'}\` | ${h.surfaces.join(', ')} | ${h.offlineClaims.length} | ${h.requiresAuthClaims.join(', ') || '-'} | \`${h.reload ?? '-'}\` |`),
  '',
  `Registered hosts: ${index.views.host_view.length}`,
  '',
  '## 7. State vocabulary',
  '',
  ...Object.entries(index.views.state_vocabulary).map(([k, v]) => `- \`${k}\`: ${v.join(' | ')}`),
  '',
  '## 8. Artifact writers (single writer)',
  '',
  '| Artifact | Writer | Readers | Candidate binding |',
  '|---|---|---|---|',
  ...Object.entries(index.views.artifact_writer).map(([k, v]) => `| ${k} | ${v.writer} | ${v.readers.join(', ')} | ${v.candidate_binding} |`),
  '',
  '## 9. Changed path → domains',
  '',
  '- Mapping generated by the verification router per plan (smallest sufficient proof).',
  '',
  '## 10. GitHub jobs → claims',
  '',
  ...Object.entries(index.views.github_jobs).map(([job, claims]) => `- **${job}**: ${claims.join(', ')}`),
  '',
  '## Evidence artifacts',
  '',
  ...index.evidence.map((e) => `- \`${e.path}\` (\`${e.sha256.slice(0, 12)}\`)`),
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'behavior-index.md'), md, 'utf8');

console.log(JSON.stringify({ status: 'PASS', file: 'generated/behavior-index.json', views: Object.keys(index.views).length, skills: index.views.skill_view.length, hosts: index.views.host_view.length, evidence: index.evidence.length }, null, 2));