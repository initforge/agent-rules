AM-0006 — Three-mode orchestration, supervised OpenCode execution, and main release

Owner-approved additive amendment. Supersedes only original.md lines 28, 561, 820 blanket ban on live cross-host federation.
All other requirements of original + AM-0001 + AM-0002 + AM-0003 + AM-0005 remain in force.
AM-0004 remains absent/tombstoned. No reference to AM-0004 is valid.

Immutable original SHA-256: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31

## 0. Safe activation prerequisite

Before AM-0006 is effective:
1. Verify original SHA-256 c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31.
2. Restore canonical revision-45 history from `.agent/ledger` — never drop prior assignments, findings, receipts, or audit events.
3. Raw-restore AM-0003 (expected SHA-256 9637aa2f50177aa981ee3a2a00d7d5cb51c48bb81e7a5ace9f3a8c158152d9c4) and AM-0005 (expected SHA-256 5a23ce82685729dd0f2be31f559edea54bbe86876f8806666ab4eab5744613a9).
4. Recompute ordered effective-plan identity from original + AM-0001 + AM-0002 + AM-0003 + AM-0005 + AM-0006.
5. Stale every completion claim, review receipt, reconciliation attestation, and certification attestation bound to the drifted chain or old HEAD fa85.
   All prior fa85 completion/MATCH claims are stale and untrusted pending fresh reconciliation. Nothing bound to fa85 survives.
6. Regenerate shadows atomically through engine/CLI canonical path only.
7. Plan enters NEEDS_REMEDIATION; never inherit COMPLETED from any drifted state.

## 1. Three-mode enum (engine/schema/ledger contract)

Exact enum:

```
enum ExecutionMode {
  NATIVE_SUBAGENT
  CODEX_FEDERATED
  ARTIFACT_HANDOFF
}
```

Each assignment record MUST carry:

| Field | Source | Description |
|-------|--------|-------------|
| requested_mode | Prompt/controller | What the dispatcher asks for (may be FORCE) |
| resolved_mode | Engine | What the engine grants (supersedes requested) |
| mode_reason | Engine | Why engine resolved this mode |
| policy_version | Schema | Semver of the resolution policy |
| session_identity | Adapter | Durable session ID, host, model, provider |
| capability_evidence | Adapter | Canonical capability receipt from runtime |
| escalation_history | Engine | Ordered list of prior mode resolutions for this assignment |

Prompt may only request or force a mode. The engine resolves and persists the authoritative mode.
No silent downgrade. Quality beats token cost. NATIVE_SUBAGENT is scarce by policy.

## 2. Mode semantics

### NATIVE_SUBAGENT
- Codex-hosted, sandboxed agent with bounded workspace ownership.
- Used only for: (a) initial audit/architecture boundary, (b) final independent review/certification boundary.
- Middle implementation work uses the other two modes.
- Native subagent must be traceable to a specific agent profile with capability proof.

### CODEX_FEDERATED
- Codex remains controller and supervises durable OpenCode sessions through the real OpenCode local server/SDK API.
- Required capabilities:
  - spawn/create a named, durable OpenCode session
  - async prompt (non-blocking dispatch)
  - event/status cursor with structured polling
  - follow-up prompt on the same session
  - wait with timeout
  - interrupt/abort with receipt
  - resume from saved checkpoint
  - collect normalized untrusted receipt (diff, exit code, logs, artifact hashes)
- One-shot `opencode run` is NOT sufficient for certified federated liveness.
- The OpenCode adapter owns real session integration and activation.

### ARTIFACT_HANDOFF
- Codex prepares an immutable `.agent` bundle (plan anchors, owned/forbidden paths, ACs, budget).
- OpenCode becomes execution primary for that independent run.
- OpenCode may create its own depth-1 Flash workers and read-only Pro reviewers.
- This is NOT a recursive live subagent tree.
- Codex wakes only on: material event, final receipt, or genuine owner/external blocker.
- Flash implements bounded work only.
- Pro reviewer identity differs from worker, is read-only, and never repairs its reviewed diff.

### Promotion rules
Promote from ARTIFACT_HANDOFF to CODEX_FEDERATED on:
- Two identical failure signatures from handoff
- Reviewer disagreement (Pro reviewer vs worker)
- Unverifiable evidence in handoff receipt
- Plan-repo conflict detected post-handoff
- High-risk ambiguity (schema boundary, security path, credential surface)

## 3. Liveness and supervisor

- Worker final text is yield/receipt only — not a completion claim.
- External liveness supervisor (engine-owned) auto-repairs and redispatches until terminal PASS or genuine owner/external blocker.
- Self-solvable residual never asks owner.
- Main agent never edits source.

## 4. Canonical code placement

