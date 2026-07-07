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

## Plan roles vs capability tier

- **Roles:** Architect | Scribe | Reviewer | Executor | Research Analyst — skill + mode (see `plan-and-handoff`).
- **Tiers L0/L1/L2:** weak-first execute default; `min_tier` per role/phase — details in `skills/plan-and-handoff/references/capability-tier-routing.md`.
- **Weak-first:** execute phases prefer **L0** unless phase `min_tier` higher or owner `force_tier`.
- **PAF format:** `skills/plan-and-handoff/references/plan-artifact-template.md`.
- L0 models OK for Scribe + Executor; Architect/Reviewer deep work → `min_tier L1+`.

## Intake and lane

Classify non-trivial work into `tiny`, `normal`, or `high-risk`.

Risk flags (each that applies): auth; authorization; data model/migration; audit/security; external provider; public contract; cross-platform; existing tested behavior; weak proof; multi-domain.

Hard gate → `high-risk`: auth; authorization; data loss/migration; audit/security; external provider; weakening validation.

## File-count gate (hard)

Scope chạm **≥2 distinct files** (create/modify/delete) trong deliverable → **cấm** lane `tiny`; tối thiểu `normal` (task dài).
Scope **đúng 1 file** và không có hard gate high-risk → mới được `tiny`.
Module mới: đếm cả file registry (`App.tsx`, sidebar, breadcrumbs, registry, module views) tại intake — không giảm xuống tiny.

Lane behavior:
- `tiny` (1 file only): patch trực buộc; quick hard-block check (N+1, secrets, async loading/error); skip plan/review ceremony; minimal trace. **Only when mode=`execution`.**
- `normal` (≥2 files OR standard work): scope lock + `finish-to-completion` when mode=`execution`; discovery verify before code; bounded validation. `plan-and-handoff` when multi-phase execution or ambiguous — not every normal task. When mode is plan-only, lane n/a — prefer plan-and-handoff over finish.
- `high-risk`: pause if ambiguous; `plan-and-handoff` bắt buộc before execute; `implementation-discovery`; strongest verification; optional `clean-code` smell detect; detailed trace.

Mid-task unknown that is must-not-self-decide (credentials, schema/migration, permission rule, large destructive change) → `BLOCKED` and record blocker per `implementation-discovery` escape-hatch — do not guess.

## Self-report trace (in response)

End task reports with: `Status` (PASS/PARTIAL/BLOCKED), `Lane`, files/layers changed, verification evidence, `Friction` (or `none`). Depth follows lane: tiny = minimal; normal = standard; high-risk = detailed.

## Advisory durable log

After `normal` or `high-risk` tasks, append one JSON line to `<working-repo>/.agent/trace.jsonl`:

`ts, lane, status, task_summary, files_changed, verification, friction`

Optional when PAF workflow: `plan_id`, `phase`, `revision`, `tier_used`, `escalation_reason`

`.agent/` is gitignored. This is advisory — not enforced from canonical. Repeated friction is a signal for `context-evolution-protocol` (human review only).
