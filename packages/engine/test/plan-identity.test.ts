import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCanonicalEffectivePlanIdentity, computeLegacyEffectivePlanSha256 } from '../src/plan-identity.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex') as `${string}`;
const fixture = resolve(import.meta.dirname, 'fixtures/plan-identity');
const ledgerPath = resolve(fixture, 'ledger.json');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
  original_plan: { sha256: string };
  amendments: Array<{ amendment_id: string; path: string; sha256: string; status: string }>;
  effective_plan_identity: { input_manifest: { original_plan_sha256: string; approved_amendments: Array<{ amendment_id: string; sha256: `${string}` }> }; sha256: `${string}` };
};
const original = sha(readFileSync(resolve(fixture, 'original.md'), 'utf8'));
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
    expect(original).toBe('c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31');
    const manifest = ledger.effective_plan_identity.input_manifest;
    const current = ledger.amendments.at(-1);
    expect(current?.amendment_id).toBe('AM-0018');
    expect(current?.status).toBe('OWNER_APPROVED_EFFECTIVE');
    expect(sha(readFileSync(resolve(fixture, '0018-durable-autopilot.md'), 'utf8'))).toBe(current?.sha256);
    expect(manifest.approved_amendments.at(-1)?.amendment_id).toBe('AM-0018');
    expect(ledger.effective_plan_identity.sha256).toBe('ddb68fa53706436f75f46e8b31906137df745fd40d60f1df54c038cd55f7a427');
    expect(computeCanonicalEffectivePlanIdentity(manifest.original_plan_sha256, manifest.approved_amendments).sha256).toBe(ledger.effective_plan_identity.sha256);
    expect(ledger.effective_plan_identity.sha256).not.toBe('e08dd77f091018755e80a56fa493a430d34c316a32726b9768c22e207e1584bc');
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
