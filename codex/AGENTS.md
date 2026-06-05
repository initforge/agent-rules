@C:\Users\DELL\.codex\RTK.md
@C:\Users\DELL\.codex\rules\core.md
@C:\Users\DELL\.codex\rules\root-cause-verification.md
@C:\Users\DELL\.codex\rules\prompt-intent-router.md
@C:\Users\DELL\.codex\rules\planning.md
@C:\Users\DELL\.codex\rules\execution.md
@C:\Users\DELL\.codex\rules\quality-gates.md
@C:\Users\DELL\.codex\rules\context-tools.md
@C:\Users\DELL\.codex\rules\tool-inventory.md
@C:\Users\DELL\.codex\rules\clean-code.md
@C:\Users\DELL\.codex\rules\technical-debt-control.md
@C:\Users\DELL\.codex\rules\codex-overlay.md
@C:\Users\DELL\.codex\rules\platform-boundary.md

# Bộ Nạp Runtime Codex

File này là entrypoint global cho Codex.

## Nguồn Runtime

Runtime dùng hằng ngày:

```text
C:\Users\DELL\.codex
```

Bản backup/bootstrap:

```text
P:\agent-rules\codex
```

`P:\agent-rules` chỉ dùng cho backup, sync, bootstrap máy mới, chia sẻ rule với agent/tool khác và lưu tài liệu setup dài hạn. Khi làm việc hằng ngày, Codex không được phụ thuộc trực tiếp vào ổ `P:` nếu runtime local đã có đủ file.

## Ngôn Ngữ

- Giao tiếp với người dùng bằng tiếng Việt có dấu đầy đủ.
- Không dùng tiếng Việt không dấu.
- Không dùng tiếng Anh nếu có cách nói tiếng Việt tự nhiên.
- Giữ tiếng Anh cho thuật ngữ kỹ thuật, model, lệnh, đường dẫn, API, package, schema key, tool, sản phẩm và mã nguồn.

## Vận Hành Mặc Định

- Task nhỏ rõ ràng: đọc đúng ngữ cảnh, sửa trực tiếp, verify tối thiểu.
- Task vừa: đọc ngữ cảnh, lập plan khi có nhiều lát cắt, triển khai, verify.
- Task rủi ro cao hoặc multi-domain: locked plan, risk register, reviewer gate, verify sâu.
- Không tự commit, push, force-push hoặc deploy nếu người dùng chưa yêu cầu rõ trong session hiện tại.
- Với 5fedu, production là môi trường verify mặc định sau khi đã có thay đổi được push/deploy; vẫn không tự push nếu người dùng chưa yêu cầu rõ.
- Trạng thái cuối luôn là `PASS`, `PARTIAL`, hoặc `BLOCKED`.

## Bắt Buộc Luôn Áp Dụng

- Đọc entrypoint/context index trước khi sửa.
- Không revert thay đổi của người dùng.
- Giữ diff nhỏ và đúng scope.
- Clean code là risk-control, không phải cleanup thẩm mỹ.
- Root cause và verification phải có bằng chứng trực tiếp khi debug/fix/review.
- Nếu phát hiện rule/context mới có giá trị tái sử dụng, chủ động đề xuất hoặc cập nhật theo learning loop đang áp dụng.
