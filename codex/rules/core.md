# Quy Tắc Lõi Khi Chạy Codex

## Kích Hoạt

Luôn áp dụng.

## Mục Đích

Định nghĩa hành vi nền cho mọi việc lập trình, sửa lỗi, nghiên cứu, lập kế hoạch và rà soát bằng Codex.

## Ngôn Ngữ

- Trả lời người dùng bằng tiếng Việt có dấu đầy đủ theo mặc định.
- Không viết tiếng Việt không dấu như `tieng Viet khong dau`, trừ khi người dùng yêu cầu rõ văn bản ASCII-only hoặc file đích đã có quy ước ASCII-only thật.
- Khi chỉnh nội dung tiếng Việt đang có sẵn, phải giữ dấu tiếng Việt.
- Không dùng tiếng Anh trong câu trả lời hoặc tài liệu vận hành nếu có thể viết tự nhiên bằng tiếng Việt.
- Được giữ tiếng Anh cho thuật ngữ kỹ thuật, tên model, tên lệnh, đường dẫn, API, package, schema key, mã nguồn, tên file, tên tool, tên giao thức, tên sản phẩm và trích dẫn nguyên văn.
- Nếu một thuật ngữ tiếng Anh có thể làm người đọc không chuyên bị kẹt, thêm giải thích tiếng Việt ngắn ở lần xuất hiện đầu.
- Cập nhật thường ngày và báo cáo cuối nên gọn, ít filler.
- Chỉ mở rộng khi debug, kiến trúc, thay đổi rủi ro, nhập nhằng hoặc lập kế hoạch cần độ rõ cao.

## Hợp Đồng Thực Thi

Khi người dùng yêu cầu triển khai, sửa lỗi, refactor, tạo mới, migrate hoặc thay đổi code:

1. Đọc ngữ cảnh code trước.
2. Kiểm tra có thư mục `plan/` không.
3. Nếu có `plan/`, đọc `plan/00-index.md` nếu tồn tại, rồi đọc file kế hoạch đang hoạt động.
4. Trước khi sửa code theo plan, kiểm tra plan có đúng cấu trúc, số thứ tự liên tục và đúng mức băm nhỏ theo vertical slice không.
5. Không execute một mega-plan HIGH risk hoặc multi-domain nếu nó chưa được tách thành các slice có thể verify riêng.
6. Không dừng ở đề xuất nếu người dùng không yêu cầu chỉ thảo luận hoặc lập kế hoạch.
7. Không tự commit.
8. Không tự push.
9. Không force-push.
10. Không bỏ qua hook nếu chưa được phép rõ.
11. Không revert thay đổi của người dùng nếu chưa được yêu cầu rõ.
12. Giữ diff nhỏ.
13. Báo rõ trước khi mở rộng phạm vi.
14. Verify trước khi nói xong.

## Quy Tắc Skill Docs

Khi đường dẫn đích nằm dưới `/docs/**`, dùng skill `docs-style`.

Không áp dụng skill đó cho `README.md`, `AGENTS.md`, `CHANGELOG.md` hoặc markdown ngoài `/docs/**` nếu người dùng không yêu cầu rõ.

## Quy Tắc Codex Research

Dùng skill `codex-research` khi task chủ yếu là nghiên cứu, so sánh lựa chọn, đọc tài liệu nền tảng, đọc changelog, hoặc khi sửa bug bị kẹt và cần bằng chứng trước khi thử cách sửa tiếp theo.

## Cách Ghi Tham Chiếu

- Kế hoạch và ghi chú dài hạn: dùng `path:symbol` hoặc `path/dir`.
- Nhận xét review và bug cần chính xác: dùng `path:line`.
- Không dùng `path:line` trong plan dài hạn trừ khi đó là bằng chứng tạm thời.

## Máy Trạng Thái Mặc Định

```text
REQUEST
-> phân loại rủi ro
-> chọn workflow
-> đọc ngữ cảnh mục tiêu
-> lập plan nếu cần
-> kiểm tra plan shape nếu có plan
-> triển khai nếu được phép
-> verify
-> review nếu cần
-> ghi bằng chứng/ghi chú
-> báo cáo PASS/PARTIAL/BLOCKED
```

## Nguồn Runtime

Nguồn runtime:

```text
C:\Users\DELL\.codex
```

Bản sync và bootstrap:

```text
P:\agent-rules\codex
```

Không bắt buộc `P:\agent-rules` phải tồn tại trong công việc Codex hằng ngày.

## Báo Cáo Cuối

Báo cáo cuối phải ngắn và có cấu trúc:

```text
Status: PASS | PARTIAL | BLOCKED

Files changed:
- path/file

Verification:
- command/test -> pass/fail

Iteration:
- N attempts total, M retries
- key fix: ...

Remaining risk:
- none | ...

Plan files:
- plan/... -> done/blocked
```
