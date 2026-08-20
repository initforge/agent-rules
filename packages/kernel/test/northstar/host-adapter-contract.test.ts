/**
 * REQ-010 — single HostAdapter contract and the time-boxed compatibility shim.
 * The shim refuses after expiry, never fabricates capability facts, and never
 * lets UNKNOWN become allow.
 */
import { describe, it, expect } from 'vitest';
import {
  compatAdapterToHostAdapterV2,
  adapterShimExpired,
  ADAPTER_CONTRACT_EXPIRY,
  type HostAdapter,
} from '../../src/northstar/host-adapter-contract.js';

function legacyAdapter(over: { installed?: boolean; probeOk?: boolean } = {}) {
  return {
    detect: async () => ({ installed: over.installed ?? true, version: '1.0.0', path: '/usr/bin/claude' }),
    render: async () => '/tmp/render',
    stage: async () => '/tmp/stage',
    activate: async () => ({ ok: true }),
    probe: async () => ({ ok: over.probeOk ?? true, detail: 'healthy' }),
    update: async () => ({ ok: true }),
    uninstall: async () => ({ ok: true }),
    rollback: async (version: string) => ({ ok: true, detail: `rollback ${version}` }),
  };
}

describe('REQ-010 — single HostAdapter contract + compatibility shim', () => {
  it('discover maps legacy detection onto the canonical HostObservation without granting task authority', async () => {
    const adapter: HostAdapter = compatAdapterToHostAdapterV2('claude', legacyAdapter());
    const observation = await adapter.discover();
    expect(observation.host).toBe('claude');
    expect(observation.installed).toBe(true);
    expect(observation.version).toBe('1.0.0');
    expect(observation.taskAuthority).toBe(false);
  });

  it('mapRequirement never turns UNKNOWN into allow — it falls back to broker/blocked', async () => {
    const adapter: HostAdapter = compatAdapterToHostAdapterV2('claude', legacyAdapter({ probeOk: false }));
    const plan = await adapter.mapRequirement({ capability: 'filesystem.mutation', effects: ['filesystem_mutation'] });
    expect(plan.decision.layer).toBe('blocked');
    expect(plan.decision.can_control_mutation).toBe(false);
    expect(plan.decision.reason).toMatch(/UNKNOWN never becomes allow/);
  });

  it('observeCapabilities refuses to fabricate facts through the shim', async () => {
    const adapter: HostAdapter = compatAdapterToHostAdapterV2('claude', legacyAdapter());
    await expect(adapter.observeCapabilities()).rejects.toThrow(/cannot fabricate capability facts/);
  });

  it('runCanary never certifies live capability without native evidence', async () => {
    const adapter: HostAdapter = compatAdapterToHostAdapterV2('claude', legacyAdapter());
    const receipt = await adapter.runCanary({ capability: 'sandbox' });
    expect(receipt.certified).toBe(false);
    expect(receipt.failure_reason).toMatch(/cannot certify/);
  });

  it('remove/rollback/upgrade map onto legacy lifecycle actions', async () => {
    const adapter: HostAdapter = compatAdapterToHostAdapterV2('claude', legacyAdapter());
    const remove = await adapter.applyLifecycle(await adapter.planLifecycle('Remove'));
    expect(remove.action).toBe('Remove');
    expect(remove.applied).toBe(true);
    const upgrade = await adapter.applyLifecycle(await adapter.planLifecycle('Upgrade'));
    expect(upgrade.action).toBe('Upgrade');
    expect(upgrade.applied).toBe(true);
  });

  it('the shim refuses to load after the declared expiry', () => {
    expect(adapterShimExpired(new Date('2028-01-01T00:00:00.000Z'))).toBe(true);
    expect(adapterShimExpired(new Date('2026-01-01T00:00:00.000Z'))).toBe(false);
    expect(Date.parse(ADAPTER_CONTRACT_EXPIRY)).toBeGreaterThan(Date.parse('2026-12-31T00:00:00.000Z'));
  });
});
