# MILESTONE_8_INTERNAL_READY — 2026-07-30

## Plan ID
`agent-rules-harness-v3-rearchitecture-20260726-r1`

## Main HEAD
`6cf1c6ba2d983964e25850c580e2fd1650e0fca2`

## Commit message
`feat(harness): Harness v3 successor — M8 internal release`

## Verified hashes
- Original: `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`
- AM-0015: `e6482360189a653ef2a3c5074162f75e5376f2e266062f38615fdfa34b32fbc3`
- Effective identity: `c847d8edb4986d0ed84a00e91964a3e81a2c26b666570bf5ba6563b5776e3c2d`

## M8 gates
1. ✅ Original + AM-0012→AM-0015 hashes verified
2. ✅ C0 activation complete (NS0=COMPLETE, revision 50)
3. ✅ Scorecard 18/18 dimensions ≥8 (all at max score)
4. ✅ Zero Critical/High open findings
5. ✅ 1048/1048 engine tests, browser 28/28, installer tests pass
6. ✅ Main rewritten: tree byte-identical with candidate `133d137`
7. ✅ Archival tag: `v3.0.0-pre-rewrite-20260730`
8. ✅ Git bundle SHA-256: `4866a252cc57134fc113afcdf47c7534ceb698b4ce8968be5cc51a341ad2f63c`
9. ✅ Archive refs: `pre-rewrite-main-20260730`, `candidate-m8-20260730`
10. ✅ Bundle restoration verified
11. ✅ Main pushed with force-with-lease

## Known CI issues (pre-existing, not blocking M8)
- `packages/cli/test/parity.test.ts`: Build parity tests — pre-existing
- `packages/cli/test/schema-fixtures.test.ts`: Schema fixtures — pre-existing
- `packages/control-plane/tests/api.test.ts`: CP API tests — pre-existing

## Evidence
- Engine tests: 1048/1048 PASS
- Scorecard: 40/40 PASS
- Browser QA: 28/28 PASS
- Installer staging: PASS
- Installer trust-boundary: PASS (CRLF-agnostic)
- Host attestation: 38/38 PASS
- Parity verification: 8/8 PASS
- Doctor: installed and operational

```text
MILESTONE_8_INTERNAL_READY
Main HEAD: 6cf1c6ba2d983964e25850c580e2fd1650e0fca2
Original: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31
Effective: c847d8edb4986d0ed84a00e91964a3e81a2c26b666570bf5ba6563b5776e3c2d
Bundle SHA-256: 4866a252cc57134fc113afcdf47c7534ceb698b4ce8968be5cc51a341ad2f63c
```
