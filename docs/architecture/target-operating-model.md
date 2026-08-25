# Target Operating Model

**Canonical cross-session, cross-model, cross-platform product contract.**

## 1. Zero-touch target experience

```
agent-rules init          # detect repo, OS, platform, profile
agent-rules run "<task>"  # plan: S2/S3 or ambiguous intent is compiled by the configured strong planner, then implement, verify, review
agent-rules doctor        # health check
```

The user states the goal once. The harness does the rest up to Level 3 autonomy.

## 2. Main-agent responsibilities

`harness-orchestrator` is the single canonical primary agent.

Responsibilities:
- Understand and preserve the original request
- Discover repository facts before asking
- Compile requirements (RID assignment)
- Compile and validate the execution plan
- Assign bounded tasks to subagents
- Maintain dependency order and consistency
- Inspect returned diffs (not summaries)
- Accept or reject evidence
- Integrate results
- Report truthfully to the user
- De-escalate when evidence shows the current model suffices

The main agent performs little direct implementation.

Permitted main-agent edits:
- Small integration glue
- Plan and execution metadata
- Narrowly scoped corrections that cannot be delegated
- Emergency conflict resolution after inspecting worker output

## 3. Subagent responsibilities

Required subagents (depth=1, no subagent trees):

| Subagent | Permission | Ownership |
|----------|-----------|-----------|
| `harness-architect` | read, search, write (architecture) | docs/architecture/, schemas/ |
| `harness-auditor` | read, search, git inspection | — |
| `harness-worker` | assigned paths, approved commands | per-task |
| `harness-verifier` | read, search, approved test commands | — |
| `harness-security-reviewer` | read, search | — |
| `harness-final-reviewer` | read, search, git inspection | — |

Auditors and verifiers have no edit permission.

Workers edit only assigned paths.

Subagents must not create additional subagent trees.

## 4. Planning philosophy

- Intent is compiled into a structured plan before execution begins
- Requirements have IDs (R-001, R-002, ...)
- Every requirement maps to acceptance criteria
- Every acceptance criterion maps to a verification profile
- Plans are detailed enough that Flash High workers can execute without reinterpreting intent
- Plan validation must pass before execution starts
- Plans are versioned and stored with run state
- Three levels: small (1-3 files), standard (4-10 files), resumable (10+ files)

## 5. Model-routing philosophy

Use provider-neutral model classes:

| Class | Role | DeepSeek mapping | Default effort |
|-------|------|-----------------|----------------|
| `economical-worker` | Implementation | deepseek-v4-flash | high |
| `economical-orchestrator` | Main agent | deepseek-v4-flash | max (convergence), high (steady) |
| `critical-reasoner` | Architecture | deepseek-v4-flash | high |
| `vision-planner` | Visual/UI planning | deepseek-v4-flash (no vision) | high |
| `independent-reviewer` | Final review | deepseek-v4-flash | max |

Escalate to `deepseek-v4-pro` (effort high) only when objective triggers fire:
- Unresolved ambiguity affecting architecture
- Conflicting auditor evidence
- Plan validation fails twice semantically
- Worker fails same task twice
- Verifier rejects same remediation twice
- Security boundary uncertain
- Migration risks data or compatibility
- Final reviewer finds a blocker flash cannot resolve
- Context compression loses a material requirement
- Platform behavior contradicts documented contract

Record every escalation.

## 6. Required harness subsystems

