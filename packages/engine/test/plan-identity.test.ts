import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCanonicalEffectivePlanIdentity, computeLegacyEffectivePlanSha256 } from '../src/plan-identity.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex') as `${string}`;
const repo = resolve(import.meta.dirname, '../../../');
const ledgerPath = resolve(repo, '.agent/ledger/agent-rules-harness-v3-rearchitecture-20260726-r1.json');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
  original_plan: { path: string; sha256: string };
  amendments: Array<{ amendment_id: string; path: string; sha256: string }>;
  effective_plan_identity: { input_manifest: { original_plan_sha256: string; approved_amendments: Array<{ amendment_id: string; sha256: `${string}` }> }; sha256: `${string}` };
};
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

  it('matches canonical AM-0017 and AM-0018 source/ledger identities', () => {
    const manifest = ledger.effective_plan_identity.input_manifest;
    const originalBytes = readFileSync(resolve(repo, ledger.original_plan.path));
    expect(sha(originalBytes.toString('utf8'))).toBe(manifest.original_plan_sha256);
    for (const amendment of ledger.amendments) {
      expect(sha(readFileSync(resolve(repo, amendment.path)).toString('utf8'))).toBe(amendment.sha256);
    }

    const through17 = manifest.approved_amendments.filter(amendment => amendment.amendment_id !== 'AM-0018');
    expect(computeCanonicalEffectivePlanIdentity(manifest.original_plan_sha256, through17).sha256).toBe('e08dd77f091018755e80a56fa493a430d34c316a32726b9768c22e207e1584bc');
    expect(computeCanonicalEffectivePlanIdentity(manifest.original_plan_sha256, manifest.approved_amendments).sha256).toBe(ledger.effective_plan_identity.sha256);
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
