# portable-host-native-supervision-v1 — Portable Host-Native Supervisory Evolution v1

Successor to `terminal-harness-convergence-v1`. The frozen verbatim contract is
`original.md` (sha preserved in `current.json`). This file is the canonical
mapping artifact: it binds every finding F01-F16 and phase P0-P8 to the domains,
problem families, the Terminality Gap and the Root-Cause Gap, and to the terminal
acceptance gates in section L of the frozen contract.

## 0. Non-negotiable invariants (from AGENTS.md + original §B/§L)

1. Preserve raw user intent and stable requirement/claim/task traceability.
2. Workers never author PASS; completion is derived from verifier evidence and acceptance audit.
3. Never weaken, skip, delete, or hard-disable verification to make a run green.
4. Stay inside owned scope; forbidden-scope edits fail closed.
5. Repair is bounded; missing business/source truth becomes BLOCKED/needs-user, not invention.
6. Strong planners compile/repair contracts for S2/S3 or real ambiguity, then exit.
7. Subagents default to zero; max two, no recursion, only independent work.
8. Do not delete proven legacy behavior until replacement has behavioral/eval parity.
9. Adaptive minimal-proof testing is always-on.
10. Canonical acceptance target is arbitrary consumer repositories; `agent-rules` is source + dogfood.
11. No Domain 14, no named-project hard-code, no model/provider override, no global managed MCP, no hand-edit of `generated/`.

## 1. Canonical truth reopen (F01, REQ-001)

The current pointer (generation 33) self-reports terminal PASS with a stale final
SHA (`1ecb8fd...`), an invalid `activation_state: DEACTIVATED_TERMINAL`, and an
exact-SHA CI failure. Per fail-closed semantics this state is invalid/stale, not
PASS.

- The successor pointer opens at generation 34 with a schema-valid active state.
- Old plan ledger is reclassified `SUPERSEDED/INACTIVE/PARTIAL` by a GENERIC
  correction driven by pointer/ledger/CI-evidence facts, never a hard-coded plan id.
- The previous closure contract and plan-local support artifacts are retired; this
  pointer becomes the only active plan source.

## 2. One terminal authority (F02/F03, REQ-002/REQ-003)

- `TrustedTerminalDecision` is the single type consumed by `run`, `drain`, queue
  runner, `close`, `closeout`, `certify`, release automation and every renderer.
- `northStarRun()` returns an aggregate carrying `trusted_outcome`; the CLI never
  infers success from result shape.
- Exit 0 and the words "DONE/completed" are produced ONLY from trusted PASS.
- `stageClosureTransaction()` always derives terminal outcome from real
  ledger/evidence/reconciliation/proof identities; callers cannot override.
- Public closure composes attest (exact candidate SHA/manifest/evidence) ->
  deactivate (only after PASS) -> compact (after durable attestation).
- Pending evidence yields PARTIAL; empty/mismatched evidence never closes PASS.

## 3. Host-native supervisory evolution (F09/F10/F11, REQ-009/REQ-010/REQ-011)

- `platform-contracts.json` becomes the single canonical host registry v2 with
  eight canonical HostIds; all automation, schemas, doctor, installer, docs,
  fixtures and CI derive from it. Independent host arrays and stale Mimocode
  references are removed.
- One `HostAdapter` contract (discover/inspectProjection/planLifecycle/
  applyLifecycle/observeCapabilities/mapRequirement/runCanary) is shared by CLI
  runtime and `platforms/*/adapter.ts`; duplicate contracts merge behind a
  time-boxed compatibility shim.
- `HostCapabilityFacts` are per-capability, typed, fingerprint-bound, with
  five-identity certification, TTL/expiry and selective staleness. Fingerprint
  changes re-probe immediately and stale only dependent capabilities.
- Enforcement order: native hard permission/guard/sandbox -> Agent Rules broker ->
  isolated worktree transaction + diff validation -> BLOCKED/UNSUPPORTED.
  `UNKNOWN` never becomes allow.
- Two new native integrations (REQ-014/REQ-015): DeepSeek Harness via Cordis
  bundle/profile lifecycle; Command Code via session-scoped mods/skills/native
  permissions/structured events, with mod/hook failures failing closed.

