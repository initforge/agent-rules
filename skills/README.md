# Skills

**Vai trò:** Capability lazy-load — chỉ nạp khi trigger khớp.  
**Ý đồ:** Giảm context; mỗi skill có Use when / Do NOT / phrase bank.

| Slug | Khi nào |
|---|---|
| `plan-and-handoff` | Executable plan, automatic handoff, adaptive economy/standard/expert routing |
| `implementation-discovery` | Verify gate — read-only in plan-only modes; known-unknowns lúc implement |
| `finish-to-completion` | Execution mode only — implement locked slice |
| `clean-code` | Kiểm tra chất lượng mã sạch cuối pha execution |
| `researcher` | Cần research trước khi code |
| `docs-style` | README/spec chất lượng |
| `code-review` | Review thay đổi |
| `best-of-n` | User yêu cầu thử N cách |
| `context-evolution-protocol` | Tiến hoá rules/context |
| `frontend-architect` | UI/UX polish outside ERP (forbidden when profile ERP parity is active) |
| `master-image-generation` | Mockup / image-to-code |
| `qa-skills` | Não QA — map `petrkindlmann/qa-skills`; combo với `browser-qa` |
| `parity-verification` | Visual, responsive, behavioral parity across dimensions; claim-based proof loop |
| `browser-qa` | Mắt+tay coding agent (Chrome DevTools / Playwright MCP) |

Mỗi skill: một thư mục `SKILL.md` + references/scripts tùy nhu cầu.

Profile skills (e.g. `5fedu-project`, `5fedu-module-parity`) live under `profiles/<name>/skills/` and are installed via `profiles\install-profile.ps1 -Name <name>`. They are not listed in the main table above.