| Component | Owner | Location |
|-----------|-------|----------|
| Mode resolver | Engine | Extends current public contracts |
| Liveness gate | Engine | Extends current public contracts |
| Session bridge/supervisor | Engine | New bounded module |
| OpenCode session integration | OpenCode adapter | `platforms/opencode/` |
| OpenCode activation | OpenCode adapter | `platforms/opencode/` |
| Short rule/skill surface | Rules/skills | Point to engine only, never own implementation |
| CP read-only observability | Control Plane | Read-only engine state projection |

## 5. Runtime certification requirement

Every certification attestation MUST prove the process loaded concrete:
- Instructions
- Rules
- Behaviors
- Skills
- Model policy
- Runtime bundle

File presence is not evidence. Only runtime probing against known contracts satisfies certification.

## 6. Release authority (supersedes AM-0003/AM-0005 branch stop)

When terminal reconciliation passes:
1. Full reconciliation against original + AM-0001 + AM-0002 + AM-0003 + AM-0005 + AM-0006 (AM-0004 absent/tombstoned).
2. Clean-checkout at exact certified SHA.
3. `ci:quality` + `ci:certify` green on that SHA.
4. Install exact successor artifact; runtime doctor/activation PASS.
5. Five real native host certifications bind that SHA.
6. Push certified SHA to `main` WITHOUT force push.
7. Verify GitHub CI on remote `main`.
8. Delete every local and remote non-main branch; no backup branch.
9. Plan enters COMPLETED.

## 7. Implementation slices (S0–S6)

### S0 — Split-brain CLI/engine removal
Remove any CLI pathway that bypasses engine plan-lifecycle or owns ledger/shadow mutation independently.
Engine is the sole canonical owner of plan lifecycle, mode resolving, ledger, and shadow regeneration.
Test ACs:
- CLI cannot adopt, finalize, or reconcile without engine canonical path.
- CLI shadow generation calls engine exclusively.
- Remove legacy plan path competing with engine owner.

### S1 — Mode resolver
Implement the ExecutionMode enum and resolver in engine/schema.
Test ACs:
- Requested mode vs resolved mode divergence logged with reason.
- Silent downgrade rejected (must be explicit with reason trace).
- NATIVE_SUBAGENT gated to audit/architecture/review boundaries.
- Policy version embedded in every resolution record.

### S2 — Session bridge/supervisor
Implement the liveness supervisor: spawn, poll, wait, interrupt/abort, resume, collect receipt.
Test ACs:
- Supervisor auto-retries on non-terminal failure without owner prompt.
- Terminal PASS detected and receipt collected.
- Genuine blocker escalated with full evidence; no silent loop.
- Self-solvable residual never reaches owner.

### S3 — OpenCode runtime activation
Implement OpenCode adapter in `platforms/opencode/` using real local server/SDK API.
Test ACs:
- Create durable named session returns session identity.
- Async prompt returns status cursor; poll fetches events.
- Follow-up prompt on same session preserves context.
- Interrupt/abort returns receipt with partial work evidence.
- Resume restores and continues.
- Normalized untrusted receipt contains diff, exit code, logs, artifact hashes.
- One-shot run is rejected for CODEX_FEDERATED mode.

### S4 — Three topology integration tests
End-to-end tests for NATIVE_SUBAGENT, CODEX_FEDERATED, and ARTIFACT_HANDOFF topologies.
Test ACs:
- Each topology completes a bounded assignment with evidence chain.
- Promotion from handoff to federated triggers on two identical failures.
- Promotion triggers on reviewer disagreement.
- Promotion triggers on unverifiable evidence.
- Depth limit enforced: handoff workers max depth 1; no recursive live tree.
- Main agent never writes source in any topology.

### S5 — Adversarial robustness
Adversarial test suite for false-final, resume, and promotion edge cases.
Test ACs:
- False terminal receipt detected and re-dispatched.
- Premature COMPLETED claim rejected by liveness gate.
- Resume after interrupt produces consistent continuation.
- Promotion loop terminates (no infinite escalation).
- Mode downgrade by worker rejected by engine.
- Stale review bound to old HEAD flagged and staled.

### S6 — Release pipeline
Implement release authority workflow.
Test ACs:
- Certified SHA push to main without force verified.
- Remote CI passes on main after push.
- All non-main branches deleted; no backup branch retained.
- Plan COMPLETED only after all gates.

## 8. Constraints

- This amendment does NOT claim implementation complete.
- All S0–S6 slices must pass their ACs before final reconciliation.
- AM-0004 references are invalid and rejected by engine validation.
- Tracked source must have zero diff when only these 3 `.agent` files changed.
- Original SHA-256 c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31 is immutable.
