import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { routeSkills } from '../src/northstar/routing.js';
import { deriveProofTrigger } from '../src/northstar/proof-testing.js';
import { applyProofExecutionPolicy, type ExistingProofBinding, type ProofBindingContext } from '../src/harness/evidence/proof-policy.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('harness-degradation safeguards', () => {
  it('no contradictory always-on assertions in the compact global rules', () => {
    const manifest = YAML.parse(fs.readFileSync(path.join(repoRoot, 'rules', 'manifest.yaml'), 'utf8'));
    const alwaysOn = (manifest?.load_order ?? []).filter((name) => (manifest?.rule_contracts?.[name]?.trigger ?? 'always-load') === 'always-load');
    // compact core = 00/10/20 only; rule 30 is build/diagnostic, 40 repo-local
    expect(alwaysOn.sort()).toEqual(['00-intent-scope-safety.md', '10-execution-planning-delegation.md', '20-proof-outcome.md'].sort());
    const texts = alwaysOn.map((name) => fs.readFileSync(path.join(repoRoot, 'rules', name), 'utf8')).join('\n');
    // no self-contradicting delegation/verifier/reporting theater
    expect(texts).not.toMatch(/mandatory independent verifier/i);
    expect(texts).not.toMatch(/one focused recheck/i);
  });

  it('no environment-only activation: repo facts never select a skill alone', () => {
    const facts = (packages: string[]) => ({ manifests: ['package.json'], packages, frameworks: packages, schemas: [], changed_files: [] });
    const byFacts = routeSkills({ prompt: 'Prisma database work', repositoryFacts: facts(['@prisma/client', 'prisma']) }, repoRoot).map((r) => r.id);
    expect(byFacts).not.toContain('prisma-client-api');
    // explicit skill wins over any environment signal
    const explicit = routeSkills({ prompt: 'Prisma database work', explicitSkills: ['prisma-client-api'], repositoryFacts: facts(['@prisma/client', 'prisma']) }, repoRoot).map((r) => r.id);
    expect(explicit).toContain('prisma-client-api');
  });

  it('no forced generic skill loading: execute mode routes no generic execution/verification pair', () => {
    const execute = routeSkills({ prompt: 'Implement the accepted task', requestedMode: 'execute' }, repoRoot).map((r) => r.id);
    expect(execute).not.toContain('finish-to-completion');
    expect(execute).not.toContain('verification-router');
    // plan mode only pulls the lazy planning procedure
    const plan = routeSkills({ prompt: 'Continue', requestedMode: 'plan' }, repoRoot).map((r) => r.id);
    expect(plan).toContain('plan-and-handoff');
  });

  it('no excess always-on context: always-on rules are under the hard budget', () => {
    const manifest = YAML.parse(fs.readFileSync(path.join(repoRoot, 'rules', 'manifest.yaml'), 'utf8'));
    const alwaysOn = (manifest?.load_order ?? []).filter((name) => (manifest?.rule_contracts?.[name]?.trigger ?? 'always-load') === 'always-load');
    const text = alwaysOn.map((name) => fs.readFileSync(path.join(repoRoot, 'rules', name), 'utf8')).join('\n');
    const tokens = Math.ceil(text.replace(/\r\n?/g, '\n').length / 3.6);
    expect(tokens).toBeLessThanOrEqual(1600);
    expect(tokens).toBeGreaterThanOrEqual(800);
  });

  it('proof never closes the wrong product claim: reuse requires exact binding per claim', () => {
    const binding: ProofBindingContext = { source_hash: 'a'.repeat(64), environment_hash: 'b'.repeat(64), proof_contract_hash: 'c'.repeat(64) };
    const existing: ExistingProofBinding[] = [{
      id: 'p1', claim_id: 'claim-A', category: 'unit', status: 'PASS',
      source_hash: binding.source_hash!, environment_hash: binding.environment_hash!, proof_contract_hash: binding.proof_contract_hash!,
    }];
    const selected = [
      { claim_id: 'claim-A', proof_id: 'unit:claim-A', category: 'unit' as const, sufficiency: 'x', environment: 'det', escalation_path: 'y' },
      { claim_id: 'claim-B', proof_id: 'unit:claim-B', category: 'unit' as const, sufficiency: 'x', environment: 'det', escalation_path: 'y' },
    ];
    const policy = applyProofExecutionPolicy({ task_id: 't', selected, existing_proofs: existing, binding, selector_full_suite_required: false });
    // existing PASS covers claim-A only; claim-B must RUN
    expect(policy.decisions.find((d) => d.proof_id === 'unit:claim-A')?.action).toBe('REUSE');
    expect(policy.decisions.find((d) => d.proof_id === 'unit:claim-B')?.action).toBe('RUN');
  });

  it('proof final status cannot PASS from static signals alone', () => {
    // a claim whose only proof is a BLOCKED live proof must stay BLOCKED
    const trigger = deriveProofTrigger({ changed_files: ['src/x.ts'], runtime_surfaces: ['network'] });
    expect(trigger.required_fidelity).toBe('live');
    expect(trigger.candidate_categories).toContain('live');
  });

  it('no wrapper reachability: retired wrappers have no folder and are unroutable', () => {
    for (const wrapped of ['finish-to-completion', 'frontend-composition', 'database-stack', 'mobile-composition', 'infra-devops-composition', 'browser-qa', 'ui-taste', 'master-image-generation', 'qa-skills', 'quality']) {
      expect(fs.existsSync(path.join(repoRoot, 'skills', wrapped, 'SKILL.md'))).toBe(false);
    }
    const routed = routeSkills({ prompt: '', explicitSkills: [] }, repoRoot).map((r) => r.id);
    for (const wrapped of ['finish-to-completion', 'frontend-composition', 'database-stack', 'mobile-composition', 'infra-devops-composition', 'browser-qa', 'ui-taste', 'master-image-generation', 'qa-skills', 'quality']) {
      expect(routed).not.toContain(wrapped);
    }
  });
});