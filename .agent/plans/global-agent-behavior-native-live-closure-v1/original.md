# One-shot Closure: Global Agent Behavior + Full Native 8 Host + Live Release

Owner-authorized EXECUTE contract (approval policy: never). Worker works on the dirty worktree at P:\agent-rules without reset/redo, creates exactly one new phase global-agent-behavior-native-live-closure-v1 that supersedes all previous full-native plans, imports all still-valid requirements, and makes it the only active pointer.

Definition of done (all must hold):
1. 8/8 hosts installed via the native surface the host actually supports.
2. No bridge/plugin/path/format self-made to fake native.
3. Rules and global skills are re-read by the host after reload/new session.
4. Worker receives a plan without prior conversation still receives full context, skills, scope, proof contract.
5. Needed skill activates; unrelated skill does not.
6. MCP needed → real handshake/tool call/observable effect; not needed → untouched.
7. Verifier never hard-codes or auto-derives PASS.
8. Evidence bound to correct candidate/source digest.
9. One writer writes run state; one reducer creates outcome.
10. Local gates green, direct push to main, origin/main == HEAD, every workflow of the exact commit ends success.

Required skill load order: plan-and-handoff, context-evolution-protocol, researcher, verification-router, claim-test-strategy, security-review, quality, finish-to-completion.

Architecture: unified global behavior runtime with 11 owner modules (BehaviorRuntime, RequestIntake, PlanCompiler, ContextRuntime, SkillResolver, CapabilityBroker, ExecutionCoordinator, ProofRouter, RunStore, OutcomeReducer, HostAdapter) and the single flow RequestIntake → PlanCompiler → ContextRuntime → SkillResolver → CapabilityBroker → ExecutionCoordinator → ProofRouter → RunStore → OutcomeReducer. Remove/merge ambiguous names: Decision Fabric, Decision Closure, Planner Runtime, multiple closure-*, context-*, routing paths. No long-lived facade/alias beyond a tested migrator.

Vocabulary: task_state (DISCUSSING|PLANNED|EXECUTING|VERIFYING|COMPLETE|BLOCKED|NEEDS_USER), claim_outcome (PASS|PARTIAL|BLOCKED|UNSUPPORTED|PRE-EXISTING|NEEDS_USER), host_state (NOT_DETECTED|DETECTED|INSTALLED|OFFLINE_VERIFIED|LIVE_VERIFIED|FAILED), provider_state (UNAVAILABLE|AVAILABLE|AUTHORIZED|ACTIVE|FAILED). Remove ambiguous synonyms. IDs: REQ-*, CLAIM-*, TASK-*, PROOF-*, DEC-*, JOURNEY-*.

Rules: keep 5 short groups (intent-scope-safety, execution-planning-delegation, proof-outcome, context-skill-mcp, maintainer) but restore all lost invariants with a legacy behavior→replacement→proof parity matrix. Delete completely: vibe-coder, plain-vietnamese, technical_explain, operator-profile command/runtime/test remnants and all references. Natural communication default.

Context: ContextCapsule with raw request ref, effective requirements/decisions, current plan/task id, owned/forbidden scope, skill route receipt, capability plan/lease, evidence refs, remaining work, next action. Compaction preserves intent/skills/MCP/proof; resume from canonical capsule; prompt classified compatible|refinement|conflict|supersedes|unrelated; only compatible/refinement auto-reconcile. Skill resolution exactly once per context_generation.

Skills: SKILL.md canonical (activation class, deterministic trigger facts, negative triggers, capabilities, dependencies, explicit-only policy, provider requirements, rollback, eval status). ROUTE.json removed from canonical role. Exactly 34 global skills with source/install hash parity; the two 5fedu skills are explicit domain-pack only. Every global skill has positive and negative route test. Live behavior canaries for plan-and-handoff, context-evolution-protocol, verification-router, claim-test-strategy, quality, security-review, finish-to-completion. Explicit user-invoked skill wins. No second resolver path.

MCP: core install never installs/enables MCP; remove agent-rules-mcp-bridge from all host configs; preserve user MCP servers (Chrome DevTools, Context7, Playwright, codebase-memory); no replacement bridge; integration is the only enable/disable path; explicit-only providers need owner authorization; provider selected by capability not keyword. MCP claim PASS requires 7 points (host-native config readback, initialize ok, listTools sees canary tool, real tool call with nonce, output/effect with nonce observed, teardown ok, config rollback byte-for-byte). Temp MCP canary only, no residue. Tasks without MCP prove no lease and no MCP call.

