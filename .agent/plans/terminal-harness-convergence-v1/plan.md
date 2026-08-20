# terminal-harness-convergence-v1 — Canonical convergence plan

Successor to `terminal-harness-vnext`. The frozen verbatim contract is `original.md`
(sha preserved in `current.json`). This file is the canonical mapping artifact: it
binds every requirement to the 13 domains, the 6 problem families, the Terminality
Gap and the Root-Cause Gap.

## 0. Non-negotiable invariants (from AGENTS.md + §1/§7)

1. Preserve raw user intent and stable requirement/claim/task traceability.
2. Workers never author PASS; completion is derived from verifier evidence and acceptance audit.
3. Never weaken, skip, delete, or hard-disable verification to make a run green.
4. Stay inside owned scope; forbidden-scope edits fail closed.
5. Repair is bounded; missing business/source truth becomes BLOCKED/needs-user, not invention.
6. Strong planners compile/repair contracts for S2/S3 or real ambiguity, then exit.
7. Subagents default to zero; max two, no recursion, only independent work.
8. Do not delete proven legacy behavior until replacement has behavioral/eval parity.
9. Adaptive minimal-proof testing is always-on.

## 1. One terminal authority

Converge the existing reducers in Evidence Ledger, acceptance audit, convergence and
Closure Service into a single authority. Old reducers are deleted or delegated, never
kept with independent semantics.

- `TrustedTerminalOutcome = PASS | PARTIAL | BLOCKED | FAILED | UNSUPPORTED | NEEDS_USER`.
- `PRE-EXISTING` is an evidence/proof status only, never a terminal outcome.
- `TrustedTerminalDecision` carries outcome, unresolved requirements, reason codes, bound
  evidence, and the five gates: `release_eligible`, `closure_eligible`,
  `attestation_eligible`, `deactivation_eligible`, `compaction_eligible`.
- Fail-closed order: FAILED → NEEDS_USER → BLOCKED → UNSUPPORTED → PARTIAL → PASS.
- Exit 0 and the words "DONE/completed" are produced ONLY from PASS. Diagnostic/status/
  prepare succeed but render PREPARED/STATUS.
- `north-star run`, queue runner, `close`, `closeout`, `certify`, release automation and
  the result renderer ALL consume the same `TrustedTerminalDecision`.

## 2. Identity and trust (five bindings)

Every proof/closure/install receipt binds five identities:
1. Harness release/tree/package.
2. Installed projection.
3. Consumer repository.
4. Consumer candidate.
5. Host runtime/session/capability.

Cross-repo, cross-package, stale projection or stale candidate replay MUST fail.

## 3. Disposition / Definition of Done

- `ExecutionDisposition` only decides `PLAN_ONLY | EXPORT_HANDOFF | LOCAL_EXECUTE`.
- `CompiledDoD` compiled independently from claims, risk, release/install/migration/live
  scope and terminal obligations. `EXPORT_HANDOFF` keeps full CODE/BEHAVIOR/RELEASE/
  TERMINAL. FAST/NORMAL/HIGH-ASSURANCE are policies in one runtime, not three pipelines.
- Default no subagent; max 2; repair max 2; timeout max 1h unless narrower contract.

## 4. Proof / skill / persistence / resources

- Split Proof Router into `planProofRoute()` (before execution) and `completeProofRoute()`
  (after). Only selected verifiers run; omitted proofs carry reason + invalidation condition.
- Skill authority: explicit request + RepoFacts + TaskFacts + phase + claim class + impact +
  risk + observed diff. Phrase is a hint; default no skill.
- Artifact class not decided solely by `evidence_required`; EPHEMERAL keeps minimal durable
  terminal evidence without turning all support state into AUDITED.
- Lane controller: `read_search`, `research`, `writer`, `browser`, `verifier`, `mcp`,
  `heavy_process`. Writer always serializes; expensive lanes shrink before pressure.
- MCP idle-zero = no harness-owned process/socket/lease/advertised provider/orphan/schema
  exposure. CPU/RSS only recorded with PID attribution; otherwise `NOT_APPLICABLE`.

## 5. UX

Normal PASS and NEEDS_USER templates exactly as §3. Receipt IDs, 13-domain matrix and
lifecycle internals appear only in diagnostic mode.

## 6. 13-domain coverage map

| Domain | Proof | Phases |
|---|---|---|
| A. Plan lifecycle & terminality | unified pointer/ledger/closure/public decision | P0/P1/P7 |
| B. Root-cause planning | causal map, no symptom-only fix | P0/P2 |
| C. Worker autonomy | one-copy, repair budget, early-stop rejection | P2/P6 |
| D. Verification/evidence/closure | bound evidence, terminal composition | P1/P3/P6 |
| E. Skills Fabric | typed facts, multilingual, default no skill | P3/P6 |
| F. Rules/Skills/Policies/Profiles | precedence, explicit domain packs | P3/P4 |
| G. MCP & capabilities | lease lifecycle, idle-zero | P5/G1/G3/G4 |
| H. Context/intent/handoff | raw intent traceability, frozen handoff | P0/P2 |
| I. Host adapters | native mapping, install, static/live split | P4/G4 |
| J. Resource & speed | executable lanes, harness-tax ablation | P5/P6 |
| K. Security/trust | identities, secret/effect/scope enforcement | P1/P4/G2 |
| L. Artifact/compaction/GC | admission, crash/resume, compact/archive | P1/P5/P7 |
| M. Evals/telemetry/retirement | generic corpus, ablation, removal parity | P6/P7 |

## 7. Problem families

- PF1 MCP idle-zero: P5 + G1/G3/concurrency/crash.
- PF2 deterministic output/5fedu: G1/G2 negative + explicit 5fedu temp fixture.
- PF3 cross-host enforcement: P4 + G4 native/broker/worktree/unsupported paths.
- PF4 dogfood/one-copy: candidate harness used from P1, generic empty-context worker at P6.
- PF5 lifecycle/artifacts: P1/P5 + fresh/stale/resume/reopen proofs.
- PF6 release completion: exact package/install/live/closure/local/remote CI at P7/P8.

## 8. Terminality Gap

Addressed only at the single authority. Renderer exit-code patches that bypass
closure/release/attestation/deactivation are forbidden.

## 9. Root-Cause Gap

Mandatory causal map for every load-bearing defect:
symptom → canonical authority → host-neutral semantics → host mapping →
install/migration → consumer observation → proof.
Project-local fixes are NOT accepted as global remediation.

## 10. Forbidden changes (§7)

No domain 14; no hard-coded named consumer; no harness provider/model override; no
weakened verification; no static-doc-as-live-cert; no overwrite of project/user config;
no global managed MCP; no hand-edit of generated/; no branch/PR/intermediate push;
no deletion of tags or unique remote work unless proven safe; no operator toil that
the harness can self-perform.
