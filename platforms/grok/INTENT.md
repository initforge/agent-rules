# Grok CLI Harness — Intent

```text
rules/ + skills/             ← master dùng chung
.grok/                       ← Grok CLI live
```

Rules alone không đủ — phải có `.grok/skills/` (sync từ `skills/`).

5fedu context: skill cài `.grok/5fedu/` trên dự án khách.

Sync: `./scripts/sync-all-harness.sh` — đồng thời cập nhật Codex + Antigravity rules.

Mutation gate: agent không tự sửa harness khi làm task thường (`05-harness-mutation-gate.md`).
