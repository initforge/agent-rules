# Antigravity Runtime Intent Manifest

File này dành cho mọi agent đọc nhanh để hiểu vì sao `.agents` tồn tại.

## Ý Đồ

Antigravity thường không tự kích hoạt context/gate mạnh như Codex. Vì vậy `.agents` là lớp ép hành vi bắt buộc, không phải artifact tạm.

Mục tiêu của lớp này:

- buộc agent đọc entrypoint/mapping trước khi sửa;
- buộc agent tự nhận diện ý đồ prompt;
- buộc 5fedu UI kiểm `/template` trước, rồi chỉ dùng reference pool/golden reference khi template thiếu hoặc không đủ hành vi;
- buộc production verify đi từ mapping/context;
- buộc task vừa/lớn có `Technical debt check`;
- buộc final có `Status: PASS`, `Status: PARTIAL`, hoặc `Status: BLOCKED`;
- bảo vệ các file rule/hook/workflow khỏi bị cleanup nhầm.

## Files Phải Giữ

- `.agents/AGENTS.md`
- `.agents/INTENT.md`
- `.agents/README.md`
- `.agents/hooks.json`
- `.agents/rules/00-hard-activation-contract.md`
- `.agents/rules/prompt-intent-router.md`
- `.agents/rules/quality-gates.md`
- `.agents/rules/technical-debt-control.md`
- `.agents/rules/clean-code.md`
- `.agents/workflows/*.md`
- `.agents/skills/*/SKILL.md`
- `.agents/5fedu/00-index.md`

Không xóa hoặc gitignore các file này nếu user chưa yêu cầu đích danh.

## Enforcement

Enforcement chính nằm ở:

1. `.agents/AGENTS.md`
2. `.agents/rules/00-hard-activation-contract.md`
3. `.agents/hooks.json`
4. `scripts/antigravity-preflight.ps1`

Knowledge Items chỉ là memory phụ trợ. Không dùng KI thay rules/hook.
