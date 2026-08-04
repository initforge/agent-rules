# M8 ledger rescue receipt

Date: 2026-07-30
Workspace: `/home/linhnx/Projects/agent-rules-supervisor-wave`
Branch: `integration/harness-v3-certified`
Observed HEAD: `8e74049d9c36b4b927d3b6e12e43ae428d648c23`

## Raw-byte rescue

The integration worktree's small test fixture was quarantined under
`quarantined-fixture/` and is not accepted evidence. The canonical artifacts
were copied byte-for-byte from `/home/linhnx/Projects/agent-rules/.agent`:

- `original.md`: 31,085 bytes,
  `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`
- AM-0001..AM-0003, AM-0005..AM-0015 were restored with their source SHA-256
  values in `shadow/amendments.md`.
- AM-0012 capture: `fabab819fe966f6c84b449275e5ce03e1892a9a7d42b1ece3043dcbb800036cb`
- AM-0013 capture: `15350d19c2e4da4c8ae9344f4fb6ac429f3ef97ae974acd5bd830792cfc52c1d`
- AM-0014 capture: `5b765620342b7b431a9bb381973ef597842584aa419471b3d8b5ba536e901afb`
- AM-0015 capture: `e7d19f2ca572ea7b4ce330bc8b9e46f96add046cb9818914a99658c642a5a7cc`
- Rescued ledger: `10288e3cb7550762148f6a3c9923fecad138d9939671891afd671697c920f9a5`

The rescued ledger is explicitly `status=ADOPTED`,
`execution_state=NEEDS_REMEDIATION`, revision `50`, with zero attestations
and zero CI checks. No host, HEAD, CI, or terminal PASS was fabricated.

## Verification

- Original and ledger hashes match the source-of-truth workspace exactly.
- All seven rescued shadow projections match the ledger's `shadow_hashes`.
- Existing `verifyTerminalGate` was run against the current HEAD and real bytes.

The terminal gate remains intentionally blocked:

- `WORK_LEDGER_VALID`: the legacy rescued ledger has `original_plan`, while the
  current canonical gate requires `plan.original`/`original_artifact`.
- `CERTIFICATION_ATTESTATION`: no native attestations are present.
- `EXECUTION_STATE_COMPLETED`: state is `NEEDS_REMEDIATION`.
- `RECONCILIATION_BINDS_HEAD` and `HEAD_MATCH`: no HEAD binding is present.
- `GITHUB_CI_PASSED`: no CI checks are present.

Passing observations: original bytes are intact, all 35 plan anchors exist,
amendment-chain evidence is present, shadow hashes match, and no finding has
an `OPEN` status in the rescued ledger.

No engine API currently converts this legacy `original_plan` ledger into the
canonical `plan.original` WorkLedger contract without authoring a new schema
adapter. Per policy, no manual schema invention was performed. This is an
honest `NEEDS_REMEDIATION` checkpoint, not a certification.
