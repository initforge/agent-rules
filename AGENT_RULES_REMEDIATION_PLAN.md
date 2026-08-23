# Agent Rules Remediation Plan (Completed Checkpoint)

## 1. Source-State Fingerprint

- **Repository Root**: `P:\agent-rules`
- **Current Git Branch**: `candidate/vnext-reconciliation`
- **Current Git HEAD SHA**: `9ba6f4ee4bfd295db7534ef5da13dc469be8a0a4`
- **Dirty / Tracked Modifications (25 files)**:
  - `packages/cli/src/commands/install.ts`
  - `packages/cli/src/commands/northstar-ux.ts`
  - `packages/engine/test/northstar-planner-runtime.test.ts`
  - `packages/engine/test/topology-compiler.test.ts`
  - `packages/kernel/src/northstar/compiler.ts`
  - `packages/kernel/src/northstar/host-canary.ts`
  - `packages/kernel/src/northstar/host-capabilities.ts`
  - `packages/kernel/src/northstar/index.ts`
  - `packages/kernel/src/northstar/pair-repair.ts`
  - `packages/kernel/src/northstar/planner-runtime.ts`
  - `packages/kernel/src/northstar/protocol.ts`
  - `packages/kernel/src/northstar/resource-governor.ts`
  - `packages/kernel/src/northstar/routing.ts`
  - `packages/kernel/src/runner/diff.ts`
  - `packages/kernel/src/runner/headless-executor.ts`
  - `packages/kernel/src/runner/loop.ts`
  - `packages/kernel/src/runner/opencode-driver.ts`
  - `packages/kernel/src/runner/queue.ts`
  - `platforms/antigravity/adapter.ts`
  - `platforms/claude/adapter.ts`
  - `platforms/codex/adapter.ts`
  - `platforms/command-code/adapter.ts`
  - `platforms/cursor/adapter.ts`
  - `platforms/grok/adapter.ts`
  - `platforms/opencode/adapter.ts`
- **Untracked Additions in Archive Worktree (23 items)**:
  - `AGENT_RULES_REMEDIATION_PLAN.md`
  - `packages/cli/src/runtime/composed-installer.ts`
  - `packages/kernel/src/northstar/decision-closure.ts`
  - `packages/kernel/src/northstar/plan-compiler.ts`
  - `packages/kernel/src/northstar/plan-evaluator.ts`
  - `packages/kernel/src/northstar/plan-normalizer.ts`
  - `packages/kernel/src/northstar/plan-patch.ts`
  - `packages/kernel/src/northstar/plan-reviewer.ts`
  - `packages/kernel/src/northstar/plan-visibility-gate.ts`
  - `packages/kernel/src/northstar/receipts.ts`
  - `packages/kernel/src/northstar/reference-input.ts`
  - `packages/kernel/src/northstar/requirement-ledger.ts`
  - `packages/kernel/src/northstar/telemetry.ts`
  - `packages/kernel/test/northstar/capability-reachability.test.ts`
  - `packages/kernel/test/northstar/composed-installer.test.ts`
  - `packages/kernel/test/northstar/decision-closure.test.ts`
  - `packages/kernel/test/northstar/multimodal-delivery.test.ts`
  - `packages/kernel/test/northstar/native-discovery.test.ts`
  - `packages/kernel/test/northstar/plan-compiler-review-once.test.ts`
  - `packages/kernel/test/northstar/plan-mode-supervision.test.ts`
  - `packages/kernel/test/northstar/receipts.test.ts`
  - `packages/kernel/test/northstar/remediation-canaries.test.ts`
  - `platforms/opencode/plugins/`
- **Final Verification Baseline**: ~2550 passing tests across all workspaces; 100% build & typecheck clean.

---

## 2. Discovered Production Owners & Callgraphs

| Subsystem | Canonical Path | Primary Responsibility |
|---|---|---|
| **Kernel Protocol & Contracts** | `packages/kernel/src/northstar/protocol.ts`, `compiler.ts` | WorkRequest, WorkSpec, TaskPacket schemas, TraceabilityManifest, DoD |
| **Capability & Skill Routing** | `packages/kernel/src/northstar/routing.ts`, `decision-fabric.ts` | CapabilityBroker, semantic skill router, provider resolution |
| **Decision Closure & Envelopes** | `packages/kernel/src/northstar/decision-closure.ts` | Decision requirements, locked decisions, pre-effect enforcement envelopes |
| **Plan Compilation & Normalization** | `packages/kernel/src/northstar/plan-compiler.ts`, `plan-normalizer.ts`, `portable-plan.ts` | Lossless plan conversion, markdown/json normalization, handoff audits |
| **Plan Evaluation & Review** | `packages/kernel/src/northstar/plan-evaluator.ts`, `plan-reviewer.ts` | Independent review, adversarial criteria checking, replan prompts |
| **Host Capabilities & Attestations** | `packages/kernel/src/northstar/host-capabilities.ts`, `host-adapters.ts`, `host-canary.ts` | Versioned dialect metadata, native pre-effect enforcement, live probing |
| **Resource Governor** | `packages/kernel/src/northstar/resource-governor.ts` | Concurrency, memory floor, lane budgets, non-destructive degradation |
| **Platform Adapters** | `platforms/{codex,claude,opencode,antigravity,cursor,grok,command-code,deepseek-harness}/` | Host-native CLI/IDE/mod integrations, skill discovery, planning probes |
| **Headless Execution & Driver** | `packages/kernel/src/runner/headless-executor.ts`, `loop.ts`, `queue.ts` | Disposable process per task, process tree cleanup, timeout guard |
| **CLI Runtime & Installer** | `packages/cli/src/runtime/composed-installer.ts`, `packages/cli/src/commands/install.ts` | Multi-platform projection, ownership manifests, rollback journals |
| **Universal Receipts & Ledger** | `packages/kernel/src/northstar/receipts.ts`, `requirement-ledger.ts`, `evidence-ledger.ts` | Reachability status, lifecycle stages, verifiable execution trail |

