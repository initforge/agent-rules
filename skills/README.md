# Skills

**Vai trò:** Capability lazy-load — chỉ nạp khi trigger khớp.  
**Ý đồ:** Giảm context; mỗi skill có Use when / Do NOT / phrase bank.

| Slug | Khi nào | Status |
|---|---|---|
| `plan-and-handoff` | Executable plan, automatic handoff, adaptive economy/standard/expert routing | active |
| `implementation-discovery` | Verify gate — read-only in plan-only modes; known-unknowns lúc implement | DEPRECATED |
| `finish-to-completion` | Execution mode only — implement locked slice | active |
| `quality` | Code quality gate + maintainability review (merged clean-code + code-review) | active |
| `researcher` | Cần research trước khi code | active |
| `docs-style` | README/spec chất lượng | active |
| `best-of-n` | User yêu cầu thử N cách | active |
| `context-evolution-protocol` | Tiến hoá rules/context | active |
| `frontend-architect` | UI/UX polish outside ERP (references ui-taste for taste lens) | active |
| `master-image-generation` | Mockup / image-to-code | active |
| `qa-skills` | Não QA — map `petrkindlmann/qa-skills`; combo với `browser-qa` | active |
| `parity-verification` | Visual, responsive, behavioral parity across dimensions; claim-based proof loop | active |
| `browser-qa` | Mắt+tay coding agent (Chrome DevTools / Playwright MCP) | active |

Deprecated skills (retained for reference only):
| `clean-code` | Merged into `quality` | DEPRECATED |
| `code-review` | Merged into `quality` | DEPRECATED |

Mỗi skill: một thư mục `SKILL.md` + references/scripts tùy nhu cầu.

Profile skills (e.g. `5fedu-project`, `5fedu-module-parity`) live under `profiles/<name>/skills/` and are installed via `profiles\install-profile.ps1 -Name <name>`. They are not listed in the main table above.
