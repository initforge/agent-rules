/**
 * evals/m11/adversarial-eval.test.ts — M11-R30 adversarial aggregation
 * (AM-0020 §7). Runs the compiler suite against the shared fixture and fails
 * the case when any probe generator is empty for a domain the plan requires.
 * Prints `adversarial-coverage: <domain>: <count>` lines consumed by
 * adversarial.py for the per-domain matrix.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  ADVERSARIAL_DOMAINS,
  compileAdversarial,
  compileCounterexamples,
  type AdversarialDomain,
} from '../../packages/engine/src/adversarial-compiler.js';
import { FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS } from '../../packages/engine/test/adversarial-fixture.js';

describe('M11-R30 adversarial compiler aggregation (AM-0020 §7)', () => {
  it('per-domain coverage: every required domain yields probes', () => {
    const report = compileAdversarial(FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS);
    for (const domain of ADVERSARIAL_DOMAINS) {
      console.log(`adversarial-coverage: ${domain}: ${report.coverage[domain]}`);
      assert.ok(report.coverage[domain] > 0, `required domain ${domain} produced zero probes`);
    }
    assert.equal(report.probes.length, 25, '25 §7 subcategory probes: 7+6+7+5');
    assert.deepEqual(report.empty_required_domains, []);
  });

  it('FAIL path: a required domain with an empty generator fails the compile', () => {
    const report = compileAdversarial(
      { plan_id: 'eval-bad-plan', domains_required: ['browser_parity', 'unknown-domain'] as AdversarialDomain[] },
      FIXTURE_TOPOLOGY,
      [],
    );
    assert.ok(
      report.empty_required_domains.includes('unknown-domain' as AdversarialDomain),
      'plan-required domain with no generator must be reported empty',
    );
  });

  it('browser_parity probes stay executable by parity-runner (descriptor → pair)', async () => {
    const probes = compileCounterexamples(FIXTURE_PLAN, FIXTURE_TOPOLOGY, FIXTURE_CLAIMS)
      .filter((p) => p.domain === 'browser_parity');
    assert.equal(probes.length, 7);
    const { probeToParityPair } = await import('../../packages/engine/src/adversarial-compiler.js');
    const base = {
      id: 'c7-base',
      referenceUrl: 'data:text/html,<h1>p</h1>',
      referenceRevisionHash: `sha256:${'a'.repeat(64)}`,
      targetUrl: 'data:text/html,<h1>p</h1>',
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
      stateCheckpoint: '{"h1":"p"}',
      semanticAnchors: [],
      allowedDeviations: [],
    };
    for (const probe of probes) {
      const pair = probeToParityPair(probe, base);
      assert.ok(pair.id.endsWith(probe.probe_id));
    }
  });
});
