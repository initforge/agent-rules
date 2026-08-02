# LIVE STEER — ADOPT AM-0020 WITHOUT RESTARTING AM-0019 WORK

Nói và cập nhật bằng tiếng Việt. Đây là owner amendment mới được chốt trong lúc
AM-0019 đang chạy. Không restart từ zero, không discard accepted work, không
reset/clean và không dừng ở review/report trung gian.

## Immediate action

1. Cho lệnh test/build non-mutating đang chạy hoàn tất và lưu raw output.
2. Tạm giữ M11 terminal decision. Không phát `HV3_M11_LOCAL_COMPLETE` và không
   dùng năm final reviews theo contract cũ làm terminal proof.
3. Nếu final reviewers cũ đã được dispatch, không hủy mù: cho chúng trả receipt,
   giữ chúng làm candidate evidence, nhưng đánh `PENDING_AM0020_REVALIDATION`.
4. Checkpoint current integration HEAD, DAG, running/finished assignments,
   candidate evidence và next safe action atomically.
5. Đọc đầy đủ, verify raw bytes và adopt:

```text
.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0020-epistemic-integrity-adversarial-review-and-truthful-reporting.md
.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/lineage/am0020-capture.json
```

Expected immutable hashes:

```text
original
c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31

AM-0019
074eda76c69d91b91bf25ab74888dc7ada13376cbfd29d0e67e4a8c6f8662a21

AM-0020
f99e603c2e9c60194518938f78de4ab90645eb02d893f2ef811b436c444ee0cc

prior effective identity at owner capture
1d524a2706c1bb9c2aa19945de1197015bbbbc4ce7ef54cb0a37ef54f5ca4c27
```

HEAD/revision may have advanced after capture; filesystem/Git/ledger is current
ground truth. Immutable original/AM hashes may not change.

## Activation

- Main remains orchestration-only and does not author source/test.
- Dispatch a bounded activation writer to append AM-0020 after AM-0019 through
  the canonical atomic engine API.
- Independent read-only lifecycle reviewer verifies original/amendment identity,
  atomic persistence, stale propagation, shadows and fresh-process reopen.
- Recompute effective identity and retain `NEEDS_REMEDIATION`.
- Mark prior review/terminal eligibility stale under AM-0020 while preserving raw
  receipts and historical findings.
- No AM-0020 product-source wave begins before lifecycle `ACCEPT`.

## Continue with the new review architecture immediately

Compile M11-R27 through M11-R36 into the effective requirement/claim graph and
run them as cross-stage clusters, not a sequential phase:

1. Claim semantics registry and exact ready/terminal formulas.
2. Immutable candidate epoch plus evidence provenance/freshness DAG.
3. Evidence semantic/capability validator.
4. Risk-tiered reviewer assignments and independence receipts.
5. Adversarial counterexample compiler and domain profiles.
6. Cross-artifact consistency validator.
7. Machine terminal-report compiler.
8. Control Plane truth/calibration views.
9. Tier-A adapter capability/reviewer enforcement.
10. Mini TOEIC/POS Ops-derived false-green and false-reject controlled fixtures.

Use AM-0019 native swarm behavior:

- Dispatch 6–8 conflict-free children immediately when safe READY work exists.
- Run schema/engine, adversarial fixtures, adapter enforcement, Control Plane and
  documentation work concurrently after their real dependencies are satisfied.
- Use isolated branches/worktrees and semantic leases.
- One integration owner only.
- Reviewers are read-only, different session from writer and review exact stable
  candidate snapshots.
- Keep browser/Compose slots pooled; do not spawn duplicate Chrome/MCP bundles.

## Reviewer rules that now apply

- Worker receipt is never a final verdict.
- Reviewer may emit only `ACCEPT_SCOPE`, `NEEDS_REPAIR`, `REJECT_EVIDENCE`,
  `REVIEW_CONFLICT` or `CAPABILITY_MISSING`.
- Reviewer performs blind threat/probe pass before reading worker verdict.
- No-vision reviewer cannot PASS visual/taste.
- Playwright-only proof cannot PASS raw CDP.
- Wrong reference/target state, stale evidence or candidate mismatch invalidates
  the claim regardless of artifact count.
- T2 business/auth requires independent specialist + adversarial probe.
- T3 finance/concurrency/security/migration/release requires two independent
  reviewers with at least one strong/different-provider reviewer.
- Final specialist reviews run in parallel, followed by one blind adversarial
  challenger. Spawn an adjudicator only for unresolved `REVIEW_CONFLICT`.
- Consolidate findings into one root-cause repair pack; do not repair/review one
  minor finding per round.
- Review conflict or missing capability blocks only affected claim closure; all
  other READY work continues.

## Evidence and terminal rules

All terminal evidence must bind one immutable candidate epoch containing source
tree, artifact/container digests, dependency/migration/environment/fixture and
topology hashes. A change after review stales dependent evidence.

The engine must reject:

- test count/report/ledger mismatch;
- warning claimed fixed but present in raw logs;
- partial/skipped/high-diff/unverified hidden by aggregate PASS;
- review without required capability or independence;
- evidence produced before the final fix/artifact;
- mutable/untracked build-critical candidate;
- CDP claim without real CDP session;
- parity claim without exact REF/TGT state binding;
- LLM-written terminal marker.

Final report must be compiled by engine from canonical claims/evidence/reviews.
Main only explains the packet in Vietnamese and cannot upgrade status.

## Do not stop

Do not stop for context pressure, a review rejection, provider failure, pending
CI, capability wait, milestone, elapsed time or owner “review first”. Checkpoint,
compact/resume, repair, reroute or wait only the affected closure and keep the
ready queue full.

Continue until all R01–R36 are `MATCH` or approved `SUPERSEDED`, every required
review/evidence is fresh on the final candidate, and the engine truthfully emits:

```text
HV3_M11_LOCAL_COMPLETE
```

Keep the AM-0019 boundary: certified local `main` may be fast-forwarded, but do
not push remote and do not delete any branch/worktree before later owner approval.

Your next status update should contain only:

```text
AM-0020 hash verification
activation/review status
current HEAD and effective identity
safe capacity and active child roles
R27–R36 READY/RUNNING/WAITING graph
which old reviews were retained as candidate evidence
```

Do not ask whether to proceed.
