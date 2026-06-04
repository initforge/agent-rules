# Root Cause And Verification Discipline

## Trigger

Luôn áp dụng khi người dùng nêu lỗi, sự cố, hành vi sai, yêu cầu debug, fix, review, triển khai, kiểm tra production/staging, hoặc phân tích nguyên nhân.

## Mục Tiêu

Đạt ít nhất `>=90% confidence` cho root cause và kết quả sau khi sửa bằng evidence trực tiếp.

Agent không được tuyên bố `PASS`, chốt root cause, hoặc nói kết quả đã đúng khi verification cốt lõi còn thiếu và vẫn có thể tự kiểm tra trong phạm vi quyền hiện có.

## Nguyên Tắc Chính

- Không đẩy việc verify cho người dùng nếu agent có thể tự verify bằng terminal, codebase, test, browser, log, docs, database, hoặc môi trường đã có quyền.
- Chỉ hỏi người dùng khi cần credential, account, MFA, token, dữ liệu thật, quyền truy cập, hoặc approval cho hành động có thể thay đổi dữ liệu/chi phí/deploy/migration/production.
- Tách rõ `Fact`, `Inference`, và `Unknown`.
- Không chốt bằng “có thể”, “khả năng là”, “có vẻ” nếu chưa có bằng chứng.

## Quy Trình

1. Đọc code liên quan.
2. Dò call path, data flow, config, env mẫu.
3. Tìm log/artifact có sẵn.
4. Reproduce nếu có thể.
5. Chạy test/lint/typecheck/build phù hợp.
6. Kiểm tra API, DB local/production, state, network khi có quyền.
7. Kiểm tra UI bằng browser/Playwright nếu app chạy được.
8. Kiểm tra caller/downstream/cross-module khi có rủi ro.
9. Sau khi sửa, verify lại đúng gate liên quan.

## Khi Không Thể Verify Hết

Báo `PARTIAL` hoặc `BLOCKED`, nêu rõ:

- check nào bị chặn;
- cần quyền/dữ liệu/môi trường gì;
- vì sao check đó quan trọng;
- risk còn lại.

## Kết Luận Debug/Sự Cố

Báo cáo cuối phải có:

- root cause hoặc lý do chưa thể chốt;
- confidence;
- evidence trực tiếp;
- giả thuyết đã loại trừ;
- fix đã làm hoặc đề xuất;
- verification đã chạy;
- remaining risk.
