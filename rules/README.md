# Rules

**Vai trò:** Canonical rules luôn nạp; hành vi tối thiểu mọi agent phải tuân thủ.
**Ý đồ:** Đảm bảo toàn vẹn intent, scope, safety, execution, verification và single-source maintainer governance.

| File | Vai trò | Trọng tâm |
|---|---|---|
| `00-intent-scope-safety.md` | Intent & Safety | Giữ raw intent, bounded scope, fail-closed safety, natural communication |
| `10-execution-planning-delegation.md` | Execution & Planning | Phân biệt authority states, explicit execute pivot, bounded subagents |
| `20-proof-outcome.md` | Verification & Proof | Adaptive minimal proof, worker never authors PASS, single truth closure |
| `30-context-skill-mcp.md` | Skills & MCP | SKILL.md single source, MCP tách khỏi core install |
| `40-maintainer.md` | Maintainer Governance | Canonical source authority, không sửa tay file generated |

Skills: `skills/` (lazy theo trigger từ `SKILL.md`).