| ID | Subsystem | Status | Milestone |
|----|-----------|--------|-----------|
| SS-01 | Intent Compiler | OPERATIONAL | M0 |
| SS-02 | Context Engine | OPERATIONAL | M1 |
| SS-03 | Plan Compiler | OPERATIONAL | M2 |
| SS-04 | Canonical contracts and migrations | VERIFIED | M3 |
| SS-05 | Agent topology and delegation | OPERATIONAL | M4 |
| SS-06 | Model router and resource governor | PARTIAL | M5 |
| SS-07 | Capability negotiation | PARTIAL | M6 |
| SS-08 | Platform adapters | PARTIAL | M7 |
| SS-09 | Policy, approvals and least privilege | VERIFIED | M8 |
| SS-10 | Orchestration runtime | VERIFIED | M9 |
| SS-11 | Durable execution | VERIFIED | M10 |
| SS-12 | Workspace isolation and integration | NOT_STARTED | M11 |
| SS-13 | Verification and evidence engine | VERIFIED | M12 |
| SS-14 | Evaluation and telemetry | PARTIAL | M13 |
| SS-15 | Long-task controlled evaluation | VERIFIED | M14 |
| SS-16 | Tool, MCP and skill registry | PARTIAL | M15 |
| SS-17 | UI and business parity | NOT_STARTED | M16 |
| SS-18 | Installer lifecycle | PARTIAL | M17 |
| SS-19 | Control plane | RETIRED | M18 |
| SS-20 | Knowledge and memory lifecycle | NOT_STARTED | M19 |
| SS-21 | Safe improvement lifecycle | NOT_STARTED | M20 |
| SS-22 | CI, packaging and cross-platform verification | VERIFIED | M21 |
| SS-23 | Profile isolation and immutable references | VERIFIED | M22 |
| SS-24 | Cleanup, migration and garbage collection | PARTIAL | M23 |

Status key: NOT_STARTED | PARTIAL | OPERATIONAL | VERIFIED

## 7. Level 3 autonomy target

| Capability | Current | Target |
|-----------|---------|--------|
| Automatic discovery | Partial | Full (detect repo, OS, platform, profile) |
| Automatic planning | None | Full (intent compilation, plan validation) |
| Automatic delegation | None | Full (task graph, model routing, ownership) |
| Automatic implementation | None | Full (bounded workers, workspace isolation) |
| Automatic verification | None | Full (verification profiles, claim ledger) |
| Automatic branch/patch | None | Full (feature branch, reviewable diff) |
| Human review gate | Always | Always (before merge, push, deploy) |

## 8. Definition of Done

Do not return PASS unless:

1. `main` is canonical
2. Work occurs on a feature branch
3. Diff is reviewable
4. No EOL pollution remains
5. Dependency directories are excluded
6. Redundant files are resolved
7. Canonical concepts have one owner
8. Rich plan semantics remain intact
9. All deterministic tests pass
10. Generated output is current
11. Required CI is executable
12. Cross-platform lifecycle evidence exists or is honestly external
13. Immutable 5fedu template is source-locked
14. Reference materialization works
15. Seed mode works explicitly
16. Public install has no 5fedu leakage
17. Intent Compiler is operational
18. Context Engine is operational
19. Plan Compiler is operational
20. Plans are detailed enough for Flash High workers
21. Real delegation receipts exist
22. Main-agent over-implementation is detected
23. Ownership violations are rejected
24. Resume works
25. Retries and escalation are bounded
26. Workspace isolation works
27. Routing follows policy
28. OpenCode has one canonical configuration path
29. Platform claims match evidence
30. Verification profiles work
31. False-PASS fixtures are rejected
32. Claims link to evidence
33. Evaluation layers remain separate
34. Telemetry is canonical
35. Security gates are enforced
36. Operator-facing state projections are real
37. Browser, accessibility, console, network verification exists
38. Installer lifecycle works
39. Long-task evaluation passes
40. Final independent review ran
41. No blocking finding remains
42. No claim exceeds evidence
43. SS-04 Contracts are versioned and migration-tested
44. SS-07 Capability negotiation is defined and enforceable
45. SS-16 Tool, MCP and skill registry is populated and queryable
46. SS-20 Knowledge and memory lifecycle is implemented
47. SS-21 Safe improvement lifecycle is implemented
48. SS-24 Cleanup, migration and garbage collection is operational

## 9. Accepted architectural decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| AD-001 | Single orchestrator, depth 1 | Prevent runaway delegation trees |
| AD-002 | Provider-neutral model classes | Portability across platforms |
| AD-003 | Schemas before code | Contracts drive implementation, not reverse |
| AD-004 | Generated output is tracked | Drift detection |
| AD-005 | PowerShell → TypeScript migration | Cross-platform canonical layer |
| AD-006 | Feature branch work, no main commits | Review gate before merge |
| AD-007 | Pull request for user review | Human approval required |
| AD-008 | Public default = no 5fedu | Civilian isolation |
| AD-009 | Immutable vendored template | Traceable reference |
| AD-010 | Evidence-linked claims | No unsubstantiated PASS |

