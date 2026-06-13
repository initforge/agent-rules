# Grok CLI / Composer 2.5 Runtime Entrypoint

Đọc khi chạy **Grok CLI** với Composer 2.5. Live path chính: `.grok/rules/`.

## Nguồn harness

```text
agent-rules/cursor/rules/     ← master (sửa ở đây)
agent-rules/.grok/rules/      ← live Grok CLI (luôn scan)
agent-rules/.cursor/rules/    ← live Cursor compat (tùy chọn)
~/.grok/                      ← global user
```

Sync: `cursor/scripts/sync-live.sh` hoặc `grok inspect` để verify.

Codex backup tham chiếu: `agent-rules/codex/` và `~/.codex`.

## Bộ harness live (rules + skills)

**Rules** (`.grok/rules/`):

1. `00-runtime-and-intent.md`
2. `01-agent-workflow-sop.md`
3. `02-code-quality-and-debt.md`
4. `03-context-and-tools.md`
5. `04-skills-and-5fedu.md` ← registry skill + đường 5fedu
6. `05-harness-mutation-gate.md` ← chống tự sửa harness
7. `06-opus-emulation-contract.md` ← **cùng đích Opus với Gemini**
8. `platform-boundary.md`
9. `grok-overlay.md`

**Skills** (`.grok/skills/`): sync từ `cursor/skills/` — gồm `5fedu-project`, `codex-research`, `playwright`, ... Xem `00-index.md`.

**5fedu context** không nằm trong repo harness — skill `5fedu-project` cài `.grok/5fedu/` vào **dự án khách**.

## Ngôn ngữ

- Giao tiếp user: tiếng Việt có dấu.
- Giữ tiếng Anh cho tool, API, path, code, model, command.

## Vận hành mặc định

- Task nhỏ: đọc đúng file, sửa, verify tối thiểu, kết thúc gọn.
- Task vừa/lớn hoặc rủi ro: plan/slice, gate theo domain, verify có bằng chứng.
- Không tự commit/push/deploy nếu user chưa yêu cầu rõ.
- Trạng thái cuối: `PASS` | `PARTIAL` | `BLOCKED` (task không nhỏ).

## 5fedu detection

Hard Mode khi repo có **một trong**: `.grok/5fedu/`, `.codex/5fedu/`, `.agents/5fedu/`, `.kiro/5fedu/`.

Có skill `5fedu-project` trong `.grok/skills/` ≠ dự án là 5fedu. Cài context: đọc `04-skills-and-5fedu.md`.

## Ranh giới

Composer **chỉ** sửa `cursor/` và `.cursor/`. Không đụng `codex/`, `antigravity/`, `.agents/`, `kiro/`, `.kiro/` trừ khi user yêu cầu sync cross-platform.

Chi tiết: `docs/07-cursor-composer-harness.md`, `docs/06-harness-philosophy.md`.