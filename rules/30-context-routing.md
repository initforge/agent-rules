---
alwaysApply: true
description: Progressive context loading and capability activation.
---

# Context routing

Load progressively:

1. Core and the nearest repository entrypoint.
2. One matching capability from its `SKILL.md` metadata.
3. Project/domain router, then only matching leaf context.
4. References/scripts only when the procedure requires them.
5. External documentation only for unstable, unfamiliar or explicitly requested facts.

The structured `routing` object in each capability frontmatter is the runtime trigger source of truth; `description` remains the human-facing contract. `05-generated/context-graph.json` is compiled from that metadata and consumed by runtime hooks. `automation/trigger-audit.json` and `automation/context-route-cases.json` are **CI/fixture regression checks only** — not a second runtime router. If multiple capabilities match, choose a primary capability and add only the minimum supporting set.

## Context routing ownership

- Setup project context → the project installer skill.
- Domain implementation → the active project router and matching capability.
- Harness edits → `context-evolution-protocol`; load maintainer detail only when syncing/building.

## Mid-flow activation

- Trigger mới khi execute → pause đúng step, chạy capability phụ bounded, rồi quay lại primary; không reset scope/finish loop.
- Chỉ một primary + minimum supporting set; không biến mid-flow thành re-plan. Phụ fail/stall 2 lần → ghi blocker, tiếp tục primary hoặc `BLOCKED`.
- Owner interjection: phân loại lại mode/lane; mở rộng scope → `REVISE`, chỉ đạo nhỏ → nhận vào step hiện tại; giữ `.agent/plans/<plan-id>/progress.md`.

## Capability precedence (project-specific routers)

Project routers own domain precedence. Keep exclusions beside the matching skill; do not copy the same checklist into the global core.

Keep always-loaded context stable and small. Put durable, reusable instructions before variable project facts; put volatile examples, raw evidence and long domain details behind indexes, skills or references so prompt-cache prefixes and context windows are not churned by every task.

Do not spend context on verification channels before they are needed. Prefer command output, test results, source diffs, database/API queries and generated artifact inspection over browser sessions when those prove the behavior. Browser traces/screenshots are high-context evidence and should be opt-in or risk-justified by the active platform overlay.

Code intelligence order: Codebase Memory MCP when available and indexed; otherwise `rg`, targeted reads and native navigation. Never preload an entire repository to compensate for a missing index.

Raw logs, chat evidence, old decisions and generated mirrors are never default context.

## Plan/state routing

- Markdown PAF remains the intent source; `planctl` compiles and validates it.
- State, progress, handoff and ledger stay under `.agent/plans/<plan-id>/`; legacy paths are migration-only.
- Tiny/clear normal work does not require PAF/ledger; multi-phase, high-risk or independently evidenced AC work does.