## 4. Production wiring of existing primitives (F04-F08, REQ-004-REQ-008)

- Proof Router (planProofRoute/completeProofRoute) selects before execution;
  runtime/resume/install run only selected verifiers and record omitted reasons.
- Decision Fabric becomes production authority; legacy `routeSkills()` is deleted
  after shadow parity.
- MCP idle-zero attestation is distinct from cleanup confirmation; receipt-write
  errors fail closed as terminal BLOCKED.
- Artifact Admission, Resource Lanes and `decideEnforcement()` are called at
  actual operational write/run/install boundaries.
- `compileDoD()` derives from requirements/claims/proof obligations and
  release/migration/live scope, independent of execution disposition.

## 5. Context economy and plannerless intake (F12/F13, REQ-012/REQ-013)

- `ContextBudgetReceipt` per run measures installed graph size, actual
  model-visible rule/skill/tool/MCP/subagent schema and input tokens with
  measurement source; inactive/cold/unused context is excluded.
- `IntakeDecision` classifies EXPLICIT / DISCOVERABLE / SEMANTICALLY_AMBIGUOUS;
  only the last may invoke a configured strong planner; otherwise
  `NEEDS_USER/PLANNER_REQUIRED`.

## 6. Domain coverage map

| Domain | Finding/Requirement | Phases |
|---|---|---|
| A. Plan lifecycle & terminality | F01/F02/F03 REQ-001/002/003 | P0 |
| B. Root-cause planning | causal map, no symptom-only fix | P0/P2 |
| C. Worker autonomy | F02/F13 REQ-002/013, plannerless intake | P0/P6 |
| D. Verification/evidence/closure | F03 REQ-003, compose attest/deactivate/compact | P0/P1 |
| E. Skills Fabric | F05 REQ-005 Decision Fabric authority | P1/P4/P6 |
| F. Rules/Skills/Policies/Profiles | F10 REQ-010 single adapter contract | P1/P4 |
| G. MCP & capabilities | F06 REQ-006 idle-zero fail-closed | P1/P7 |
| H. Context/intent/handoff | F08/F12/F13 REQ-008/012/013 | P1/P5/P6 |
| I. Host adapters | F09/F10/F11/F14 REQ-009/010/011/014/015 | P1-P4/P7 |
| J. Resource & speed | F04/F12 REQ-004/012 context economy | P1/P5 |
| K. Security/trust | F11/F14 REQ-011/014/015 enforcement + staleness | P1-P3/P7 |
| L. Artifact/compaction/GC | F03 REQ-003 compact after attest | P0/P8 |
| M. Evals/telemetry/retirement | F01/F16 REQ-001/016/017 registry-driven matrix | P0/P7/P8 |

## 7. Problem families

- PF1 MCP idle-zero: REQ-006, G1 no-MCP/concurrency/crash.
- PF2 deterministic output: G2 negative fixtures, no named-project hard-code.
- PF3 cross-host enforcement: REQ-010/011/014/015 native/broker/worktree paths.
- PF4 dogfood/one-copy: candidate harness used from P0; generic empty-context worker at P6.
- PF5 lifecycle/artifacts: REQ-003/007/018 fresh/stale/resume/reopen proofs.
- PF6 release completion: REQ-016/022/023 exact package/install/live/closure/CI.

## 8. Terminality Gap

Addressed only at the single authority (REQ-002/REQ-003). Renderer exit-code
patches that bypass closure/release/attestation/deactivation are forbidden.

## 9. Root-Cause Gap

Every load-bearing fix keeps the causal chain:

`canonical harness semantics -> capability requirement -> native mapping/enforcement ->
package/install/migration -> arbitrary consumer behavior -> fresh/upgraded
observation -> bound proof`.

Named projects (including `agent-rules` and `5fedu`) are optional regression
fixtures only.

## 10. Forbidden changes (original §H/§L)

No domain 14; no hard-coded named consumer; no harness provider/model override; no
weakened verification; no static-doc-as-live-cert; no overwrite of project/user
config; no global managed MCP; no hand-edit of `generated/`; no branch/PR/
intermediate push; no deletion of tags or unique remote work unless proven safe;
no removal of proven legacy behavior without behavioral/eval parity.