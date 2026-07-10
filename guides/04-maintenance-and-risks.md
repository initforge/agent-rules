# Bảo Trì Và Rủi Ro

Trước khi cài global runtime, luôn chạy:

- kiểm tra context
- kiểm tra mirror
- kiểm tra runtime state nếu đang sửa integrations

Guardrails:

- overlay phải nhỏ và chỉ chứa delta riêng từng platform
- integrations phải có version/policy/verify rõ ràng
- generated output trong `05-generated/` không được sửa tay
- evidence/legacy không được promote lên rule sống nếu chưa qua review
- không commit/push tự động

## Runtime hooks (Codex) — backstop, không nằm trong pipeline build

- `~/.codex/hooks/skill-orchestrator.json`: SessionStart/UserPromptSubmit/PreToolUse/PostToolUse → `scripts/skill-gate.sh`.
- **PostToolUse `audit-on-edit.sh`** (Write/Edit): tự cảnh báo khi sửa context/harness — oversize (rule>90, SKILL>350 warn nhẹ nếu liền mạch), dead Windows absolute user-profile paths, dead `@import`. Fail-open, chỉ WARN.
- Các hook/script `~/.codex/scripts/*.sh|*.py` là runtime-only (không do `01-build-runtime` sinh); sửa trực tiếp tại runtime, ghi chú ở đây để audit sau không nhầm là orphan.

## Dual machine (Linux + Windows riêng)

Owner chạy **hai máy vật lý tách** — **không** share `~/.codex` / `~/.grok` / `~/.gemini`. Mỗi máy:

1. `git pull` agent-rules (cùng commit nếu muốn parity).
2. Build/install runtime trên **máy đó** (`02-install-runtime` hoặc tương đương).
3. `./automation/11-install-runtime-hooks.sh` trên **máy đó** (ghi path absolute local: `/home/...` hoặc `C:/Users/...`).
4. Restart session agent trên máy đó.

**Không** copy `hooks.json` / `skill-orchestrator.json` từ Windows sang Linux (hoặc ngược) — path Python/home sẽ gãy. Canonical = repo; runtime = per-host.

| OS | Python | bash | Ghi chú |
|---|---|---|---|
| **Linux** | `python3` (`/usr/bin/python3`) | `/bin/bash` | Path hook giữ `/home/<user>/...` |
| **Windows** | Python.org (skip WindowsApps stub) | **Git Bash** (không WSL hỏng) | Grok LIVE: `~/.grok/hooks/bin/`; prefer `C:/Users/...` |

## Runtime hooks (Grok) — LIVE path khác Codex

- Grok **không** chỉ dùng `~/.grok/scripts/`. Orchestrator: `~/.grok/hooks/skill-orchestrator.json` → **`~/.grok/hooks/bin/grok-skill-gate.sh`**.
- `11-install-runtime-hooks.sh` **bắt buộc** sync skill-gate vào **cả** `hooks/bin/` và `scripts/`, resolve Python thật (skip WindowsApps stub), smoke **LIVE** `hooks/bin`.
- Antigravity: `hooks.json` dùng absolute `__PYTHON__` + `.py` (không phụ thuộc `bash` WSL / placeholder).

## Runtime hooks (Antigravity) — unattended + skill inject

- Config: `~/.gemini/config/hooks.json` (global) hoặc `<repo>/.agents/hooks.json` (project).
- Source: `platforms/antigravity/hooks.json` + `platforms/antigravity/scripts/antigravity-skill-gate.py`.
- Events wired:
  - **PreInvocation** → Turn-0 skill scan + inject skill stack (`injectSteps.ephemeralMessage`).
  - **PreToolUse** (`run_command`) → advisory E2E ladder + destructive cmd warning (`decision:allow` + `reason`).
  - **PostToolUse** (write/run) → state tracking + `audit-on-edit.sh` side-effect.
  - **Stop** → scan `.agent/ledger/*.md` còn `- [ ]` hoặc `evidence: <chưa chạy>` → `decision:continue` (max 15/lần hội thoại).
- Cài runtime: copy `platforms/antigravity/scripts/*` → `~/.gemini/config/scripts/`, merge `hooks.json` (path tuyệt đối tới script).
- Contract: https://antigravity.google/docs/hooks — khác Codex (`injectSteps` thay `additionalContext`, Stop dùng `continue`).

## Git pre-commit audit (cross-platform backstop)

- Script: `automation/audit-context-pre-commit.sh` — quét staged files context/harness trước commit.
- Cài: `./automation/install-pre-commit-hook.sh` (repo hiện tại) hoặc `./automation/install-pre-commit-hook.sh --global`.
- Checks: oversize (rule>90, SKILL>350 warn nhẹ nếu liền mạch), dead Windows absolute user-profile paths, dead `@import`.
- Default **fail-open** (WARN, exit 0). `CONTEXT_AUDIT_STRICT=1` → block commit.
- Chạy trên mọi IDE/agent (Codex/Antigravity/Cursor) vì là git hook, không phụ thuộc platform hook API.
- Cài tất cả hooks một lần: `./automation/11-install-runtime-hooks.sh` (Codex + Antigravity + Grok + pre-commit + smoke test).


