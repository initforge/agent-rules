# Quy Tắc Lõi Khi Chạy Codex

## Kích Hoạt

Luôn áp dụng.

## Mục Đích

Định nghĩa hành vi nền cho lập trình, sửa lỗi, nghiên cứu, lập kế hoạch, rà soát, bảo toàn context và báo cáo kết quả.

## Ngôn Ngữ

- Trả lời người dùng bằng tiếng Việt có dấu đầy đủ theo mặc định.
- Không viết tiếng Việt không dấu, trừ khi người dùng yêu cầu rõ ASCII-only hoặc file đích có quy ước ASCII-only thật.
- Không dùng tiếng Anh nếu có cách nói tiếng Việt tự nhiên.
- Giữ tiếng Anh cho thuật ngữ kỹ thuật, model, lệnh, đường dẫn, API, package, schema key, mã nguồn, tên file, tên tool, protocol, sản phẩm và trích dẫn nguyên văn.
- Báo cáo cuối gọn, có bằng chứng, ít filler.

## Hợp Đồng Thực Thi

Khi người dùng yêu cầu triển khai, sửa lỗi, refactor, tạo mới, migrate hoặc thay đổi code:

1. Đọc entrypoint/context index trước.
2. Đọc sâu đúng file liên quan theo task, không đọc tràn lan.
3. Kiểm tra `plan/` nếu có và đọc plan đang hoạt động.
4. Với HIGH risk hoặc multi-domain, không execute mega-plan chưa được chia thành slice verify được.
5. Không dừng ở đề xuất nếu người dùng không yêu cầu chỉ thảo luận.
6. Không tự commit, push, deploy hoặc force-push.
7. Không revert thay đổi của người dùng nếu chưa được yêu cầu rõ.
8. Giữ diff nhỏ và đúng scope.
9. Báo rõ trước khi mở rộng phạm vi.
10. Verify trước khi nói xong.

## Context Index Trước, Đọc Sâu Sau

- “Luôn đọc trước khi làm” nghĩa là đọc file entrypoint/index/mapping nhẹ trước: `AGENTS.md`, `00-index.md`, decision/status map, questions/open blockers, source map nếu có.
- Chỉ đọc các file rule chi tiết khi task dính đến domain đó.
- Nếu task nhắc lại vấn đề cũ, feedback, “lần trước”, “đã nói”, “rule”, “context”, hoặc “5fedu”, agent phải tìm trong context logs/rules trước khi trả lời hoặc sửa code.
- Không dùng context tinh gọn bằng cách xóa mất tri thức. Tinh gọn đúng nghĩa là phân tầng: index, rule sống, decision status, raw logs, archive.

## Learning Loop Chủ Động

Khi user đưa feedback, sửa cách hiểu, chốt quy tắc mới, hoặc một lỗi được fix xong:

1. Phân loại: local project rule, reusable domain rule, hay global cross-stack rule.
2. Ghi raw feedback vào log dự án nếu cần.
3. Chuyển hóa ngay thành rule sống ở file phù hợp nếu feedback có tính lặp lại.
4. Sync mirror `.agents` và `.codex` nếu project dùng cả hai.
5. Chỉ promote lên global khi rule áp dụng được cho nhiều tech stack hoặc nhiều dự án.
6. Không tự commit/push; chỉ làm khi user yêu cầu rõ. Với 5fedu, push có thể là workflow thường dùng để verify production, nhưng vẫn cần yêu cầu rõ trong session.

## Báo Cáo Cuối

Báo cáo cuối phải có:

```text
Status: PASS | PARTIAL | BLOCKED

Files changed:
- path/file

Verification:
- command/test -> pass/fail

Context/learning:
- updated | not needed | blocked

Remaining risk:
- none | ...
```
