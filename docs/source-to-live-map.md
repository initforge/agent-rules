# Source-to-Live Behavior Map (Reconciled Baseline)

## 1. Executive Summary

This document establishes the canonical mapping between the repository source components, their proven behaviors, production callgraphs, runtime boundaries, execution authorities, and known unknowns for **Agent Rules Evolutionary vNext** (Phase P0 baseline).

### Epistemic Taxonomy
- `FACT`: Verified by live execution, cryptographic hash chain, or reproducible deterministic test.
- `INFERENCE`: Logically derived from facts without direct unconstrained runtime proof.
- `HYPOTHESIS`: Proposed architectural change requiring empirical proof before acceptance (default: `KEEP` or `DEFER`).
- `UNKNOWN`: Unverified fact; blocks destructive changes and must fail closed.

### Current Status
- **Phase P0 Implementation**: **CANDIDATE / PROVISIONAL** (in-process contract & firewall baseline proven; end-to-end installed distribution and runner composition pending P1/P2).
- **Phases P1–P8**: **NOT AUTHORIZED FOR IMPLEMENTATION YET.**

---

## 2. Component Ownership, Callgraph & Proven Behavior Map

| Path | Owner | Purpose | Proven Baseline Behavior (`FACT`) | Production Callgraph / Live Seam | Status / Notes |
|---|---|---|---|---|---|
| `packages/cli/src/commands/northstar-ux.ts` | harness-maintainer | Public North-Star UX & entrypoints | Preserves intent, loads config, compiles S0/S1 direct contracts or invokes strong planner for S2/S3 | CLI `agent-rules run` → `northStarRun()` | Authoritative CLI coordinator |
| `packages/kernel/src/northstar/runtime.ts` | harness-maintainer | Canonical North-Star runtime engine | Coordinates WorkSpec, invokes Runner, manages ProofRouter, EvidenceLedger, AcceptanceAudit, LaneController, Convergence | `executeNorthStarRun()` → `Runner.run()` in `packages/kernel/src/runner/loop.ts` | Authoritative runtime engine |
| `packages/engine/src/northstar/` | harness-maintainer | Compatibility facade | Re-exports all kernel northstar modules | Delegating facade | Preserved for backward compatibility |
| `packages/kernel/src/northstar/evidence-ledger.ts` | harness-maintainer | Append-only evidence ledger & acceptance reducer | Hash-chained envelope validation (`read`, `append`), runtime binding verification, multi-channel oracle deduplication | `deriveAcceptance()`, `EvidenceLedger` | Worker prose cannot author PASS |
| `packages/kernel/src/northstar/acceptance-audit.ts` | harness-maintainer | Semantic acceptance auditor | Validates intent coverage, semantic reviews, traceability, mandatory claim evidence | `auditAcceptance()` | Never upgrades deterministic failure |
| `packages/kernel/src/northstar/closure-transaction.ts` | harness-maintainer | Atomic plan closure | Residue hashing, requirement disposition (`promote`/`retire`), closure integrity gates | `assertClosureIntegrity()`, `closureResidue()` | Fails closed on missing evidence |
| `packages/kernel/src/northstar/closure-service.ts` | harness-maintainer | Staged closure workflow | Stage, commit, correction, operational ignores | `stageClosureTransaction()`, `commitClosureTransaction()` | Preserves project-owned instructions |
| `packages/kernel/src/northstar/host-capabilities.ts` | harness-maintainer | Host capability probing & enforcement | Probes host capabilities, resolves enforcement layer (`native` -> `broker` -> `worktree` -> `blocked`) | `probeHostCapabilities()`, `decideEnforcement()` | Fails closed on unknown hosts |
| `packages/kernel/src/northstar/host-canary.ts` | harness-maintainer | Host canary & selective invalidation | Canaries 8 registry hosts, invalidates stale projection certs | `runHostCanary()`, `staleCertifications()` | 8 registry hosts canonical |
| `packages/kernel/src/northstar/mcp-lifecycle.ts` | harness-maintainer | MCP lifecycle & idle-zero enforcement | Leases, state transitions, idle-zero assertion | `transitionMcpState()`, `assertIdleZeroReceipt()` | Rejects orphaned MCP processes |
| `packages/kernel/src/northstar/proof-router.ts` | harness-maintainer | Adaptive minimal-proof router | Selects minimal sufficient verifiers, logs omitted proofs | `routeProof()`, `filterVerifiersByProofRoute()` | Optional caller; promoted in P3 |
| `packages/kernel/src/northstar/context-budget.ts` | harness-maintainer | Model-visible context accounting | Context token estimation across rules, skills, tools, MCP | `buildContextBudgetReceipt()` | Measured token budgets |
| `packages/kernel/src/northstar/artifact-admission.ts` | harness-maintainer | Artifact class admission & retention | Classifies `EPHEMERAL`, `CHECKPOINTED`, `DURABLE`, `PROJECTION` | `admitArtifact()`, `classifyArtifact()` | Prevents artifact sprawl |
| `platforms/` | harness-maintainer | Host platform adapters | Host-specific hook projections for Codex, Claude, OpenCode, Grok, Antigravity, Cursor, DeepSeek Harness, Command Code | Host launch & hooks | Tier-based verification |
| `skills/` | harness-maintainer | Domain capabilities | 34 materialized skills + catalog + references | `skills/catalog.json`, `platforms/shared/scripts/context-router.py` | 34 skills preserved (default KEEP) |
| `rules/` | harness-maintainer | Core harness rules | Always-on invariant rule files | `rules/manifest.yaml` | 13 rules preserved (default KEEP) |
| `evals/` | harness-maintainer | Conformance, telemetry & benchmarks | Quality benchmark, telemetry collector, outcome tracking, negative controls | `evals/fixtures/` | Multi-dimensional evaluation |

