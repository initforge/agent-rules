# Bộ Nạp Runtime Chung

Lớp tương thích cho project còn import:

```text
@P:\agent-rules\global-rules.md
```

Nguồn Codex: `P:\agent-rules\rules` + `P:\agent-rules\platforms\codex` · Master harness: `P:\agent-rules`

## Rules (Opus-emulation — đồng bộ từ grok/)

```text
@P:\agent-rules\rules\00-runtime-and-intent.md
@P:\agent-rules\rules\01-agent-workflow-sop.md
@P:\agent-rules\rules\02-code-quality-and-debt.md
@P:\agent-rules\rules\03-context-and-tools.md
@P:\agent-rules\rules\04-skills-and-5fedu.md
@P:\agent-rules\rules\05-harness-mutation-gate.md
@P:\agent-rules\rules\06-opus-emulation-contract.md
@P:\agent-rules\rules\07-finish-to-completion.md
@P:\agent-rules\rules\00-universal-frontier-contract.md
@P:\agent-rules\platforms\codex\rules\codex-overlay.md
@P:\agent-rules\rules\platform-boundary.md
```

## Ranh giới

- Global: hành vi chung, verification, git safety — không logic dự án cụ thể.
- 5fedu: skill `5fedu-project` + `.codex/5fedu/` hoặc `.agents/5fedu/` trên repo dự án.
- Sync harness: `scripts/sync-all-harness.sh`

## Ngôn ngữ
Tiếng Việt có dấu; giữ tiếng Anh cho tool, API, path, code. Giao tiếp tối giản, trực diện, không rườm rà hay giải thích dông dài.
