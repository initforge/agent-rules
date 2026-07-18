---
alwaysApply: true
description: Cursor-specific runtime delta for agent-rules harness.
---

# Cursor overlay

**Ý đồ:** Cursor dùng `~/.cursor/rules`, `~/.cursor/skills`, và MCP qua `~/.cursor/mcp.json` (JSON `mcpServers`). Canonical source vẫn là repo `agent-rules`; đây chỉ là delta cài runtime.

- MCP adapter format: JSON `mcpServers` trong `~/.cursor/mcp.json` — không dùng TOML như Codex.
- Rules nạp từ `~/.cursor/rules/` sau khi chạy `automation/02-install-runtime.ps1 -Platform cursor`.
- Skills nạp từ `~/.cursor/skills/` (slug phẳng, không lớp category).
- Không reverse-sync runtime skills/rules về canonical trừ qua `automation/07-import-reviewed-changes.ps1` đã review.
- Plan artifacts: `.cursor/plans/` or in-chat **PAF** per `skills/plan-and-handoff/references/plan-artifact-template.md`; tier routing in `references/capability-tier-routing.md`.
- Live/manual UI proof → load `qa-skills` + `browser-qa`; không auto-browser source-only task.
