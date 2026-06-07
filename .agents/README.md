# Antigravity Runtime Guardrails

Thư mục `.agents` này không phải artifact tạm. Đây là adapter bắt buộc để Antigravity làm việc chặt hơn:

- đọc entry/context index trước khi sửa;
- tự kích hoạt gate theo ý đồ prompt;
- ép 5fedu UI phải kiểm template/golden reference;
- ép production verify phải đi từ mapping/context;
- ép final luôn có `PASS`, `PARTIAL`, hoặc `BLOCKED`;
- ép task vừa/lớn có `Technical debt check`.

Đọc `.agents/INTENT.md` để nắm ý đồ ngắn nhất.

## Không Được Cleanup

Không xóa các file này nếu user chưa yêu cầu đích danh:

- `.agents/AGENTS.md`
- `.agents/INTENT.md`
- `.agents/hooks.json`
- `.agents/rules/00-hard-activation-contract.md`
- `.agents/rules/prompt-intent-router.md`
- `.agents/rules/quality-gates.md`
- `.agents/rules/technical-debt-control.md`
- `.agents/workflows/*.md`
- `.agents/skills/*/SKILL.md`
- `.agents/5fedu/00-index.md`

Nếu cần chỉnh, phải giữ nguyên ý đồ ép chặt và verify marker sau khi sync.
