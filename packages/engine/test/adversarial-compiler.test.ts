/**
 * adversarial-compiler.test.ts — M11-R30 adversarial counterexample compiler
 * (AM-0020 §7). Covers:
 *  - generator coverage: every §7 subcategory yields a probe descriptor;
 *  - runProbe PASS/FAIL/SKIPPED_INAPPLICABLE semantics (false-green detection);
 *  - T2/T3 gate: no probe → rejected, probe → accepted, deterministic proof → accepted;
 *  - compile coverage + the empty-required-domain FAIL path.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  ADVERSARIAL_DOMAINS,
  compileAdversarial,
  compileCounterexamples,
  runProbe,
  runProbes,
  assertNegativeProbeOrDeterministicProof,
  probeToParityPair,
  type AdversarialDomain,
  type Counterexample,
  type ClaimDef,
  type ProbeSubject,
} from '../src/adversarial-compiler.js';
import type { ParityPair } from '../src/parity-runner.js';
import { FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS } from './adversarial-fixture.js';

function probesFor(domain: AdversarialDomain): Counterexample[] {
  return compileCounterexamples(FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS).filter((p) => p.domain === domain);
}

function assertSubcategories(domain: AdversarialDomain, expected: string[]): void {
  const probes = probesFor(domain);
  const seen = new Set(probes.map((p) => p.subcategory));
  for (const sub of expected) {
    assert.ok(seen.has(sub), `${domain} generator must yield subcategory ${sub}`);
  }
  assert.equal(probes.length, expected.length, `${domain} yields one probe per subcategory`);
}

function makeSubject(
  id: string,
  surfaces: string[],
  rejects: string[] | 'all',
): ProbeSubject {
  return {
    id,
    hasSurface: (probe) => surfaces.includes(probe.domain) || surfaces.includes(probe.surface),
    execute: (probe) =>
      rejects === 'all' || rejects.includes(probe.probe_id)
        ? { rejected: true, observed: `rejected ${probe.probe_id}` }
        : { rejected: false, observed: `accepted ${probe.probe_id}` },
  };
}

function basePair(): ParityPair {
  return {
    id: 'c7-base',
    referenceUrl: 'data:text/html,<h1>Parity fixture</h1>',
    referenceRevisionHash: `sha256:${'a'.repeat(64)}`,
    targetUrl: 'data:text/html,<h1>Parity fixture</h1>',
    candidateHash: `sha256:${'b'.repeat(64)}`,
    fixture: 'parity-fixture',
    role: 'visitor',
    locale: 'en-US',
    timezone: 'UTC',
    viewport: { width: 1280, height: 720 },
    dpr: 1,
    theme: 'light',
    reducedMotion: 'no-preference',
    actionSequence: [{ kind: 'wait', delayMs: 10 }],
    stateCheckpoint: '{"h1": "Parity fixture"}',
    semanticAnchors: ['heading:h1:Parity fixture'],
    allowedDeviations: [],
  };
}

describe('probe generators cover every AM-0020 §7 subcategory', () => {
  it('finance_concurrency: cross-tenant, double-approval, idempotency, capacity, TOCTOU, partial-tx, numeric boundaries', () => {
    assertSubcategories('finance_concurrency', [
      'cross-tenant-reference',
      'double-approval',
      'duplicate-idempotency-key',
      'capacity-oversubscription',
      'toctou-validation-commit',
      'partial-transaction',
      'numeric-boundaries',
    ]);
  });

  it('authorization_security: wrong-owner, cross-role, default-deny, enumeration, token, header spoofing', () => {
    assertSubcategories('authorization_security', [
      'wrong-owner-object',
      'cross-role-access',
      'missing-default-deny',
      'enumeration-anti-oracle',
      'stale-revoked-token',
      'header-spoofing',
    ]);
  });

  it('browser_parity: reference-state, missing control, redirect, console/network on mount, CDP buffer, vacuous a11y, environment', () => {
    assertSubcategories('browser_parity', [
      'reference-state-mismap',
      'missing-control-content-media',
      'redirect-to-home',
      'runtime-error-on-mount',
      'cdp-buffer-reset',
      'vacuous-a11y',
      'environment-mismatch',
    ]);
  });

  it('release: evidence-before-fix, image-before-epoch, mutable artifact, untracked source, migration mismatch', () => {
    assertSubcategories('release', [
      'evidence-before-fix',
      'image-before-epoch',
      'mutable-artifact',
      'untracked-source',
      'migration-mismatch',
    ]);
  });

  it('browser_parity probes reuse the C7 seeded-defect machinery', () => {
    const probes = probesFor('browser_parity');
    const withSeed = probes.filter((p) => p.defect_seed !== undefined);
    assert.ok(withSeed.length >= 2, 'seeded probes: missing-control + console-error');
    assert.ok(withSeed.some((p) => p.defect_seed === 'missing-control'));
    assert.ok(withSeed.some((p) => p.defect_seed === 'console-error'));
    for (const p of probes) {
      const pair = probeToParityPair(p, basePair());
      assert.ok(pair.id.endsWith(p.probe_id), 'pair id binds the probe');
      if (p.defect_seed) assert.equal(pair.defectSeed, p.defect_seed, 'seed delegated to the pair');
    }
  });

  it('probes target the claim that scopes their domain (claim scope binding)', () => {
    const byId = new Map(FIXTURE_CLAIMS.map((c) => [c.claim_id, c]));
    for (const p of compileCounterexamples(FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS)) {
      const claim = byId.get(p.target_claim);
      assert.ok(claim, `probe ${p.probe_id} targets known claim ${p.target_claim}`);
      assert.ok(
        (claim.domains ?? []).includes(p.domain),
        `probe ${p.probe_id} domain ${p.domain} must be inside claim ${claim.claim_id} scope`,
      );
    }
  });
});

describe('runProbe honest semantics (PASS / FAIL / SKIPPED_INAPPLICABLE)', () => {
  const probes = compileCounterexamples(FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS);
  const anyProbe = probes[0];

  it('PASS when the subject rejects the negative action as expected (invariant holds)', () => {
    const subject = makeSubject('secure-impl', ADVERSARIAL_DOMAINS, 'all');
    const result = runProbe(anyProbe, subject);
    assert.equal(result.outcome, 'PASS');
    assert.equal(result.probe_id, anyProbe.probe_id);
  });

  it('FAIL when the subject accepts the probe — false-green detected', () => {
    const subject = makeSubject('leaky-impl', ADVERSARIAL_DOMAINS, []);
    const result = runProbe(anyProbe, subject);
    assert.equal(result.outcome, 'FAIL');
    assert.match(result.reason, /false-green/);
  });

  it('SKIPPED_INAPPLICABLE when the subject lacks the surface — never PASS', () => {
    const subject = makeSubject('no-finance-impl', ['browser_parity', 'release'], 'all');
    const result = runProbe(anyProbe, subject);
    assert.equal(result.outcome, 'SKIPPED_INAPPLICABLE');
    assert.match(result.reason, /lacks surface/);
  });

  it('SKIPPED_INAPPLICABLE even if the subject would reject — absence is not PASS', () => {
    const rejecting = makeSubject('absent-but-willing', [], 'all');
    const result = runProbe(anyProbe, rejecting);
    assert.equal(result.outcome, 'SKIPPED_INAPPLICABLE');
  });

  it('runProbes aggregates one result per probe with the batch subject', () => {
    const subject = makeSubject('secure-impl', ADVERSARIAL_DOMAINS, 'all');
    const results = runProbes(probes, subject);
    assert.equal(results.length, probes.length);
    assert.ok(results.every((r) => r.outcome === 'PASS'));
    assert.ok(results.every((r) => r.subject_id === 'secure-impl'));
  });
});

describe('T2/T3 negative-probe gate (AM-0020 §7)', () => {
  const probes = compileCounterexamples(FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS);

  it('rejects a T3 claim that has no negative probe and no deterministic proof', () => {
    const bare: ClaimDef = { claim_id: 'claim-bare-t3', risk_tier: 'T3', scope: 'unprobed' };
    const gate = assertNegativeProbeOrDeterministicProof(bare, probes);
    assert.equal(gate.accepted, false);
    assert.match(gate.reason, /no negative probe/);
  });

  it('rejects a T2 claim that has no negative probe and no deterministic proof', () => {
    const bare: ClaimDef = { claim_id: 'claim-bare-t2', risk_tier: 'T2', scope: 'unprobed' };
    const gate = assertNegativeProbeOrDeterministicProof(bare, probes);
    assert.equal(gate.accepted, false);
  });

  it('accepts a T3 claim that has a targeting negative probe', () => {
    const gate = assertNegativeProbeOrDeterministicProof(
      FIXTURE_CLAIMS.find((c) => c.claim_id === 'claim-fin-1')!,
      probes,
    );
    assert.equal(gate.accepted, true);
    assert.ok(gate.probe_id?.startsWith('finance_'));
  });

  it('accepts a T3 claim with a recorded deterministic-proof justification (probe formally unnecessary)', () => {
    const proved: ClaimDef = {
      claim_id: 'claim-proved-t3',
      risk_tier: 'T3',
      scope: 'mathematically closed',
      deterministic_proof: {
        justification: 'invariant is formally verified by exhaustive enum over the finite state space',
        proof_ref: 'evals/m11/formal-proof.txt',
      },
    };
    const gate = assertNegativeProbeOrDeterministicProof(proved, probes);
    assert.equal(gate.accepted, true);
    assert.match(gate.reason, /deterministic proof/);
  });

  it('does not gate T0/T1 claims', () => {
    const t0 = assertNegativeProbeOrDeterministicProof(
      FIXTURE_CLAIMS.find((c) => c.claim_id === 'claim-t0-mechanical')!,
      probes,
    );
    assert.equal(t0.accepted, true);
  });
});

describe('compile coverage + empty-required-domain FAIL path', () => {
  it('every required domain has non-empty probe coverage', () => {
    const report = compileAdversarial(FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS);
    for (const domain of ADVERSARIAL_DOMAINS) {
      assert.ok(report.coverage[domain] > 0, `required domain ${domain} produced zero probes`);
    }
    assert.deepEqual(report.empty_required_domains, []);
  });

  it('reports empty_required_domains when the plan requires a domain with no generator', () => {
    const report = compileAdversarial(
      { plan_id: 'bad-plan', domains_required: ['finance_concurrency', 'no-such-domain'] as AdversarialDomain[] },
      FIXTURE_TOPOLOGY,
      [],
    );
    assert.ok(report.empty_required_domains.includes('no-such-domain' as AdversarialDomain));
    assert.equal(report.coverage.finance_concurrency, 7);
  });

  it('a plan requiring only one domain compiles only that domain', () => {
    const report = compileAdversarial(
      { plan_id: 'auth-only', domains_required: ['authorization_security'] },
      FIXTURE_TOPOLOGY,
      [],
    );
    assert.equal(report.probes.length, 6);
    assert.equal(report.coverage.finance_concurrency, 0);
  });
});
