/**
 * REQ-009 — canonical schemas exist and validate: proof-trigger, proof-profile,
 * claim-to-proof, risk-to-proof, proof-omission, proof-receipt,
 * test-refactor-matrix. Positive fixtures pass; negative fixtures are rejected.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// test/northstar -> test -> kernel -> packages -> repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function compile(schemaName: string) {
  const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'schemas', schemaName), 'utf8'));
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

const TRIGGER_SCHEMA = 'proof-trigger.schema.json';
const RECEIPT_SCHEMA = 'proof-receipt.schema.json';
const REFACTOR_SCHEMA = 'test-refactor-matrix.schema.json';
const PROFILE_SCHEMA = 'proof-profile.schema.json';
const OMISSION_SCHEMA = 'proof-omission.schema.json';
const CLAIM_SCHEMA = 'claim-to-proof.schema.json';
const RISK_SCHEMA = 'risk-to-proof.schema.json';

describe('proof schemas — positive fixtures pass, negative fixtures reject', () => {
  it('all seven canonical schemas exist', () => {
    for (const s of [TRIGGER_SCHEMA, RECEIPT_SCHEMA, REFACTOR_SCHEMA, PROFILE_SCHEMA, OMISSION_SCHEMA, CLAIM_SCHEMA, RISK_SCHEMA]) {
      expect(fs.existsSync(path.join(REPO_ROOT, 'schemas', s)), s).toBe(true);
    }
  });

  it('trigger schema accepts a scope-based activation', () => {
    const v = compile(TRIGGER_SCHEMA);
    const ok = v({
      changed_files: ['src/api.ts'],
      risk_hint: 'S2',
      activated: true,
      surfaces: ['api'],
      reasons: ['changed scope: 1 file(s)'],
      candidate_categories: ['contract', 'api', 'security'],
      required_fidelity: 'deterministic',
    });
    expect(v.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('trigger schema rejects keyword-only activation (missing scope)', () => {
    const v = compile(TRIGGER_SCHEMA);
    const bad = v({
      activated: true,
      surfaces: ['browser'],
      reasons: ['user said test'],
      candidate_categories: ['browser'],
      required_fidelity: 'live',
    });
    expect(bad).toBe(false);
    expect(v.errors?.some((e) => e.keyword === 'required' && e.params?.missingProperty === 'changed_files')).toBe(true);
  });

  it('trigger schema rejects unknown surfaces', () => {
    const v = compile(TRIGGER_SCHEMA);
    expect(v({
      changed_files: ['x'],
      activated: true,
      surfaces: ['not-a-surface'],
      reasons: ['r'],
      candidate_categories: ['unit'],
      required_fidelity: 'deterministic',
    })).toBe(false);
  });

  it('receipt schema accepts a complete receipt', () => {
    const v = compile(RECEIPT_SCHEMA);
    const ok = v({
      schema: 'agent-rules/proof-receipt/v1',
      version: 1,
      task_id: 'T-1',
      repository: '/repo',
      changed_scope: ['src/a.ts'],
      claims: [{ claim_id: 'C-1', claim: 'x' }],
      risks: [],
      selected_profile: 'business-logic',
      selected: [{
        claim_id: 'C-1', proof_id: 'unit:C-1', category: 'unit',
        sufficiency: 'covers claim', environment: 'deterministic', escalation_path: 'escalate',
      }],
      omitted: [{
        category: 'live', reason: 'no live host', why_safe: 'not a live claim', escalation_condition: 'provide host',
      }],
      escalation_decisions: [],
      environment: 'deterministic',
      results: [{ proof_id: 'unit:C-1', status: 'PASS' }],
      evidence_refs: [],
      final_status: 'PASS',
      generated_at: new Date().toISOString(),
    });
    expect(v.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('receipt schema rejects an illegal final status', () => {
    const v = compile(RECEIPT_SCHEMA);
    const base = {
      schema: 'agent-rules/proof-receipt/v1', version: 1, task_id: 'T', repository: '/r',
      changed_scope: [], claims: [], risks: [], selected_profile: 'p', selected: [], omitted: [],
      escalation_decisions: [], environment: 'e', results: [], evidence_refs: [],
      generated_at: new Date().toISOString(),
    };
    expect(v({ ...base, final_status: 'COMPLETE' })).toBe(false);
    expect(v({ ...base, final_status: 'BLOCKED' })).toBe(true);
  });

  it('refactor matrix schema accepts a mapped refactor with protected tests', () => {
    const v = compile(REFACTOR_SCHEMA);
    const ok = v({
      schema: 'agent-rules/test-refactor-matrix/v1',
      version: 1,
      repository: '/repo',
      audited_at: new Date().toISOString(),
      baseline: { files: 10, tests: 100 },
      after: { files: 8, tests: 80 },
      entries: [{
        test_id: 't1', file: 't.test.ts', category: 'unit', covers_claims: ['C-1'],
        protected: true, action: 'keep', action_reason: 'distinct',
      }],
      protected_count: 1,
      coverage_preserved: true,
      coverage_evidence: 'map',
      post_refactor_proof_run: 'npm test',
    });
    expect(v.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('refactor matrix schema rejects an unknown action', () => {
    const v = compile(REFACTOR_SCHEMA);
    expect(v({
      schema: 'agent-rules/test-refactor-matrix/v1', version: 1, repository: '/r',
      audited_at: new Date().toISOString(), baseline: { files: 1, tests: 1 }, after: { files: 1, tests: 1 },
      entries: [{ test_id: 't', file: 'f', category: 'unit', covers_claims: [], action: 'delete', action_reason: 'x' }],
      protected_count: 0, coverage_preserved: true, coverage_evidence: 'm', post_refactor_proof_run: 't',
    })).toBe(false);
  });

  it('profile/omission/claim/risk schemas accept canonical shapes and reject bad categories', () => {
    const profileV = compile(PROFILE_SCHEMA);
    expect(profileV({
      id: 'p', name: 'p', applies_to: ['api'], escalation_to: ['business-logic'], min_fidelity: 'deterministic',
      steps: [{ category: 'contract', description: 'x' }],
    })).toBe(true);
    expect(profileV({
      id: 'p', name: 'p', applies_to: ['api'], escalation_to: ['x'], min_fidelity: 'live',
      steps: [{ category: 'nope', description: 'x' }],
    })).toBe(false);

    const omissionV = compile(OMISSION_SCHEMA);
    expect(omissionV({ category: 'live', reason: 'r', why_safe: 'w', escalation_condition: 'c' })).toBe(true);
    expect(omissionV({ category: 'live', reason: 'r' })).toBe(false);

    const claimV = compile(CLAIM_SCHEMA);
    expect(claimV({ claim_id: 'C', claim: 'c', required_categories: ['unit'], required_fidelity: 'deterministic', live_surface: false })).toBe(true);
    expect(claimV({ claim_id: 'C', claim: 'c', required_categories: ['bogus'], required_fidelity: 'live', live_surface: true })).toBe(false);

    const riskV = compile(RISK_SCHEMA);
    expect(riskV({ risk_class: 'S3', escalates_categories: ['security'], notes: 'x' })).toBe(true);
    expect(riskV({ risk_class: 'S9', escalates_categories: [], notes: 'x' })).toBe(false);
  });
});
