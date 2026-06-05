# Antigravity Agent Entrypoint

Đọc file này trước mọi task khi workspace có `.agents`.

Nếu chưa hiểu vì sao `.agents` tồn tại hoặc đang cân nhắc cleanup context/rules, đọc `.agents/INTENT.md` trước. File đó là manifest ý đồ ép chặt.

## Intent Cốt Lõi

Lớp `.agents` này tồn tại để ép Antigravity làm việc chặt hơn Codex ở các điểm nó thường lỏng:

- tự nhận diện ý đồ prompt thay vì chỉ đọc literal text;
- đọc mapping/context index trước khi làm;
- tự kích hoạt template-first/reference-pool/production/permission/database/export/cleanup gates;
- không bỏ qua `PASS`, `PARTIAL`, `BLOCKED`;
- không xóa hoặc ghi đè các file runtime ép chặt trong cleanup.

Nếu agent thấy file này có vẻ "trùng", "dài", "không dùng", hoặc "có thể cleanup", phải hiểu ngược lại: đây là runtime guard bắt buộc, không phải artifact.

## Required Rules

Đọc theo thứ tự:

1. `.agents/rules/00-hard-activation-contract.md`
2. `.agents/rules/00-antigravity-runtime-intent.md`
3. `.agents/rules/01-intent-contract.md`
4. `.agents/rules/10-fast-context.md`
5. `.agents/rules/prompt-intent-router.md`
6. `.agents/rules/quality-gates.md`
7. `.agents/rules/technical-debt-control.md`
8. `.agents/rules/clean-code.md`

## Project Context

- Nếu repo có `AGENTS.md`, đọc `AGENTS.md`.
- Nếu repo có `.agents/5fedu`, đọc `.agents/5fedu/00-index.md` trước.
- Không đọc toàn bộ context folder. Chỉ đọc sâu theo trigger và mapping.

## Hard Defaults

- Không tự commit/push/deploy nếu user chưa yêu cầu rõ.
- Với 5fedu UI, luôn kiểm `/template` trước. Nếu template đủ thì bám sát và đổi tối thiểu; chỉ dùng reference pool/golden reference khi template thiếu, không đủ hành vi, hoặc có bằng chứng đang ngõ cụt.
- Với production verify, luôn đọc mapping trước khi test.
- Với task vừa/lớn, final phải có `Technical debt check` và `Status: PASS/PARTIAL/BLOCKED`.

## Protected Files

Không xóa, rename, ghi đè rỗng, hoặc cleanup các file sau nếu user chưa yêu cầu đích danh:

- `.agents/AGENTS.md`
- `.agents/INTENT.md`
- `.agents/hooks.json`
- `.agents/rules/00-hard-activation-contract.md`
- `.agents/rules/00-antigravity-runtime-intent.md`
- `.agents/rules/01-intent-contract.md`
- `.agents/rules/10-fast-context.md`
- `.agents/rules/prompt-intent-router.md`
- `.agents/rules/quality-gates.md`
- `.agents/rules/technical-debt-control.md`
- `.agents/rules/clean-code.md`
- `.agents/workflows/*.md`
- `.agents/skills/*/SKILL.md`
- `.agents/5fedu/00-index.md`

Nếu cần thay đổi một file protected, phải nêu rõ lý do, giữ ý đồ ép chặt, sync mirror liên quan, rồi verify marker còn tồn tại.