Native 8 host: Codex, Claude, OpenCode, Cursor, Antigravity, Grok, DeepSeek Harness, Command Code. HostAdapter interface detect→inventory→planInstall→install→reload→readback→offlineCanary→authenticatedCanary→rollback→uninstall. Registry cannot self-declare native; every surface needs provenance from official docs/CLI/config/readback. Version is diagnostic only. No official surface → UNSUPPORTED/BLOCKED. No invented paths (.command-code etc). No single hash for two surfaces. User content preserved; only managed blocks with ownership hash replaced. Atomic+idempotent; second install zero diff; rollback byte-equal; uninstall removes only owned content; candidate digest covers tracked+staged+unstaged+untracked production bytes. Auth boundary: 8/8 offline (install/reload/readback/policy/skills/rollback); logged-in hosts run authenticated model canary; Antigravity logged-in → model-turn live mandatory; Cursor/Grok signed-out → MODEL_BEHAVIOR=NEEDS_USER, host only OFFLINE_VERIFIED. Never open login flows/request credentials/store tokens.

Proof/closure: workers create observations only, never PASS. Evidence contains exact command/API/tool call, redacted args, exit code/result, hashed stdout/stderr, timestamp, host+native surface, pre/post bytes/hashes, source/candidate digest, claim+acceptance refs. RunStore single writer; OutcomeReducer single reducer; remove parallel derivations. No close while plan/current/ledger/result conflict; evidence of another candidate; untracked production files missing from digest; requirement without proof; verifier only checks file existence; prose receipt; dead references.

Index: generated/behavior-index.json + .md, 10 canonical views. CLI reads the same index: status (summary), status --details, doctor all --json. Public CLI exactly 8 commands: install, uninstall, doctor, status, run, integration, init, reference. integration only list|enable|disable|doctor. Delete obsolete command modules/tests/aliases. Finite coverage matrix frozen (stage × invariant × actor/handoff × success/failure/resume × host).

Tests: deterministic (schema/semantic admission, trace chains, state transitions, single writer/atomic, candidate digest, stale/foreign evidence, rules parity+zero dead refs, skill hash parity, pos/neg routing, host adapter merge/idempotence/rollback/ownership, MCP lifecycle/teardown, 8-command CLI, verify:all never prints failed then success). Process-level integration (12): two competing writers, kill-mid-transaction resume, checkpoint→restart→capsule, plan-only handoff loads skills, scope conflict blocked, reconcile classified, resolver once per generation, lease MCP yes/no, MCP canary real, native installer temp home + byte-rollback, packaged CLI not source, hard-coded PASS mutation test fails. Live journeys JOURNEY-001..014 as listed. Formal acceptance audit after all impl tests green, one consolidated correction batch max.

Artifacts: baseline-and-loss-map, behavior-contract, executable-plan, behavior-index, native-host-matrix, skill-matrix, capability-matrix, evidence-ledger, result.json, release-report.

Local release gate: npm ci, build, check, test, verify:all, packaged runtime lifecycle smoke, global behavior suite, native 8-host, logged-in live canaries, security review, quality hard-block, independent acceptance.

CI fixes: tsx direct root devDependency locked; certification matrix all 8 hosts from canonical registry; runner per host label; RUNNERS_UNAVAILABLE structured evidence not exit-78 reddening; green workflow = pipeline+evidence integrity only; quality reads active current pointer not hard-coded V3.1/ledger; active plan/closure check hard fail; hosted CI recompute digest + local receipts bound to candidate; Quality and Certification of push end success.

Commit/push: cleanup residue, git status clean, commit on main with message "feat: close global behavior and native host runtime", push origin main (no force), wait for all workflows of that SHA, report HEAD==origin/main==workflow SHA, clean status, Quality success, Certification success, 8-host offline matrix, live model matrix (Antigravity PASS, signed-out NEEDS_USER).

Assumptions locked: allowed commit/push main; no login/credential handling; use existing sessions; native = official surface; signed-out model behavior does not block native release but must show NEEDS_USER; no communication profile; no long-lived compatibility layer; never call phase complete without real evidence.
