# Baseline and Loss Map — global-agent-behavior-native-live-closure-v1

Baseline HEAD: c1deca1a5ee186a9d0361b57fd0ff7e943fa676e (main)
Pre-cut comparison targets (Git history): cb177d2 (runtime activation closure + 8-host native verification), 41b69eb (core slimming + 8-host usability closure), 6ab5cbc (operator-profile era).
Cut started in the dirty worktree of the previous phase (full-native-integrity-global-behavior-v1), which removed 13 rules → 5 rules, removed operator-profile, removed most profile/mode code, and built registry/installer skeletons.

## Rules legacy → replacement → proof

| Legacy rule (HEAD) | Behavior | Replacement (active) | Proof |
|---|---|---|---|
| 00-bootstrap | bootstrap/fail-closed foundation | 00-intent-scope-safety (intent/scope/safety, natural communication) + runtime admission gates | rules/manifest.yaml, automation/validate-rule-contracts.py |
| 05-critical-thinking | challenge material conflict with evidence | 00-intent-scope-safety (challenge material conflicts) | rules/00-intent-scope-safety.md |
| 10-execution | outcome-first execution with bounded repair | 10-execution-planning-delegation (ship first, bounded blockers, authority separation) | rules/manifest.yaml, runner-and-acceptance-reducer fixtures |
| 15-output-economy | concise output, no echo | 20-proof-outcome (prefer concise output without removing evidence) | rules/20-proof-outcome.md |
| 16-context-style | cohesive imperative context, ≤20-word bullets | 30-context-skill-mcp (cohesive imperative within budget) + context-evolution-protocol skill | 03-validate-context.ps1, context-budget receipts |
| 20-quality-and-safety | quality gate before commit | quality skill two-phase gate (pre/post) | skills/quality/SKILL.md, quality hard-block |
| 25-task-lifecycle | task lifecycle states | task_state vocabulary (DISCUSSING|PLANNED|EXECUTING|VERIFYING|COMPLETE|BLOCKED|NEEDS_USER) | protocol.ts RunState |
| 30-context-routing | route context/skills surgically | 30-context-skill-mcp + SkillResolver once per context generation | context-graph.json, routeSkills |
| 40-harness-governance | harness governance/authority | 40-maintainer (maintainer-only) + execution authority states | rules/40-maintainer.md, execution-authority.ts |
| 41-harness-maintainer | maintainer edits canonical source | 40-maintainer (canonical-first, generated read-only) | rules/40-maintainer.md, maintainer-pointer-audit |
| 42-installation-global-first | global user-level install, per-project forbidden | 00-intent-scope-safety (global install boundary) | install-target-audit, native-installer tests |
| 45-adaptive-minimal-proof-testing | smallest sufficient proof set | 20-proof-outcome (smallest sufficient proof, six-status, live-proof-for-live-claim) | proof-router.ts, proof-receipt schema |
| 50-context-budget | context budget/Benefit–Harm gate | 30-context-skill-mcp budget + context-budget.ts + context-evolution-protocol Benefit–Harm Gate | context-budget.ts, skills/context-evolution-protocol |

## Modes/roles legacy → replacement → proof

| Legacy mode | Behavior | Replacement | Proof |
|---|---|---|---|
| operator-profiles/vibe-product (profile.json) | communication profile | natural default communication (00-intent-scope-safety) | removed file, parity negative scan |
| operator-profile CLI command | 7 subcommands | deleted; no replacement (8-command CLI) | packages/cli/src/index.ts, parity.test.ts legacyCommands |
| vibe-coder | none in repo | deleted | rg zero hits |
| plain-vietnamese | none in repo | deleted | rg zero hits |
| technical_explain | none in repo | deleted | rg zero hits |

## Behavior parity obligations (bounded review, no-reopen, Benefit–Harm, consumer tracing, live proof, cohesion, maintainer flow, debt stop, manual proof)

| Old behavior | Status | Replacement location | Proof |
|---|---|---|---|
| Bounded review + max one correction batch | Present (plan-and-handoff / finish-to-completion) | adaptive-work-protocol.md, plan-compiler.ts, plan-reviewer.ts | plan-compiler-review-once.test.ts |
| No-reopen condition | Present | closure gates (OutcomeReducer/ExecutionCoordinator) | closure/reopen tests |
| Benefit–Harm Gate before cutting context | Present | context-evolution-protocol skill + context-budget.ts | context-evolution-protocol SKILL.md |
| Consumer tracing before deleting behavior | Present | context-evolution-protocol promotion gate + rg audit | context-evolution-protocol SKILL.md |
| Live proof for live claim | Present | 20-proof-outcome (live claims require live proof) + proof-router | proof-live.test.ts |
| Context cohesion + compaction/resume | Present (context-* modules) | ContextRuntime + ContextCapsule (closure scope) | context-engine tests + JOURNEY-005 |
| Maintainer flow source → build → install → doctor | Present | 40-maintainer + build-runtime.mjs + doctor | release gates + JOURNEY-010 |
| Ship/follow-up debt + stop condition | Present | completion_policy + acceptance audit | acceptance-audit.ts |
| Manual visible proof when automation insufficient | Present | PROOF statuses + human residual packet (verification-router) | verification-router SKILL.md |

## Loss map (things removed and NOT re-added because obsolete)

- operator-profiles namespace (profile.json) — removed; communication default natural (no profile).
- operator-profile CLI command + runtime + tests — removed (REQ-107).
- 13 legacy rule files — archived to .agent/archive/rules-legacy/ (git-ignored); Git history is the only shipped history.

## Files shippable vs not

- Ship: 5 rule files + manifest + README; active runtime modules; skills; platforms; schemas; automation; workflows; docs aligned to 8 commands.
- Never ship: .agent/archive/** (legacy rules/profile copies), runtime residue (logs, temp-smoke, source zip, fake receipts), stale plans, dead commands, managed MCP bridge.