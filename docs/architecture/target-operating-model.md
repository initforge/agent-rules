# Target Operating Model

**Canonical cross-session, cross-model, cross-platform product contract.**

## 1. Zero-touch target experience

```
agent-rules init          # detect repo, OS, platform, profile
agent-rules plan          # discover facts, compile intent, validate plan
agent-rules run           # delegate, implement, verify, review, branch
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
| SS-01 | Repository inventory & cleanup | PLANNED | M0 |
| SS-02 | Deterministic build baseline | PLANNED | M1 |
| SS-03 | Canonical CLI | PLANNED | M2 |
| SS-04 | Template vendoring | PLANNED | M3 |
| SS-05 | Profile isolation | PLANNED | M4 |
| SS-06 | Contract system | PARTIAL | M5 |
| SS-07 | Intent Compiler | PLANNED | M6 |
| SS-08 | Context Engine | PLANNED | M7 |
| SS-09 | Plan Compiler | PLANNED | M8 |
| SS-10 | Orchestration runtime | PLANNED | M9 |
| SS-11 | Durable execution store | PLANNED | M10 |
| SS-12 | Workspace manager | PLANNED | M11 |
| SS-13 | Verification profiles | PLANNED | M12 |
| SS-14 | Evaluation & telemetry | PLANNED | M13 |
| SS-15 | Long-task evaluation | PLANNED | M14 |
| SS-16 | Platform adapters | PARTIAL | M15 |
| SS-17 | UI/business parity | PLANNED | M16 |
| SS-18 | Security & policy | PARTIAL | M17 |
| SS-19 | Tools, MCP, skills registry | PARTIAL | M18 |
| SS-20 | Knowledge lifecycle | PLANNED | M19 |
| SS-21 | Installer lifecycle | PARTIAL | M20 |
| SS-22 | Control plane | PARTIAL | M21 |
| SS-23 | CI convergence | PARTIAL | M22 |

Status key: NOT_STARTED | PLANNED | PARTIAL | OPERATIONAL | VERIFIED

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
36. Control-plane state is real
37. Browser, accessibility, console, network verification exists
38. Installer lifecycle works
39. Long-task evaluation passes
40. Final independent review ran
41. No blocking finding remains
42. No claim exceeds evidence

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
| R-002 | 1-detect | Auto-detect repo, OS, platform, profile | PLANNED |
| R-003 | 1-plan | Plan, delegate, implement, verify, review | PLANNED |
| R-004 | 3-operating-model | Cross-session operating model doc | IN_PROGRESS |
| R-005 | 4-model-policy | Provider-neutral model classes + mapping | PLANNED |
| R-006 | 6-baseline | Clean git baseline, feature branch | COMPLETED |
| R-007 | 6-gitattributes | Line-ending policy | COMPLETED |
| R-008 | 7-topology | Single orchestrator, depth 1 | PLANNED |
| R-009 | 8-permission | Least privilege, auditor=read-only | PLANNED |
| R-010 | 9-delegation | Contract with task ID, ACs, ownership | PLANNED |
| R-011 | 10-evidence | 6 evidence statuses, 6 separation layers | PLANNED |
| R-012 | 11-inventory | Complete repo inventory, classify every file | PLANNED |
| R-013 | 12-deterministic | npm run verify:all | PLANNED |
| R-014 | 13-cli | TypeScript canonical CLI | PLANNED |
| R-015 | 14-template | 5fedu immutable vendored template | PLANNED |
| R-016 | 15-template-lifecycle | Materialize, seed, doctor | PLANNED |
| R-017 | 16-isolation | Public install = no 5fedu | PLANNED |
| R-018 | 17-contracts | 15 canonical versioned contracts | PLANNED |
| R-019 | 18-intent-compiler | Preserve request, derive requirements | PLANNED |
| R-020 | 19-context-engine | Repository map, routing, budgets | PLANNED |
| R-021 | 20-plan-compiler | Task graph, dependency detection | PLANNED |
| R-022 | 21-orchestration | Model routing, ownership, receipts | PLANNED |
| R-023 | 22-durable | 14 states, checkpoint, resume | PLANNED |
| R-024 | 23-workspace | Worktree isolation, conflict detection | PLANNED |
| R-025 | 24-verification | 19 verification profiles | PLANNED |
| R-026 | 25-eval-telemetry | 4 layers, canonical events | PLANNED |
| R-027 | 26-long-task | 10+ file evaluation | PLANNED |
| R-028 | 27-platforms | 5 platform adapters | PLANNED |
| R-029 | 28-opencode | Canonical config, harness-orchestrator | PLANNED |
| R-030 | 29-ui-parity | Structured reference packet | PLANNED |
| R-031 | 30-security | Auth fails closed, path allowlist | PLANNED |
| R-032 | 31-tools-mcp-skills | Unified registry | PLANNED |
| R-033 | 32-knowledge | Session, project, org, evidence, policy | PLANNED |
| R-034 | 33-installer | 8 commands, cross-platform | PLANNED |
| R-035 | 34-control-plane | Real persisted state, typed APIs | PLANNED |
| R-036 | 35-ci | Required gate, cross-platform lifecycle | PLANNED |
| R-037 | 36-final-review | Independent adversarial review | PLANNED |
| R-038 | 37-report | Vietnamese report, 37 sections | PLANNED |

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
- Control plane: `packages/control-plane/`
- Eval fixtures: `evals/fixtures/`
- CI: `.github/workflows/`
