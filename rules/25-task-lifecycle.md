---
alwaysApply: true
description: Intake lane, risk gate, self-report trace, and advisory durable log.
---

# Task lifecycle

## Workflow mode (infer first — before lane)

| Mode | Typical signals | Deliverable | Code edits |
|---|---|---|---|
| `advisory` | explain, compare, Q&A | answer | no |
| `plan-authoring` | survey, `/goal`, plan for agent khác | PAF artifact + report | **no (HB-1)** |
| `plan-review` | pasted `[Plan]` input, review plan, phân tích plan | gap list + PAF patch hints | **no until pivot (HB-1, HB-2)** |
| `execution` | implement, fix, làm đi, execute; pivot phrase (HB-2) | code + verify | yes |

**Hard boundaries (HB-1, HB-3):**
- plan-authoring / plan-review → no working-repo source edits (read-only tools OK).
- Pasted plan alone → default plan-review, not execution scope lock.

**Pivot (HB-2):** switch to execution only on explicit pivot phrases (see `10-execution.md`).

Lane (tiny/normal/high-risk) applies when mode=`execution` only.

## Plan roles and capability tier

Plan roles and L0/L1/L2 routing belong to `plan-and-handoff`; load them only for plan work.

## Intake and lane

Classify non-trivial work into `tiny`, `normal`, or `high-risk`.

Risk flags (each that applies): auth; authorization; data model/migration; audit/security; external provider; public contract; cross-platform; existing tested behavior; weak proof; multi-domain.

Hard gate → `high-risk`: auth; authorization; data loss/migration; audit/security; external provider; weakening validation.

## File-count gate (hard)

Scope chạm **≥2 distinct files** (create/modify/delete) trong deliverable → **cấm** lane `tiny`; tối thiểu `normal` (task dài).
Scope **đúng 1 file** và không có hard gate high-risk → mới được `tiny`.
Module mới: đếm cả file registry (`App.tsx`, sidebar, breadcrumbs, registry, module views) tại intake — không giảm xuống tiny.

Lane behavior:
- `tiny` (1 file only): direct patch, quick safety check, minimal report.
- `normal` (≥2 files OR standard work): scope lock, bounded discovery and verification.
- `high-risk`: pause if ambiguous; `plan-and-handoff` bắt buộc before execute; `implementation-discovery`; strongest verification; optional `clean-code` smell detect; detailed trace.

Mid-task unknown that is must-not-self-decide (credentials, schema/migration, permission rule, large destructive change) → `BLOCKED` and record blocker per `implementation-discovery` escape-hatch — do not guess.

## Self-report trace (in response)

Execution reports state outcome and verification. Expose lane or friction only when they change the decision, explain a blocker or are requested.

## Advisory durable log

After `normal` or `high-risk` tasks, append one JSON line to `<working-repo>/.agent/trace.jsonl`:

`ts, lane, status, task_summary, files_changed, verification, friction`

Optional when PAF workflow: `plan_id`, `phase`, `revision`, `tier_used`, `escalation_reason`

`.agent/` is gitignored. This is advisory — not enforced from canonical. Repeated friction is a signal for `context-evolution-protocol` (human review only).