## 10. Prohibited shortcuts

- Schema without runtime consumer
- Worker self-report as verification
- Build pass as full verification
- Markdown as canonical plan
- Generated output as behavioral parity
- Passing test with increased timeout (hanging)
- Subagent-creating subagents
- Implementation on main branch
- Silent 5fedu leakage in public paths
- Blaming environment for unbuilt subsystems

## 11. False-PASS patterns (must be detected)

1. Build passes but behavior fails
2. Source exists but runtime does not load it
3. Worker misses a requirement
4. Worker edits outside ownership
5. Public install leaks 5fedu
6. Generated output is stale
7. Frontend logs console errors
8. Visual output differs from reference
9. Schema exists but no consumer
10. Tests pass but no assertions exist

## 12. Requirement IDs (derived from user's intent)

| RID | Source | Description | Status |
|-----|--------|-------------|--------|
| R-001 | 1-install | One-command install for any platform | PLANNED |
| R-002 | 1-detect | Auto-detect repo, OS, platform, profile | OPERATIONAL |
| R-003 | 1-plan | Plan, delegate, implement, verify, review | OPERATIONAL |
| R-004 | 3-operating-model | Cross-session operating model doc | COMPLETED |
| R-005 | 4-model-policy | Provider-neutral model classes + mapping | PARTIAL |
| R-006 | 6-baseline | Clean git baseline, feature branch | COMPLETED |
| R-007 | 6-gitattributes | Line-ending policy | COMPLETED |
| R-008 | 7-topology | Single orchestrator, depth 1 | OPERATIONAL |
| R-009 | 8-permission | Least privilege, auditor=read-only | VERIFIED |
| R-010 | 9-delegation | Contract with task ID, ACs, ownership | VERIFIED |
| R-011 | 10-evidence | 6 evidence statuses, 6 separation layers | VERIFIED |
| R-012 | 11-inventory | Complete repo inventory, classify every file | OPERATIONAL |
| R-013 | 12-deterministic | npm run verify:all | VERIFIED |
| R-014 | 13-cli | TypeScript canonical CLI | OPERATIONAL |
| R-015 | 14-template | 5fedu immutable vendored template | VERIFIED |
| R-016 | 15-template-lifecycle | Materialize, seed, doctor | VERIFIED |
| R-017 | 16-isolation | Public install = no 5fedu | VERIFIED |
| R-018 | 17-contracts | 15 canonical versioned contracts | VERIFIED |
| R-019 | 18-intent-compiler | Preserve request, derive requirements | OPERATIONAL |
| R-020 | 19-context-engine | Repository map, routing, budgets | OPERATIONAL |
| R-021 | 20-plan-compiler | Task graph, dependency detection | OPERATIONAL |
| R-022 | 21-orchestration | Model routing, ownership, receipts | VERIFIED |
| R-023 | 22-durable | 14 states, checkpoint, resume | VERIFIED |
| R-024 | 23-workspace | Worktree isolation, conflict detection | NOT_STARTED |
| R-025 | 24-verification | 19 verification profiles | VERIFIED |
| R-026 | 25-eval-telemetry | 4 layers, canonical events | PARTIAL |
| R-027 | 26-long-task | 10+ file evaluation | VERIFIED |
| R-028 | 27-platforms | 5 platform adapters | PARTIAL |
| R-029 | 28-opencode | Canonical config, harness-orchestrator | OPERATIONAL |
| R-030 | 29-ui-parity | Structured reference packet | NOT_STARTED |
| R-031 | 30-security | Auth fails closed, path allowlist | VERIFIED |
| R-032 | 31-tools-mcp-skills | Unified registry | PARTIAL |
| R-033 | 32-knowledge | Session, project, org, evidence, policy | NOT_STARTED |
| R-034 | 33-installer | 8 commands, cross-platform | PARTIAL |
| R-035 | 34-control-plane | RETIRED — removed by owner decision; state lives in .agent ledger/runtime | RETIRED |
| R-036 | 35-ci | Required gate, cross-platform lifecycle | VERIFIED |
| R-037 | 36-final-review | Independent adversarial review | PARTIAL |
| R-038 | 37-report | Vietnamese report, 37 sections | NOT_STARTED |
| R-039 | 6-model-router | Model router and resource governor | PARTIAL |
| R-040 | 7-capability-negotiation | Capability negotiation | PARTIAL |
| R-041 | 21-improvement | Safe improvement lifecycle | NOT_STARTED |
| R-042 | 24-cleanup | Cleanup, migration and garbage collection | PARTIAL |

