# Harness Risk Register

Cập nhật sau global runtime (rules + Grok hooks + auto-install). Dùng khi audit hoặc trước khi báo PASS harness.

**Trạng thái:** Tất cả risk đã có mitigation hoặc accepted residual có override/documented path.

## Cơ chế tự động (không cần nhớ `install-global-harness.sh` thủ công)

| Trigger | Hành vi |
|---|---|
| `bash scripts/sync-all-harness.sh` | Sync mirror + **auto** `install-global-harness.sh` |
| `install-codex-global.sh` / `install-grok-global.sh` | Sync mirror (skip re-install loop) + rsync `~/.codex` / `~/.grok` |
| `install-grok-global.sh` cuối | Chạy `grok-hook-healthcheck.sh` |

Sau khi đổi hook/rules: **session Grok mới** hoặc `/hooks` → `r` (platform không reload hook giữa session).

## Đã giảm (mitigated)

| Risk | Mitigation |
|---|---|
| E2E deep loop / stuck | Hook **advisory** + state + `e2e-qa` SKILL ladder + scope redirect (không deny lệnh) |
| Skill drift `codex-research` | Rename `researcher`, rsync `--delete`, doc `researcher-workflow.md` |
| `~/.codex` / `~/.grok` skill cũ sót | `install-*-global.sh` rsync `--delete` |
| Workflow archive nhiễu `.agents` | `sync-all-harness.sh` rsync workflows `--delete` |
| Harness commit không validate | Hook chặn `git commit` khi sửa harness paths + workspace marker `codex/rules/00-hard-activation-contract.md` |
| Quên Turn-0 / stack | `SessionStart` + `UserPromptSubmit` inject `additionalContext` + state file stack |
| Model skip đọc SKILL.md | Turn-0 rule + inject (không chặn lệnh) |
| `smoke_passed` mất sau restart | E2E cache workspace 4h `~/.grok/skill-state/e2e-cache/` |
| PostToolUse miss test output | Parser mở rộng `toolOutput`/`stdout`/`stderr`/`content` nested |
| Harness gate chỉ repo tên `agent-rules` | `is_harness_workspace()` — marker file trong workspace root |
| `git commit -a` / biến thể | `GIT_COMMIT_RE` rộng `\bgit\b.{0,40}\bcommit\b` |
| Antigravity Linux không preflight | `scripts/antigravity-preflight.sh` + `antigravity-preflight-run.sh`; `hooks.json` dùng bash |
| Hook fail-open im lặng | `~/.grok/skill-state/fail-open.log` + `grok-hook-healthcheck.sh` sau install |
| Install recursion vô hạn | `HARNESS_SKIP_GLOBAL_INSTALL=1` khi install gọi sync |
| Legacy docs `codex-research` | Đổi tên doc, cập nhật troubleshooting/bootstrap/workflow-cases |

## Accepted residual (có override — không block PASS harness)

| ID | Risk còn lại | Tại sao chấp nhận | Override / giảm thiểu |
|---|---|---|---|
| R-H1 | Model bỏ Visible Echo trong text | Grok không hook response text | Skill-read gate + inject Turn-0; Anti-Fake-PASS trong rules; user reject nếu thiếu echo |
| R-H2 | Codex hook API có thể khác Grok | Platform delta | `~/.codex/hooks/skill-orchestrator.json` + skill-gate; rule checkpoint nếu hook off |
| R-H3 | Hook fail-open khi script crash | Grok hooks spec | `fail-open.log` + healthcheck FAIL; `/hooks` scrollback |
| R-H4 | Session compact mất stack trong context | Summarize platform | State file `~/.grok/skill-state/<session>.json` + SessionStart reinject stack |
| R-L2 | `workflow-router` Codex-oriented trên Grok | Skill vẫn hữu ích cho phase | Prefer `/implement` trên Grok |
| R-L3 | Deep ≥3/session chặn regression hợp lệ | Anti-stuck by design | `DEEP_OK` / `force deep` trong prompt |
| R-L4 | Global hooks chỉ khi agent chạy lệnh | Đúng ý global-only | Rules load mọi session; hooks gate terminal |

## Verification checklist (trước PASS harness)

```bash
bash scripts/install-global-harness.sh   # hoặc sync-all-harness (auto-install)
bash scripts/test-grok-skill-gate.sh
bash scripts/grok-hook-healthcheck.sh
bash scripts/validate-harness.sh
bash scripts/validate-harness-behaviors.sh
```

Grok: session mới → `/hooks` → skill-orchestrator enabled.

## Override tokens

| Token | Effect |
|---|---|
| `DEEP_OK` / `force deep` | Bỏ E2E ladder deep |
| `VALIDATE_OK` / `HARNESS_OK` | Bỏ harness commit gate |
| `GROK_SKILL_GATE_DISABLE=1` | Tắt hook một lệnh |
| `/hooks` Space | Tắt hook cả session |