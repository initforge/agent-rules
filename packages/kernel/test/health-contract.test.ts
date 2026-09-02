import { describe, expect, it } from 'vitest';
import { HEALTH_PROBE_REGISTRY, createHealthReceipt, reduceHealth, type HealthComponent } from '../src/northstar/health-contract.js';

const base = (component: HealthComponent, status: 'HEALTHY' | 'UNKNOWN' | 'UNAVAILABLE' | 'DEGRADED' = 'HEALTHY') => createHealthReceipt({
  receipt_id: `r-${component}`, host: 'test', host_version: '1', component, status,
  candidate_hash: 'candidate', config_hash: 'config', source_hash: 'source',
  probe_contract: { id: `probe-${component}`, component, owner: 'test', required: true, live: true, version: '1' },
  observed_at: '2026-08-29T00:00:00.000Z', environment: 'test', evidence: ['test-proof'],
});

describe('canonical live health contract', () => {
  it('names reducer proof honestly without claiming host-turn enforcement', () => {
    expect(HEALTH_PROBE_REGISTRY['proof-outcome']).toMatchObject({ id: 'proof-reducer-fail-closed-v2', version: '2', live: true });
  });
  it('fails closed when a required component has no receipt', () => {
    expect(reduceHealth([base('rules')], ['rules', 'hooks'])).toMatchObject({ status: 'UNKNOWN', missing: ['hooks'] });
  });
  it('never reduces UNKNOWN to HEALTHY', () => {
    expect(reduceHealth([base('rules', 'UNKNOWN')], ['rules']).status).toBe('UNKNOWN');
  });
  it('accepts a complete healthy component set', () => {
    expect(reduceHealth([base('rules'), base('hooks')], ['rules', 'hooks']).status).toBe('HEALTHY');
  });
  it('keeps unavailable required hosts and advisory surfaces non-green', () => {
    expect(reduceHealth([base('rules', 'UNAVAILABLE')], ['rules']).status).toBe('UNAVAILABLE');
    expect(reduceHealth([base('rules'), base('hooks', 'DEGRADED')], ['rules']).status).toBe('DEGRADED');
  });
});
