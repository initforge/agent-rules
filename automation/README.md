# Automation

**Vai trò:** Build, cài, validate, sync — chạy theo số thứ tự.  
**Ý đồ:** Script là cầu nối canonical → runtime; không sửa tay `05-generated/`.

**Prerequisite:** [PowerShell Core](https://github.com/PowerShell/PowerShell) (`pwsh`) on Linux/macOS/Windows.

| Script | Mục đích |
|---|---|
| `run.sh` | Cross-platform entrypoint: `./automation/run.sh <script-name>` |
| `01-build-runtime.ps1` | Build `05-generated/runtime-build/` |
| `build-context-graph.ps1` | Generate progressive context graph from canonical rules, skills, projects, platforms and integrations |
| `context-graph.schema.json` | Contract for graph nodes, routing metadata, ownership and source hashes |
| `02-install-runtime.ps1` | Cài vào ~/.codex, ~/.grok, ~/.gemini/config, ~/.cursor + doctor; hỗ trợ `AGENT_RULES_SKIP_RUNTIME_HOOKS=1`, `AGENT_RULES_SKIP_INTEGRATION_INSTALL=1` và `AGENT_RULES_SKIP_INTEGRATION_VERIFY=1` cho cập nhật cục bộ/parity nhanh |
| `03-validate-context.ps1` | Layout, budget, mojibake, **trigger audit**, maturity structural checks |
| `04-verify-mirrors.ps1` | Parity skills/rules giữa platforms |
| `05-verify-runtime-state.ps1` | Manifest + integration state đã cài |
| `06-export-runtime-state.ps1` | JSON trạng thái runtime (debug) |
| `07-import-reviewed-changes.ps1` | Import ngược + tombstone (`.agent/tombstones/`) |
| `08-install-5fedu-context.ps1` | Cài `context/5fedu/` — `-Profile tah-app|nostime`, `-UpdatePointersOnly`, `-Force` |
| `09-doctor.ps1` | Post-install health (sha256, integrations, MCP); thêm `-SkipIntegrationVerify` khi chỉ cần kiểm tra cấu trúc/runtime parity mà không gọi probe mạng |
| `10-audit-harness-health.ps1` | Full harness health audit (manual; findings by category) |
| `audit-plan-artifact.ps1` | PAF wiring + tier routing + path conflict checks; optional `-PlanPath` |
| `planctl.ps1` | Compile/validate Markdown PAF, persist scoped state/evidence, generate handoff/report |
| `audit-slice-ledger.ps1` | Scoped AC/evidence gate; blocks false PASS and open/blocker ledgers |
| `test-planctl.ps1` | Fixture regression for semantic plan and ledger validation |
| `10-sync-project-agents.ps1` | Migrate root `AGENTS.md` + extract hard rules to `project-local/` |
| `Merge-Mcp-Adapters.ps1` | Helper: merge staged adapters → platform MCP config |
| `context-route-cases.json` | Route budgets và positive/negative progressive-loading fixtures (CI-only) |
| `trigger-audit.json` | Trigger recall fixtures (dùng bởi 03; không phải runtime router) |
| `audit-ui-routing.ps1` | Audit routing 5fedu UI parity vs frontend-architect |
| `audit-context-pre-commit.sh` | Git pre-commit: audit staged context/harness (oversize, dead path, dead @import). WARN default; `CONTEXT_AUDIT_STRICT=1` block |
| `install-pre-commit-hook.sh` | Cài pre-commit vào repo hiện tại, path chỉ định, hoặc `--global` (core.hooksPath) |
| `11-install-runtime-hooks.sh` | Cài Codex/Antigravity/Grok hooks + pre-commit (idempotent). Codex dùng `hooks.json` + Python absolute path và `commandWindows`; smoke test cuối |
| `13-cutover-context-routing.ps1` | Đổi runtime từ shadow sang strict (hoặc rollback về shadow) sau khi graph/route gates đã PASS; ghi graph hash vào `skill-state/routing-mode.json` |

## Linux / macOS

```bash
./automation/run.sh 03-validate-context
./automation/run.sh 04-verify-mirrors
./automation/11-install-runtime-hooks.sh   # hooks runtime (Codex/Antigravity/pre-commit)
./automation/run.sh 13-cutover-context-routing -Mode strict   # chỉ chạy sau khi các gate đã PASS
```
