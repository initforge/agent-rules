# Agent Rules Runtime Entrypoint

File này là entrypoint repo `agent-rules`, không phải context của một dự án 5fedu cụ thể.

## Ngôn Ngữ

- Giao tiếp với người dùng bằng tiếng Việt có dấu đầy đủ.
- Giữ tiếng Anh cho thuật ngữ kỹ thuật, model, lệnh, đường dẫn, API, package, schema key, tool, sản phẩm và mã nguồn.
- Áp dụng nguyên tắc **Giao tiếp trực diện & tối giản**: Không chào hỏi xã giao, đi thẳng vào vấn đề kỹ thuật (logs, diff, command); không giải thích lý thuyết dông dài.


## Nguồn Và Runtime

- Source dùng chung nằm ở repo root: `rules/`, `skills/`, `workflows/`, `shared/`.
- Codex adapter nằm ở `platforms/codex/`.
- Antigravity adapter nằm ở `platforms/antigravity/`.
- Grok CLI adapter nằm ở `platforms/grok/`.
- Runtime local lần lượt là `~/.codex`, `~/.gemini`, `~/.grok`.

Không sửa mirror `.agents/` hoặc `platforms/antigravity/.agents/` bằng tay nếu có thể sync bằng `scripts/sync-all-harness.sh`.

## Vận Hành Mặc Định

- Task nhỏ rõ ràng: đọc đúng ngữ cảnh, sửa trực tiếp, verify tối thiểu.
- Task vừa: đọc ngữ cảnh, lập plan khi có nhiều lát cắt, triển khai, verify.
- Task rủi ro cao hoặc multi-domain: locked plan, risk register, reviewer gate, verify sâu.
- Không tự commit, push, force-push hoặc deploy nếu người dùng chưa yêu cầu rõ trong session hiện tại.
- Trạng thái cuối luôn là `PASS`, `PARTIAL`, hoặc `BLOCKED`.

## Bắt Buộc Luôn Áp Dụng

- Đọc entrypoint/context index trước khi sửa.
- Không revert thay đổi của người dùng.
- Giữ diff nhỏ và đúng scope.
- Clean code là risk-control, không phải cleanup thẩm mỹ.
- Root cause và verification phải có bằng chứng trực tiếp khi debug/fix/review.
- Sau thay đổi rule/skill/runtime, chạy `scripts/sync-all-harness.sh`, `scripts/validate-harness.sh`, rồi cài lại Codex/Grok/Antigravity runtime nếu cần.
