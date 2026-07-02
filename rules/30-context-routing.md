---
alwaysApply: true
description: Progressive context loading and capability activation.
---

# Context routing

Load progressively:

1. Bootstrap and repository entrypoint.
2. Files/interfaces nearest the task.
3. One matching capability from its `SKILL.md` metadata.
4. Capability references/scripts only when the procedure requires them.
5. Project context index, then only domain packs matching the task.
6. External documentation only for unstable, unfamiliar or explicitly requested facts.

The `description` frontmatter of each capability is the trigger source of truth. Do not maintain a second handwritten trigger table. If multiple capabilities match, choose a primary capability and add only the minimum supporting set.

## Capability precedence (5fedu UI)

When the active repo has `context/5fedu/` and the task matches UI parity triggers (lệch, sai pattern, drawer, listview, toolbar, template, nhập hàng lệch):

1. **Primary:** `context/5fedu/domains/ui-delivery.md` + `module-mapping.md` — not `frontend-architect`.
2. **Cấm** dùng `frontend-architect` hoặc `master-image-generation` làm nguồn chính cho parity ERP.
3. `frontend-architect` chỉ khi: branding/landing/redesign **ngoài** module shell ERP, và owner không yêu cầu đối chiếu template Nhân viên.

Keep always-loaded context stable and small. Put durable, reusable instructions before variable project facts; put volatile examples, raw evidence and long domain details behind indexes, skills or references so prompt-cache prefixes and context windows are not churned by every task.

Do not spend context on verification channels before they are needed. Prefer command output, test results, source diffs, database/API queries and generated artifact inspection over browser sessions when those prove the behavior. Browser traces/screenshots are high-context evidence and should be opt-in or risk-justified by the active platform overlay.

Code intelligence order: Codebase Memory MCP when available and indexed; otherwise `rg`, targeted reads and native navigation. Never preload an entire repository to compensate for a missing index.

Raw logs, chat evidence, old decisions and generated mirrors are never default context.
