# Skills

**Vai trò:** Capability lazy-load — chỉ nạp khi trigger khớp.  
**Ý đồ:** Giảm context; mỗi skill có Use when / Do NOT / phrase bank.

| Slug | Khi nào | Status |
|---|---|---|
| `plan-and-handoff` | Executable plan, automatic handoff, adaptive economy/standard/expert routing | active |
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
| `browser-qa` | Mắt+tay coding agent (Playwright CLI default; MCP/DevTools on demand) | active |

| `verification-router` | Claim/risk-based verifier selection, evidence profiles, and deterministic replay | active |

Archived/deprecated skills live under `docs/history/skills/` and are not routable.

Deprecated skills retained only as history:
| `clean-code` | Merged into `quality` | DEPRECATED |
| `code-review` | Merged into `quality` | DEPRECATED |

Mỗi skill: `SKILL.md` portable theo Agent Skills + `ROUTE.json` dành riêng cho deterministic agent-rules routing; references/scripts chỉ nạp theo nhu cầu.

`skills/catalog.json` là ownership/disposition matrix cho 14 core skills và 2
profile skills. Nó không phải prompt context hay provider registry: nội dung skill
vẫn canonical ở `SKILL.md`, routing ở `ROUTE.json`, còn catalog chỉ ghi owner,
consumer, overlap, migration/disposition và removal gate. Catalog phải pass
`automation/validate-skill-catalog.py` trước khi certification.

`skills/candidate-fabric.json` là inventory planning tách riêng cho chín
candidate composable của AM-010: frontend design contract, mobile, backend,
database, migration, infra/DevOps, security, claim-based testing và
external-skill governance. Mỗi candidate có owner, activation bằng facts,
inputs/outputs, capability, eval và removal path. Chúng chưa phải skill đã
cài, không vào generated graph và không được kích hoạt chỉ bởi keyword. Data
Engineering vẫn nằm ngoài scope đã duyệt.

Profile skills (e.g. `5fedu-project`, `5fedu-module-parity`) live centrally under `profiles/<name>/skills/`. Project/domain packs are explicitly activated; target projects do not need to vendor the skill/template source.
