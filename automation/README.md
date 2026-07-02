# Automation

**Vai trò:** Build, cài, validate, sync — chạy theo số thứ tự.  
**Ý đồ:** Script là cầu nối canonical → runtime; không sửa tay `05-generated/`.

**Prerequisite:** [PowerShell Core](https://github.com/PowerShell/PowerShell) (`pwsh`) on Linux/macOS/Windows.

| Script | Mục đích |
|---|---|
| `run.sh` | Cross-platform entrypoint: `./automation/run.sh <script-name>` |
| `01-build-runtime.ps1` | Build `05-generated/runtime-build/` |
| `02-install-runtime.ps1` | Cài vào ~/.codex, ~/.grok, ~/.gemini/config, ~/.cursor + doctor |
| `03-validate-context.ps1` | Layout, budget, mojibake, **trigger audit**, maturity structural checks |
| `04-verify-mirrors.ps1` | Parity skills/rules giữa platforms |
| `05-verify-runtime-state.ps1` | Manifest + integration state đã cài |
| `06-export-runtime-state.ps1` | JSON trạng thái runtime (debug) |
| `07-import-reviewed-changes.ps1` | Import ngược + tombstone (`.agent/tombstones/`) |
| `08-install-5fedu-context.ps1` | Cài `context/5fedu/` — `-Profile tah-app|nostime`, `-UpdatePointersOnly`, `-Force` |
| `09-doctor.ps1` | Post-install health (sha256, integrations, MCP) |
| `Merge-Mcp-Adapters.ps1` | Helper: merge staged adapters → platform MCP config |
| `trigger-audit.json` | 18 câu test precision/recall (dùng bởi 03) |

## Linux / macOS

```bash
./automation/run.sh 03-validate-context
./automation/run.sh 04-verify-mirrors
```
