import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeCanonicalEffectivePlanIdentity, computeLegacyEffectivePlanSha256 } from '../src/plan-identity.js';
import ledger from '../../../.agent/ledger/agent-rules-harness-v3-rearchitecture-20260726-r1.json' with { type: 'json' };

const sha = (value: string) => createHash('sha256').update(value).digest('hex') as `${string}`;
const original = sha('immutable original');
const amendments = Array.from({ length: 17 }, (_, index) => index + 1).filter(number => number !== 4).map(number => ({ amendment_id: `AM-${String(number).padStart(4, '0')}`, sha256: sha(`AM-${number}`) }));

describe('canonical effective-plan identity', () => {
  it('covers future approved amendments without a stale ceiling and preserves input', () => {
    const before = JSON.stringify(amendments);
    const identity = computeCanonicalEffectivePlanIdentity(original, amendments);
    expect(identity.sha256).toBe(sha(identity.canonical));
    expect(identity.canonical).toContain('AM-0017');
    expect(JSON.stringify(amendments)).toBe(before);
  });

  it('matches the current canonical AM-0017 ledger vector', () => {
    const identity = ledger.effective_plan_identity;
    expect(computeCanonicalEffectivePlanIdentity(identity.input_manifest.original_plan_sha256, identity.input_manifest.approved_amendments).sha256).toBe('e08dd77f091018755e80a56fa493a430d34c316a32726b9768c22e207e1584bc');
  });

  it.each([
    ['gap', amendments.filter(a => a.amendment_id !== 'AM-0015')],
    ['order', [amendments[1], amendments[0]]],
    ['duplicate', [amendments[0], amendments[0]]],
    ['malformed', [{ ...amendments[0], amendment_id: 'AM001' }]],
    ['invalid hash', [{ ...amendments[0], sha256: 'G'.repeat(64) }]],
  ])('rejects %s', (_name, value) => expect(() => computeCanonicalEffectivePlanIdentity(original, value)).toThrow());

  it('keeps legacy migration explicit and divergent', () => {
    expect(computeLegacyEffectivePlanSha256(original, amendments.slice(0, 7).map(a => a.sha256))).not.toBe(computeCanonicalEffectivePlanIdentity(original, amendments.slice(0, 7)).sha256);
  });
});
