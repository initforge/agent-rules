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
| `03-validate-context.ps1` | Layout, budget, mojibake, **route conformance**, trigger audit and maturity checks |
| `04-verify-mirrors.ps1` | Parity skills/rules giữa platforms |
| `05-verify-runtime-state.ps1` | Manifest + integration state đã cài |
| `06-export-runtime-state.ps1` | JSON trạng thái runtime (debug) |
| `07-import-reviewed-changes.ps1` | Import ngược + tombstone (`.agent/tombstones/`) |
| `08-install-5fedu-context.ps1` | Cài `context/5fedu/` — `-Profile tah-app|nostime`, `-UpdatePointersOnly`, `-Force` |
| `09-doctor.ps1` | Post-install health (sha256, integrations, MCP); thêm `-SkipIntegrationVerify` khi chỉ cần kiểm tra cấu trúc/runtime parity mà không gọi probe mạng |
| `10-audit-harness-health.ps1` | Full harness health audit (manual; findings by category) |
| `audit-plan-artifact.ps1` | Executable-plan contract, adaptive routing and optional `-PlanPath` checks |
| `workctl.py` + wrappers | Automatic size/risk classification, ownership, resumable ledger, proof, review and finalization |
| `work-ledger.schema.json` | Canonical source/injection, slice, assignment, receipt, review and usage contract |
| `evidence-profiles.json` | Generic typed proof profiles and required dimensions for adaptive semantic evidence |
| `verify-external-receipt.py` | Provider-neutral CI/deployment receipt identity, SHA, terminal, smoke and rollback validation |
| `test-workctl.py` | Adversarial schema, parallel resume, blocker, proof, independent review, usage and lock regression |
| `test-external-receipt.py` | External CI/deployment evidence contract regression |
| `test-skill-gate-stack.py` | Native graph routing, efficiency reminders and active-skill regression |
| `test-agent-quality-benchmark.py` | Contract, deterministic routing, live-result and report regression |
| `collect-live-results.py` | Validate/normalize externally collected live-agent evidence; never invokes an agent |
| `build-benchmark-runtime.ps1` | Build credential-free isolated Codex homes for baseline/core/full |
| `run-live-benchmark.py` | Execute safe current-runtime native smoke or isolated ablation runs; only ablation requires `CODEX_API_KEY` |
| `verify-live-workspace.py` | Independently verify changed files, expected content, commands, and response contracts |
| `test-live-agent-adapter.py` | Regression tests for the runner, verifier, fixtures, and credential boundary |
| `report-agent-quality.py` | Compare routing, live variants and advisory traces as JSON + Markdown |
| `benchmarks/` | Canonical evidence corpus and schemas; fixtures are tests, not empirical results |
| `10-sync-project-agents.ps1` | Migrate root `AGENTS.md` + extract hard rules to `project-local/` |
| `Merge-Mcp-Adapters.ps1` | Helper: merge staged adapters → platform MCP config |
| `context-route-cases.json` | Versioned route budgets plus executable positive/negative progressive-loading fixtures |
| `context-route-cases.schema.json` | Contract for workspace facts, expected primary/edges and canonical context nodes |
| `trigger-audit.json` | Trigger recall fixtures (dùng bởi 03; không phải runtime router) |
| `audit-ui-routing.ps1` | Audit routing 5fedu UI parity vs frontend-architect |
| `audit-context-pre-commit.sh` | Git pre-commit: audit staged context/harness (oversize, dead path, dead @import). WARN default; `CONTEXT_AUDIT_STRICT=1` block |
| `install-pre-commit-hook.sh` | Cài pre-commit vào repo hiện tại, path chỉ định, hoặc `--global` (core.hooksPath) |
| `11-install-runtime-hooks.sh` | Cài Codex/Antigravity/Grok/Cursor hooks + pre-commit; hook chỉ route/nhắc/ghi native receipt và fail-open |
| `13-cutover-context-routing.ps1` | Bật strict graph routing sau conformance; ghi graph + contract hashes vào `skill-state/routing-mode.json` |

## Linux / macOS

```bash
./automation/run.sh 03-validate-context
./automation/run.sh 04-verify-mirrors
./automation/11-install-runtime-hooks.sh   # hooks runtime (Codex/Grok/Antigravity/Cursor/pre-commit)
./automation/run.sh 13-cutover-context-routing -Mode strict   # chỉ chạy sau khi các gate đã PASS
```