## 13. Evidence statuses

| Status | Meaning |
|--------|---------|
| VERIFIED | Independently confirmed with executable evidence |
| PARTIALLY_VERIFIED | Some dimensions confirmed, others unverified |
| UNVERIFIED | No evidence collected yet |
| BLOCKED | External dependency prevents verification |
| NOT_APPLICABLE | Not relevant to this implementation |
| FAILED | Evidence contradicts the claim |

Keep separate:
1. Source presence
2. Static/schema conformance
3. Generated/install parity
4. Native runtime evidence
5. Controlled evaluation
6. Live outcome evidence

## 14. Links

- Schemas: `schemas/` (9 canonical + legacy)
- ADRs: `docs/architecture/` (artifact-contracts.md, target-operating-model.md)
- Fixtures: `schemas/fixtures/` (positive + negative)
- CLI: `packages/cli/`
- Operator dashboard: retired (no UI server)
- Eval fixtures: `evals/fixtures/`
- CI: `.github/workflows/`

## 15. Subsystem registry

### SS-01 Intent Compiler

| Field | Value |
|-------|-------|
| Requirement IDs | R-019 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/intent/` |
| Runtime consumer | CLI |
| Implementation status | OPERATIONAL |
| Evidence status | VERIFIED |
| Unit tests count | 7 |
| Integration tests count | 3 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | None |

### SS-02 Context Engine

| Field | Value |
|-------|-------|
| Requirement IDs | R-020 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/context/`, `platforms/python/src/agent_rules/router/` |
| Runtime consumer | CLI, Python router |
| Implementation status | OPERATIONAL |
| Evidence status | VERIFIED |
| Unit tests count | 4 |
| Integration tests count | 2 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | TS graph builder and Python router exist but not unified |

### SS-03 Plan Compiler

| Field | Value |
|-------|-------|
| Requirement IDs | R-021 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/plan/` |
| Runtime consumer | CLI |
| Implementation status | OPERATIONAL |
| Evidence status | VERIFIED |
| Unit tests count | 15 |
| Integration tests count | 5 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | None |

### SS-04 Canonical contracts and migrations

| Field | Value |
|-------|-------|
| Requirement IDs | R-018 |
| Owner | harness-maintainer |
| Canonical implementation path | `schemas/` |
| Runtime consumer | All subsystems |
| Implementation status | VERIFIED |
| Evidence status | VERIFIED |
| Unit tests count | 94 |
| Integration tests count | 18 |
| Controlled evaluation | PASS |
| Platform coverage | cross-platform (schema-based) |
| Known limitations | 9 schemas + 18 fixtures; legacy schemas not yet migrated |

### SS-05 Agent topology and delegation

| Field | Value |
|-------|-------|
| Requirement IDs | R-008, R-029 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/orchestrator/`, `opencode.json` |
| Runtime consumer | CLI |
| Implementation status | OPERATIONAL |
| Evidence status | VERIFIED |
| Unit tests count | 8 |
| Integration tests count | 4 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | Single orchestrator depth=1 enforced |

### SS-06 Model router and resource governor

| Field | Value |
|-------|-------|
| Requirement IDs | R-005, R-039 |
| Owner | harness-maintainer |
| Canonical implementation path | `schemas/model-policy.json` |
| Runtime consumer | Orchestrator |
| Implementation status | PARTIAL |
| Evidence status | PARTIALLY_VERIFIED |
| Unit tests count | 2 |
| Integration tests count | 0 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | schema only |
| Known limitations | Policy schema exists, no runtime routing |

### SS-07 Capability negotiation

| Field | Value |
|-------|-------|
| Requirement IDs | R-040 |
| Owner | harness-maintainer |
| Canonical implementation path | `schemas/capability.json` |
| Runtime consumer | Orchestrator |
| Implementation status | PARTIAL |
| Evidence status | PARTIALLY_VERIFIED |
| Unit tests count | 1 |
| Integration tests count | 0 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | schema only |
| Known limitations | Schema exists, no runtime negotiation |

