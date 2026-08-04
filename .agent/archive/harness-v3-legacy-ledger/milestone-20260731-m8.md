# MILESTONE_8_ACCEPTED — 2026-07-31

## Plan ID
`agent-rules-harness-v3-rearchitecture-20260726-r1`

## Integration branch
`integration/m8-convergence`

## Clean HEAD
`88d1d7af0d1919a04af8f2bf748cb5cf71eec4ee`

## Commits
- `00b88fb fix(m8): converge opencode selector, browser diagnostics, package smoke`
- `88d1d7a fix(evidence): reconcile ledger r53 to canonical identity ddb68fa`

## Verified hashes
- Original plan: `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`
- Effective identity: `ddb68fa53706436f75f46e8b31906137df745fd40d60f1df54c038cd55f7a427`
- Ledger revision: 53 (shadow_revision=53, execution_state=NEEDS_REMEDIATION)
- Artifact manifest: `88dbb721f301321e3019674dd2a69ed605d070d4f132068a92dfd5ce2a0085f2`
- M8 packet: `.agent/evidence/m8-packet-88d1d7a.json` (validates PASS)

## M8 gates
1. ✅ Single clean HEAD 88d1d7a; worktree clean
2. ✅ Duplicate-selector gate PASS (automation/test-native-agent-policy.py)
3. ✅ Source/build/manifest/install parity PASS (opencode artifact, __user_mapped__ policy-rendered selector)
4. ✅ Package smoke PASS (install → doctor → update → rollback → reinstall; bound to HEAD + artifact hash)
5. ✅ Browser QA real 31/31 ×2, console/network clean, axe critical/serious = 0
6. ✅ Independent reviews ACCEPT (R1 runtime/build/selector; R2 installer/fs/security F1+F2 closed; R3 browser/evidence)
7. ✅ Ledger/shadows fresh: r53, identity ddb68fa, 7/7 shadow hashes match
8. ✅ M8 packet binds exact HEAD; validate + test-m8 PASS
9. ✅ No open Critical/High finding
10. ✅ Full gates: build PASS, typecheck PASS, tests 299+262+217+1142 PASS

## WAITING_EXTERNAL (correctly classified, not blockers)
- Native host/provider model observation (`observedModel=null`, attestation UNVERIFIED)
- Native runtime attestation for opencode host delivery
- Authenticated worker-secondary receipt (packet-level, external signing)
- Native session-model observation on all 5 certified hosts
