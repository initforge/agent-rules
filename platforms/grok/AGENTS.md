# Grok CLI Runtime Entrypoint

Đọc khi chạy **Grok CLI** (`grok` command). Live: `.grok/rules/` + `.grok/skills/`.

## Harness

```text
rules/ + skills/             ← MASTER dùng chung
.grok/                       ← live (Grok scan)
~/.grok/                     ← global user
```

Sync: `./scripts/sync-all-harness.sh` · Verify: `grok inspect`

Codex/Antigravity dùng **cùng lõi** — sync script copy sang platform mirror/runtime tương ứng.

## Rules live (10)

`00-runtime-and-intent` · `01-agent-workflow-sop` · `02-code-quality-and-debt` · `03-context-and-tools` · `04-skills-and-5fedu` · `05-harness-mutation-gate` · `06-opus-emulation-contract` · **`07-finish-to-completion`** · `platform-boundary` · `grok-overlay`

## Ngôn ngữ

Tiếng Việt có dấu; giữ tiếng Anh cho tool, API, path, code.

## Mặc định

Task **MEDIUM** (Opus-emulation). `PASS` | `PARTIAL` | `BLOCKED`. Không tự commit/push/deploy.

Prompt dài, dữ liệu rời rạc, multi-domain hoặc HIGH risk phải qua **Intent Fidelity Gate**, **Long Prompt Compiler**, và **Locked Plan Acceptance Gate** trong `rules/01-agent-workflow-sop.md` trước khi implement. Plan thiếu current-state evidence, interface/schema map, business linkage map, unknowns, verification matrix, hoặc PASS/PARTIAL criteria thì phải ghi `PLAN NOT LOCKED`. Không tự bịa bảng/field/API/route/module; mọi claim "đã làm/đã test/đã sync/đã deploy" phải có evidence trực tiếp. UI/web/admin/public/production phải có browser verification evidence trước PASS.

5fedu: `.grok/5fedu/` — skill `5fedu-project` cài vào dự án khách.

Docs: `docs/07-grok-cli-harness.md`, `docs/06-harness-philosophy.md`.