### SS-08 Platform adapters

| Field | Value |
|-------|-------|
| Requirement IDs | R-028 |
| Owner | harness-maintainer |
| Canonical implementation path | `platforms/` |
| Runtime consumer | CLI, Orchestrator |
| Implementation status | PARTIAL |
| Evidence status | PARTIALLY_VERIFIED |
| Unit tests count | 6 |
| Integration tests count | 3 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | local-worker, opencode adapter |
| Known limitations | 5 platform adapters planned, 2 exist |

### SS-09 Policy, approvals and least privilege

| Field | Value |
|-------|-------|
| Requirement IDs | R-009, R-031 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/policy/`, `schemas/security-policy.json` |
| Runtime consumer | Orchestrator, CLI |
| Implementation status | VERIFIED |
| Evidence status | VERIFIED |
| Unit tests count | 56 |
| Integration tests count | 12 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | Auth fails closed, path allowlist enforced |

### SS-10 Orchestration runtime

| Field | Value |
|-------|-------|
| Requirement IDs | R-022 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/orchestrator/` |
| Runtime consumer | CLI |
| Implementation status | VERIFIED |
| Evidence status | VERIFIED |
| Unit tests count | 16 |
| Integration tests count | 8 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | None |

### SS-11 Durable execution

| Field | Value |
|-------|-------|
| Requirement IDs | R-023 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/durable/` |
| Runtime consumer | Orchestrator, CLI |
| Implementation status | VERIFIED |
| Evidence status | VERIFIED |
| Unit tests count | 9 |
| Integration tests count | 4 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | Checkpoint/resume implemented with 14 states |

### SS-12 Workspace isolation and integration

| Field | Value |
|-------|-------|
| Requirement IDs | R-024 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/workspace/` |
| Runtime consumer | Orchestrator |
| Implementation status | NOT_STARTED |
| Evidence status | NOT_APPLICABLE |
| Unit tests count | 0 |
| Integration tests count | 0 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | none |
| Known limitations | No implementation |

### SS-13 Verification and evidence engine

| Field | Value |
|-------|-------|
| Requirement IDs | R-011, R-025 |
| Owner | harness-maintainer |
| Canonical implementation path | `evals/`, `packages/cli/src/verify/` |
| Runtime consumer | Verifier, CLI |
| Implementation status | VERIFIED |
| Evidence status | VERIFIED |
| Unit tests count | 12 |
| Integration tests count | 5 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | Five-step profile (`shell`, `playwright`, `browser-script`, `mcp-tool-call`, `visual-diff`) covers the 19 historical profiles; remaining expansion is documented in `schemas/verification-profile.schema.json`. |

### SS-14 Evaluation and telemetry

| Field | Value |
|-------|-------|
| Requirement IDs | R-026 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/kernel/src/northstar/telemetry.ts`, `evals/` |
| Runtime consumer | CLI, doctor |
| Implementation status | PARTIAL |
| Evidence status | PARTIALLY_VERIFIED |
| Unit tests count | 8 |
| Integration tests count | 3 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | Telemetry endpoint and run-state schema exist |

### SS-15 Long-task controlled evaluation

| Field | Value |
|-------|-------|
| Requirement IDs | R-027 |
| Owner | harness-maintainer |
| Canonical implementation path | `evals/long_task/` |
| Runtime consumer | Eval runner |
| Implementation status | VERIFIED |
| Evidence status | VERIFIED |
| Unit tests count | 15 |
| Integration tests count | 0 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | Canonical fixture (12 files, 3 seeded defects) and adversarial variant both pass; bounded repair + checkpoint/resume wire to `packages/engine/src/runner/`. |

### SS-16 Tool, MCP and skill registry

| Field | Value |
|-------|-------|
| Requirement IDs | R-032 |
| Owner | harness-maintainer |
| Canonical implementation path | `integrations/registry.json`, `skills/` |
| Runtime consumer | CLI, Orchestrator |
| Implementation status | PARTIAL |
| Evidence status | PARTIALLY_VERIFIED |
| Unit tests count | 3 |
| Integration tests count | 1 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | linux, macos, windows |
| Known limitations | `integrations/registry.json` exists but no MCP runtime |

### SS-17 UI and business parity

| Field | Value |
|-------|-------|
| Requirement IDs | R-030 |
| Owner | harness-maintainer |
| Canonical implementation path | RETIRED — removed by owner decision |
| Runtime consumer | N/A |
| Implementation status | NOT_STARTED |
| Evidence status | NOT_APPLICABLE |
| Unit tests count | 0 |
| Integration tests count | 0 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | none |
| Known limitations | No implementation |

### SS-18 Installer lifecycle

| Field | Value |
|-------|-------|
| Requirement IDs | R-001, R-014, R-034 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/install/` |
| Runtime consumer | CLI |
| Implementation status | PARTIAL |
| Evidence status | PARTIALLY_VERIFIED |
| Unit tests count | 15 |
| Integration tests count | 6 |
| Controlled evaluation | PASS |
| Platform coverage | linux, macos, windows |
| Known limitations | CLI has install, doctor; cross-platform coverage partial |