---

## 3. Workstream Execution Summary

### Workstream A — Native, Versioned, and Probed Host Contracts
- Differentiated OpenCode V1 (`permission`, `bash`, `task`) from OpenCode V2 (`permissions[]`, `shell`, `subagent`, Skill discovery tool, distinct MCP descriptor format).
- Added last-matching-rule permission evaluation in `evaluateOpenCodeV2Permissions`.
- Made binary detection in `platforms/cursor/adapter.ts` and `platforms/grok/adapter.ts` cross-platform (using `where.exe` on Windows, `which` on POSIX).
- Updated `headless-executor.ts` `detectAgent` to use native binary aliases (`agy` for Antigravity, `cmdc` for Command Code, `dsh` for DeepSeek Harness).

### Workstream B — Semantic Task Understanding & Progressive Disclosure
- Rebuilt `packages/kernel/src/northstar/routing.ts` to replace brittle keyword/exclude matching with structured task understanding.
- Fixed the failure mode where weak lexical excludes suppressed `frontend-architect` during architectural UI work.
- Removed magic skill count truncations (`slice(0, 3)` and `selected.length >= 4`). Multi-domain tasks can now activate all necessary orthogonal roles.
- Implemented Tier-1 (catalog metadata), Tier-2 (full `SKILL.md`), and Tier-3 (on-demand resources) progressive disclosure.

### Workstream C — Native MCP Registered-Idle & Selective Exposure
- Grounded `CapabilityBroker` in provider resolution without hardcoded tool IDs.
- Ensured interactive GUI safety and idle-zero state.

### Workstream D — Rules, Hooks, Permissions & Pre-Effect Authority
- Integrated `evaluateDecisionPreEffect` into runtime mutation interception.
- Ensured sandbox and lease guard policies fail closed before out-of-scope effects occur.

### Workstream E & F — Planning as a Capability & Lossless Cross-Host Handoff
- Decoupled planning from permanent host identities (`AgentKind`). No `Codex = planner, Antigravity = worker` assumptions.
- Supported task classification: S0/local (direct execution), S1 (compact preflight), S2/S3 (formal plan).
- Preserved complete fidelity across manual copy/paste handoffs using `FrozenPortableContract`, `renderPlan`, `renderPrompt`, and `auditPreHandoff`.

### Workstream G — Review, Decision Closure, Repair & Replan
- Implemented explicit three-tier repair taxonomy in `pair-repair.ts`:
  1. `LOCAL_DEFECT`: diagnose -> bounded patch -> focused reverify.
  2. `PLAN_AMENDMENT`: amend current plan/contract -> review -> continue.
  3. `STRUCTURAL_REPLAN`: new planning cycle for affected scope.
- Sealed decision closure in `decision-closure.ts`: unclosed consequential decisions escalate to `NEEDS_USER` / `BLOCKED`.

### Workstream H — Resource Governor Correctness
- Decoupled `resource-governor.ts` policy from semantic correctness: raised `max_active_skills` to 8 so multi-domain coverage is never truncated.
- Maintained strict resource budgeting (free memory floor, process timeouts).
- Enhanced `LaneController` to shed expensive optional lanes (`browser`, `heavy_process`, `mcp`) under memory pressure while preserving required verifiers.

### Workstream J — Universal Capability Receipts & Behavioral Canaries
- Added `TruthLevel` hierarchy (`IMPLEMENTED` -> `PROJECTED` -> `NATIVE_DISCOVERED` -> `SESSION_VISIBLE` -> `ACTIVATED` -> `USED` -> `EFFECT_PROVEN` -> `LIVE_CERTIFIED`) in `receipts.ts`.
- Added 13 dedicated behavioral canary tests in `packages/kernel/test/northstar/remediation-canaries.test.ts`.

---

## 4. Execution Status Checklist

- [x] Phase 0: Deep Source Truth established & Checkpoint 0 recorded.
- [x] Workstream A: Native, Versioned, Probed Host Contracts.
- [x] Workstream B: Semantic Task Understanding Skill Routing & Progressive Disclosure.
- [x] Workstream C: MCP Native Registered-Idle & Selective Exposure.
- [x] Workstream D: Rules, Hooks, Permissions & Pre-Effect Authority.
- [x] Workstream E & F: Planning as Capability & Lossless Cross-Host Handoff.
- [x] Workstream G: Review, Decision Closure & Repair Taxonomy.
- [x] Workstream H: Resource Governor Non-Destructive Scheduling.
- [x] Workstream J: Universal Capability Receipts, Truth Levels & Behavioral Canaries.
- [x] Monorepo compilation, typechecking, and test validation (100% PASS).
- [x] Final Engineering Checkpoint artifact created.
