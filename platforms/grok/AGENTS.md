# Grok CLI Runtime Entrypoint

Đọc khi chạy **Grok CLI** (`grok` command). Live: `.grok/rules/` + `.grok/skills/`.

## Harness

```text
grok/rules/ + grok/skills/   ← MASTER (sửa ở đây)
.grok/                       ← live (Grok scan)
~/.grok/                     ← global user
```

Sync: `./grok/scripts/sync-all-harness.sh` · Verify: `grok inspect`

Codex/Antigravity dùng **cùng lõi** — sync script copy sang `codex/rules/` và `.agents/rules/`.

## Rules live (10)

`00-runtime-and-intent` · `01-agent-workflow-sop` · `02-code-quality-and-debt` · `03-context-and-tools` · `04-skills-and-5fedu` · `05-harness-mutation-gate` · `06-opus-emulation-contract` · **`07-finish-to-completion`** · `platform-boundary` · `grok-overlay`

## Ngôn ngữ

Tiếng Việt có dấu; giữ tiếng Anh cho tool, API, path, code.

## Mặc định

Task **MEDIUM** (Opus-emulation). `PASS` | `PARTIAL` | `BLOCKED`. Không tự commit/push/deploy.

5fedu: `.grok/5fedu/` — skill `5fedu-project` cài vào dự án khách.

Docs: `docs/07-grok-cli-harness.md`, `docs/06-harness-philosophy.md`.