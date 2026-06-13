# Grok CLI Harness — Intent

```text
grok/rules/ + grok/skills/   ← master
.grok/                       ← Grok CLI live
```

Rules alone không đủ — phải có `.grok/skills/` (sync từ `grok/skills/`).

5fedu context: skill cài `.grok/5fedu/` trên dự án khách.

Sync: `./grok/scripts/sync-all-harness.sh` — đồng thời cập nhật Codex + Antigravity rules.

Mutation gate: agent không tự sửa harness khi làm task thường (`05-harness-mutation-gate.md`).