# skill-mcp-fabric-v1 — owner-authorized phase plan (original intent)

This file preserves the raw owner directive verbatim. It is immutable intent;
the plan, ledger, and implementation are derived projections.

---

Raw owner brief (received 2026-08-14, transmitted as the "ONE-SHOT
OWNER-AUTHORIZED EXECUTION BRIEF — SKILL / MCP / CAPABILITY / PROVIDER FABRIC
RECONCILIATION"):

Phase ID: skill-mcp-fabric-v1

Scope authorized: reconcile all research about skills, MCP, CLI, middleware,
code-intelligence, providers, plugins and external domain packs; distinguish
capability, provider, transport, middleware, skill and policy; update candidate
fabric and source governance; implement routing/activation/provider lifecycle
per plan; keep global MCP=none; keep Pencil explicit-only; keep kernel
ownership of scope, planning, verification, evidence, completion, repair,
recovery and acceptance; preserve legacy behavior until parity; implement
Phase 0 through Phase 5 in one bounded execution; do not commit, push or
deploy.

Do not run concurrently with the active plan. Read the current pointer,
determine the relation to the current plan, create a new plan or a valid
amendment per AGENTS.md, and update the pointer through a transaction/CAS with
the correct generation. If the pointer has changed since this prompt was
written, re-read state and never overwrite newer state.

Default owner decisions (authorized in the brief):

1. Create a new phase; do not silently amend the old plan.
2. Serena remains explicit experimental until promotion evidence exists.
3. RTK is shell middleware; Codex is best-effort until a hard hook exists.
4. Decision fabric uses deterministic Task Facts + graph-bound routing;
   semantic matching is only optional discovery.
5. The external candidate selected set stays non-empty only when hard gates
   pass.
6. Capability aliases use additive migration first; keep legacy aliases until
   parity and migration evidence complete.

Non-negotiable invariants from the brief: preserve raw intent and traceability;
workers never author PASS; never skip/weaken/hard-disable verification;
forbidden-scope edits fail closed; missing business/source truth, authority or
capability is BLOCKED/NEEDS_USER, never invented; repair bounded; strong
planners compile then exit; subagents default zero (max two, non-overlapping,
no recursion); never delete proven legacy behavior before route/installer/
schema/behavioral/acceptance parity and regression evidence; never commit/push/
deploy outside scope; no concurrent goals on the same worktree; global MCP=none;
Pencil explicit-only (never triggered by words such as UI/design/frontend);
marketplace/scanner/"official" is never sufficient for trust (provenance,
immutable revision, content hash, license, security review, permission review,
behavioral evaluation, rollback required); `requires` describes true dependency
only; semantic keyword matching only for optional discovery, never for
security/verification/scope/completion/migration/permission/acceptance or
fail-closed decisions; raw session JSONL is never an instruction source.

Implementation phases mandated: Phase 0 gate/plan/pointer CAS/inventory; Phase 1
taxonomy + compatibility projection + schema/registry impact + tests; Phase 2
routing/activation classes + deterministic Task Facts + domain routing +
fallback receipts + provider lifecycle; Phase 3 external candidate
reconciliation + source lock + license/security/provenance +
preview/install/verify/rollback metadata + plugin governance; Phase 4 bounded
skill migration + aliases + graph/route compatibility + generated artifact
regeneration + docs; Phase 5 evals + verification + acceptance + rollback
validation + final evidence ledger + cleanup only when parity proven.

Final handoff must report: plan ID; pointer generation/CAS result; plan
relation; owner decisions; files changed; files not changed with reasons; local
skill disposition matrix; external source matrix; installed/materialized
providers; candidate/rejected/blocked sources; source revisions/hashes/
licenses; commands run; tests/evals run; evidence per REQ/CLM; route and
fallback receipts; parity status vs legacy behavior; rollback procedure; known
risks; unresolved items; acceptance status; next phase if any. Never say
"complete" while required work remains; never self-author PASS; report
BLOCKED/NEEDS_USER with the exact blocker and minimal unblock action.
