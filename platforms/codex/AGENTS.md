@C:\Users\DELL\.codex\RTK.md
@C:\Users\DELL\.codex\rules\00-runtime-and-intent.md
@C:\Users\DELL\.codex\rules\01-agent-workflow-sop.md
@C:\Users\DELL\.codex\rules\02-code-quality-and-debt.md
@C:\Users\DELL\.codex\rules\03-context-and-tools.md
@C:\Users\DELL\.codex\rules\04-skills-and-5fedu.md
@C:\Users\DELL\.codex\rules\05-harness-mutation-gate.md
@C:\Users\DELL\.codex\rules\06-opus-emulation-contract.md
@C:\Users\DELL\.codex\rules\codex-overlay.md
@C:\Users\DELL\.codex\rules\00-universal-frontier-contract.md
@C:\Users\DELL\.codex\rules\platform-boundary.md

# Bộ Nạp Runtime Codex

Entrypoint global Codex CLI. Lõi rule **Opus-emulation** — đồng bộ từ repo root qua `scripts/sync-all-harness.sh`.

## Nguồn Runtime

```text
~/.codex/              ← daily
agent-rules/codex/     ← backup/bootstrap
agent-rules/grok/      ← harness master
```

## Ngôn Ngữ

Tiếng Việt có dấu; giữ tiếng Anh cho thuật ngữ kỹ thuật, path, code.

## Vận Hành Mặc Định

- Mặc định **MEDIUM** (Opus-emulation).
- HIGH: DB/auth/5fedu UI/production → locked plan, verify sâu.
- Không tự commit/push/deploy.
- Trạng thái: `PASS` | `PARTIAL` | `BLOCKED`.

## Skills

Đọc `04-skills-and-5fedu.md` — source `skills/` hoặc runtime `~/.codex/skills/`.

## 5fedu

Detection: `.codex/5fedu/` — skill `5fedu-project` + `00-index.md`.