### SS-19 Control plane (RETIRED)

| Field | Value |
|-------|-------|
| Requirement IDs | R-035 |
| Owner | harness-maintainer |
| Canonical implementation path | RETIRED — removed by owner decision (Final Integrity Closure v2); no successor UI server |
| Runtime consumer | N/A |
| Implementation status | RETIRED |
| Evidence status | NOT_APPLICABLE |
| Unit tests count | 0 |
| Integration tests count | 0 |
| Controlled evaluation | NOT_APPLICABLE |
| Platform coverage | N/A |
| Known limitations | Removed product; any reappearance requires a new owner-authorized phase plan |

### SS-20 Knowledge and memory lifecycle

| Field | Value |
|-------|-------|
| Requirement IDs | R-033 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/knowledge/` |
| Runtime consumer | CLI, Orchestrator |
| Implementation status | NOT_STARTED |
| Evidence status | NOT_APPLICABLE |
| Unit tests count | 0 |
| Integration tests count | 0 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | none |
| Known limitations | No implementation |

### SS-21 Safe improvement lifecycle

| Field | Value |
|-------|-------|
| Requirement IDs | R-041 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/improve/` |
| Runtime consumer | CLI |
| Implementation status | NOT_STARTED |
| Evidence status | NOT_APPLICABLE |
| Unit tests count | 0 |
| Integration tests count | 0 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | none |
| Known limitations | No implementation |

### SS-22 CI, packaging and cross-platform verification

| Field | Value |
|-------|-------|
| Requirement IDs | R-013, R-036 |
| Owner | harness-maintainer |
| Canonical implementation path | `.github/workflows/quality.yml` |
| Runtime consumer | CI runner |
| Implementation status | VERIFIED |
| Evidence status | VERIFIED |
| Unit tests count | 0 |
| Integration tests count | 0 |
| Controlled evaluation | PASS |
| Platform coverage | ubuntu, macos, windows |
| Known limitations | SHA-pinned, verify:all gate |

### SS-23 Profile isolation and immutable references

| Field | Value |
|-------|-------|
| Requirement IDs | R-015, R-016, R-017 |
| Owner | harness-maintainer |
| Canonical implementation path | `profiles/5fedu/`, `schemas/profile.json` |
| Runtime consumer | CLI, Template system |
| Implementation status | VERIFIED |
| Evidence status | VERIFIED |
| Unit tests count | 10 |
| Integration tests count | 4 |
| Controlled evaluation | PASS |
| Platform coverage | cross-platform |
| Known limitations | 5fedu template, isolation tests pass |

### SS-24 Cleanup, migration and garbage collection

| Field | Value |
|-------|-------|
| Requirement IDs | R-042 |
| Owner | harness-maintainer |
| Canonical implementation path | `packages/cli/src/cleanup/` |
| Runtime consumer | CLI |
| Implementation status | PARTIAL |
| Evidence status | PARTIALLY_VERIFIED |
| Unit tests count | 5 |
| Integration tests count | 2 |
| Controlled evaluation | NOT_RUN |
| Platform coverage | linux, macos, windows |
| Known limitations | Cleanup ledger exists, migration not started |
