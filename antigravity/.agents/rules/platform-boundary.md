---
description: >-
  Ranh gioi Codex vs Antigravity vs Grok mirror. Chi doc de khong sua cheo runtime.
alwaysApply: false
---

# Platform Native Harness

Repo `agent-rules` = **một master** (`codex/rules`, `codex/skills`) → **ba runtime native**, **cùng chuẩn frontier**. Chi tiết: `00-universal-frontier-contract.md`.

**Không** routing “task cực → đổi platform”. User chọn 1 tool → harness đủ build phức tạp.

## Master vs runtime

| Layer | Path | Ai sửa |
|---|---|---|
| Master rules/skills | `codex/rules/`, `codex/skills/` | Dev harness |
| Grok global | `~/.grok/` | `install-grok-global.sh` |
| Codex global | `~/.codex/` | `install-codex-global.sh` |
| Antigravity project | `.agents/` (+ `~/.gemini/GEMINI.md`) | `sync-all-harness` + adapter |

```bash
bash scripts/sync-all-harness.sh   # mirror + auto global install
```

## Cách mỗi platform nạp rules

### Grok CLI

- `~/.grok/.grok/rules/` + `~/.grok/skills/`
- Hooks: `~/.grok/hooks/skill-orchestrator.json` (PreToolUse mechanical)
- Không cần frontmatter

### Codex CLI

- `~/.codex/rules/` via `AGENTS.md` `@import`
- Profiles: `agents/*.toml`
- Hooks: `~/.codex/hooks/skill-orchestrator.json`
- Overlay: `codex-overlay.md` (Codex-only rule file)

### Antigravity IDE

- Global: `~/.gemini/GEMINI.md`
- Project: `.agents/rules/*.md` — **bắt buộc YAML frontmatter**
- Workflows: `.agents/workflows/*.md` slash commands
- Preflight: `scripts/antigravity-preflight-run.sh` (PreInvocation)
- **Không** đọc `AGENTS.md` import chain; **không** đọc `agents/*.toml`

## Cùng gì / khác gì

| | Grok | Codex | Antigravity |
|---|---|---|---|
| Skill content | ✅ mirror | ✅ mirror | ✅ mirror |
| Turn-0 + Visible Echo | ✅ | ✅ | ✅ (Always On) |
| E2E ladder | hook | hook + rule | rule + workflow + self-check |
| Multi-skill stack | ✅ | ✅ + workflow-router | ✅ + slash |
| Complex project solo | ✅ | ✅ | ✅ |
| Mechanical terminal gate | mạnh nhất | hook (nếu bật) | self-checkpoint |

## File chỉ một platform

| File | Platform |
|---|---|
| `00-codex-runtime-intent.md` | Codex (skip Antigravity sync) |
| `codex-overlay.md` | Codex |
| `00-antigravity-runtime-intent.md` | Antigravity |
| `codex/agents/*.toml` | Codex |
| `antigravity/.agents/workflows/` | Antigravity (mirror → `.agents/workflows`) |
| `grok/hooks/` | Grok install source |
| `codex/hooks/` | Codex install source |

## Ranh giới bảo trì

- Sửa **nội dung** rule/skill ở `codex/` → `sync-all-harness.sh` propagate.
- Antigravity cần **frontmatter** — chạy `add-rules-frontmatter.ps1` sau rule mới.
- **Không** xóa frontmatter `.agents/rules/*.md`.
- **Không** port TOML sang Antigravity.
- Codex **không** xóa/sửa `antigravity/` trừ khi task harness Antigravity.

## Tóm tắt

Một brain (`codex/`), ba muscle native. Outcome frontier giống nhau; API harness khác nhau — **đó là thiết kế**, không phải lý do dùng cả 3 con.