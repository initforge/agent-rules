# AM-0001 — Compatible Amendment: Global Behavior Contract

Classification: COMPATIBLE_AMENDMENT
Amends: full-native-8host-single-truth-v1 (original.md sha256 2F64884840C7BD5E40E0FF4BB9238889DF2462ACAD05BBE5BCF72415158C1050)
Created: 2026-08-25T00:30:00Z
Reconciled: 2026-08-25T00:30:00Z
Disposition: APPEND — extends effective contract without superseding prior requirements.

## Reason
Active plan captured Full Native 8 Host requirements but omitted later owner requirement: core agent behavior must be global across every project and direct native host session, not only inside agent-rules or `agent-rules run`.

## Steering source
User steering 2026-08-25 (compatible amendment, one continuous pass, no Review A/B, no second plan).

## Added mandatory global behavior contract

- Keep communication profile-free and natural. Do not restore vibe-coder, plain-vietnamese, technical_explain, or user-facing behavior modes.
- Preserve hidden internal authority states only: ADVISORY → PLAN → EXECUTION → VERIFY → TERMINAL.
- A pasted plan or planning request cannot authorize source edits. Execution requires an explicit execute pivot.
- Every new owner message must be classified as CONTINUATION, ADD, CORRECT, CONFLICT, SUPERSEDE, or INDEPENDENT and reconciled into the effective contract without silently dropping old requirements.
- Implement complete semantics for ADD, CORRECT, CONFIRM, REJECT, and SUPERSEDE. CORRECT must create the corrected active item; ADD/CONFIRM must not be ignored.
- Planner behavior is bounded: one draft, at most one blocker-driven correction, then deterministic final gate and exit. No stacked planner/reviewer loops and no new criteria after correction.
- Independent review claims require a genuinely separate reviewer invocation/identity, not a reviewer_host label.
- Ordinary low-risk work uses no planner/reviewer unless needed.
- One active writer lease per canonical worktree across processes and hosts. A second writer must block or use an isolated worktree.
- Protect user-owned dirty files. Scope enforcement should prevent writes when possible; detect-after alone is not sufficient and must not be called protection.
- Global safety/authority rules cannot be weakened by project-local instructions. Detect and report conflicts explicitly.
- Commit, push, deploy, destructive deletion, credential access, and external side effects require explicit owner authority across all hosts.
- Preserve effective intent and progress across compaction, restart, resume, and handoff.
- Clarification is only for material ambiguity, missing authority, or unavailable required capability; no preference polling during approved execution.

## Added acceptance (fresh disposable repositories with no project-local agent-rules files)

- plan-only mutation denial (pasted plan cannot edit source without execute pivot)
- explicit execute pivot (task runs only after execute signal)
- ADD/CORRECT/CONFLICT/SUPERSEDE during execution (classification and reconciliation)
- dirty tracked and untracked user files (scope protection)
- two hosts attempting to write the same worktree (single writer lease)
- restart/compaction/resume (intent/progress preserved)
- unauthorized commit/push/delete canaries (authority gates)
- exact planner/reviewer invocation counts (bounded planner: one draft + at most one correction)
- all 8 native host surfaces (global behavior must work on every host via its native projection)

Credential-free rule: For signed-out hosts, prove deterministic native hook/plugin/state-machine behavior credential-free. Do not claim model semantic behavior PASS without a real model turn.

## Constraints
- Do not duplicate native installer, registry, skill/MCP, artifact, closure, or communication work already present in active plan.
- Extend existing acceptance model and implementation only where necessary.

## Reconciliation against current plan

Existing completed work (preserved, not duplicated):
- Canonical registry upgraded to NativeHostContract v3 with 8 hosts
- RunStore + single truth path EvidenceLedger→AcceptanceAudit→OutcomeReducer
- Skill single-source migration (SKILL.md metadata, no ROUTE.json, candidate-fabric archived)
- MCP separated from core install (bridge only)
- Operator-profile fully removed (overlays cleaned, CLI/doctor/host-projection purged, rules reduced to 5)
- Public CLI trimmed to 8, maintainer hidden behind dev
- Build green after context-graph fix

Pending work (extended, not restarted):
- Per-host transactional installer already implemented via NativeInstaller class; needs integration with global authority leases and disposable-repo acceptance tests
- Host native installs (8 hosts) require final certification with global behavior extension
- Verification must now include disposable-repo tests for global behavior (plan-only denial, execute pivot, classification, leases, etc.)
- OutcomeReducer must enforce hidden authority states ADVISORY→…→TERMINAL and writer-lease single-writer invariant

No prior requirement is dropped. New acceptance items are ADD to the effective contract.