---

## 3. Unified 15-Stage Behavior Spine

1. **`INTENT`**: Preserves raw user intent verbatim in immutable `WorkRequest`.
2. **`RELATION / INTAKE`**: Classifies new, continuation, amendment, supersession, or conflict against active plan pointer.
3. **`FACT DISCOVERY`**: Discovers provenance-bound `RepoFacts` (branch, stack, lockfiles).
4. **`UNCERTAINTY / RESEARCH`**: Strong planner/researcher explores codebase for S2/S3 or material ambiguity; bounds research.
5. **`FROZEN WORK CONTRACT`**: Compiles immutable `WorkSpec` (requirements, claims, owned/forbidden scope, DoD).
6. **`PLAN / HANDOFF`**: Generates self-contained, portable, resumable plan artifact (`plan.md` / `current.json`).
7. **`CONTEXT / SKILL / CAPABILITY`**: Decision Fabric / Router progressively discloses minimal context; keeps MCP idle-zero.
8. **`PRE-EFFECT AUTHORIZATION`**: Native host control first, then broker, isolated worktree, or blocked.
9. **`HOST EXECUTION`**: Headless host executes within authorized scope; runner monitors process tree and timeouts.
10. **`OBSERVATION`**: Captures raw attributed command outputs, diffs, and tool events in durable journal.
11. **`TRUSTED VERIFICATION`**: Independent verifiers produce bound `EvidenceEnvelope` records with hash chain.
12. **`BOUNDED REPAIR`**: Evidence-driven retry loop halts oscillation and prevents proof-weakening.
13. **`TERMINAL AUTHORITY`**: Scoped reducer compiles obligations for `TASK`, `HOST_ADAPTER`, or `RELEASE` (workers never author PASS).
14. **`USER OUTPUT`**: Renders concise operator result; hides machine hashes unless verbose; failure never says "DONE".
15. **`CLEANUP / RETENTION / RESUME`**: Archives residue, updates pointer, and preserves user-owned instructions.

---

## 4. Architecture Hypotheses Status Matrix

| ID | Hypothesis | Baseline Fact | Status | Default Policy |
|---|---|---|---|---|
| `H-01` | Collapse 34 skills to 9 | 34 materialized skills in `skills/` | `HYPOTHESIS` | `KEEP` |
| `H-02` | Collapse 13 rules to 5 | 13 rules in `rules/` | `HYPOTHESIS` | `KEEP` |
| `H-03` | Single-package unification | 4 packages in `packages/` | `HYPOTHESIS` | `DEFER` |
| `H-04` | Retire facades & legacy UI server | engine facades active | `HYPOTHESIS` | `KEEP` |
| `H-05` | Externalize all `.agent` state | `.agent` stored at repo root | `HYPOTHESIS` | `DEFER` |
| `H-06` | Public CLI surface is exactly 8 commands | 5 CLI command source modules remain (install, uninstall, doctor, integration, northstar-ux) | `FACT` | `KEEP` |
| `H-07` | Consolidate all runners to one TS runner | Multiple execution adapters exist | `HYPOTHESIS` | `KEEP` |
| `H-08` | Immediate deletion of shadow mode | Decision Fabric defaults to shadow | `HYPOTHESIS` | `KEEP` |
| `H-09` | Exactly 8 hosts supported | 8 hosts declared in registry | `HYPOTHESIS` | `KEEP` |
| `H-10` | Live-certify DeepSeek & Command Code now | Present on PATH but live permission unconfirmed | `UNKNOWN` | `DEFER` |
| `H-11` | Fixed context reduction target percentage | Context varies widely by task type | `HYPOTHESIS` | `DEFER` |

---

## 5. Known Unknowns & Blocked Actions

1. **Host Live Status**: Cursor, DeepSeek Harness, and Command Code remain `NOT_LIVE_VERIFIED` or `EXPERIMENTAL` until live execution credentials and binaries are verified.
2. **CLI Command Usage**: Specific infrequently used CLI subcommands remain `UNKNOWN` regarding consumer usage; all commands are preserved without premature removal.
3. **Skill Consolidation**: Skill reduction from 34 to any smaller count is an unproven hypothesis (`H-01`); all 34 skills remain active and routed.
4. **Package Topology**: Kernel/Engine/CLI single-package merger is an unproven hypothesis (`H-03`); current monorepo structure is preserved.
5. **Operational State Relocation**: Externalizing `.agent/` state is an unproven hypothesis (`H-05`); current `.agent/` local layout is preserved with operational ignore safeguards.
