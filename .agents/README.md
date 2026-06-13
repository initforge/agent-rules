# Antigravity Workspace Runtime

Live copy của adapter `antigravity/.agents/`. Đồng bộ từ `grok/` master.

## Rules (alwaysApply)

1. `00-runtime-and-intent.md`
2. `06-opus-emulation-contract.md`
3. `01-agent-workflow-sop.md`
4. `04-skills-and-5fedu.md`
5. `antigravity-overlay.md`
6. `02-code-quality-and-debt.md`, `03-context-and-tools.md`, `05-harness-mutation-gate.md`, `platform-boundary.md`

## Sync

```bash
# Từ repo agent-rules
./grok/scripts/sync-all-harness.sh
./grok/scripts/validate-harness.sh
```

Đọc `INTENT.md` và `AGENTS.md` trước mọi task.