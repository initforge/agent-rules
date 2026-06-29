# Antigravity Agent Entrypoint

Master adapter — mirror xuống `.agents/` khi cài. Đọc `.agents/INTENT.md` để hiểu manifest.

## Intent

Antigravity dùng **lõi Opus-emulation chung** với Grok CLI và Codex (`grok/` master → `sync-all-harness.sh`). Khác: **alwaysApply** mọi rule + `antigravity-overlay.md` (status block MEDIUM/HIGH, UI `/template`).

## Required Rules

1. `00-index.md` (Knowledge Routing Index)
2. `00-runtime-and-intent.md`
3. `06-opus-emulation-contract.md`
4. `01-agent-workflow-sop.md`
5. `04-skills-and-5fedu.md`
6. `antigravity-overlay.md`
7. `02-code-quality-and-debt.md`, `03-context-and-tools.md`, `05-harness-mutation-gate.md`, `platform-boundary.md`

Tất cả file trong `.agents/rules/` có `alwaysApply: true`.

## Protected

Không cleanup: `AGENTS.md`, `INTENT.md`, `hooks.json`, `rules/`, `skills/5fedu-project/`, `workflows/`, `5fedu/00-index.md`.