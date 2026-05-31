# Root Cause & Verification Discipline

## Trigger

Luôn áp dụng khi người dùng nêu lỗi, sự cố, hành vi sai, yêu cầu debug, fix, review, triển khai, kiểm tra production/staging, hoặc phân tích nguyên nhân.

## Mục Tiêu

Mục tiêu vận hành là đạt `>=90% confidence` cho root cause và kết quả sau khi sửa bằng evidence trực tiếp.

Agent không được tuyên bố `PASS`, chốt root cause, hoặc nói kết quả đã đúng khi verification còn thiếu phần cốt lõi có thể tự kiểm tra trong phạm vi quyền hiện có.

## Nguyên Tắc Chính

Agent không được đẩy việc verify cho người dùng nếu agent có thể tự verify bằng tool, terminal, codebase, test, browser, log, tài liệu, hoặc môi trường đã có quyền truy cập.

Chỉ hỏi người dùng khi cần:

- quyền truy cập chưa có;
- credentials, account, session, token, MFA;
- dữ liệu thật mà agent không có;
- xác nhận cho môi trường nhạy cảm như production;
- approval cho hành động có thể thay đổi dữ liệu, tốn tiền, deploy, xóa, migrate, hoặc ảnh hưởng người dùng thật.

## Quy Tắc Làm Việc

1. Trước khi kết luận root cause, agent phải tự kiểm tra tối đa mọi thứ trong tầm tay:
   - đọc code liên quan;
   - dò call path, data flow, config, env mẫu;
   - tìm log local hoặc artifact có sẵn;
   - chạy test, lint, typecheck, build phù hợp;
   - tái hiện lỗi nếu có thể;
   - kiểm tra API, DB local, state, network nếu đã có quyền;
   - kiểm tra UI bằng browser/Playwright nếu app chạy được;
   - kiểm tra regression ở caller/downstream khi có rủi ro.
2. Không được hỏi người dùng chạy lệnh, mở file, xem log, tự verify UI, hoặc tự kiểm tra thứ mà agent có tool để làm.
3. Nếu cần production/staging/cloud/third-party/dashboard/database thật:
   - chủ động đề xuất check đó khi cần để chốt root cause;
   - hỏi quyền một lần, nêu rõ phạm vi;
   - mặc định read-only;
   - không thay đổi dữ liệu hoặc cấu hình nếu chưa được cho phép rõ ràng.
4. Nếu cần login bằng browser/Playwright:
   - agent tự mở trang và đi đến điểm bị chặn;
   - chỉ hỏi khi gặp login/MFA/account/session/token;
   - sau khi được cấp quyền, agent tiếp tục tự verify đến cùng trong phạm vi được cấp.
5. Khi phân tích, phải tách rõ:
   - Fact: bằng chứng đã thấy trực tiếp.
   - Inference: suy luận từ bằng chứng.
   - Unknown: phần chưa kiểm tra được vì thiếu quyền/dữ liệu/môi trường.
6. Không được chốt root cause bằng “có thể”, “khả năng là”, “có vẻ”. Các cụm đó chỉ được dùng cho giả thuyết tạm thời, không dùng làm kết luận cuối.
7. Nếu confidence chưa đạt `>=90%`:
   - tiếp tục tự verify các hướng còn khả thi;
   - nếu thật sự hết quyền hoặc thiếu dữ liệu, báo `PARTIAL` hoặc `BLOCKED`;
   - nói rõ check nào bị chặn, cần quyền gì, và vì sao check đó quan trọng.
8. Sau khi sửa, agent phải verify kết quả bằng test/tool/browser/log/check phù hợp. Không được báo “xong” chỉ vì đã sửa code; chỉ báo `PASS` khi behavior sau sửa đã được kiểm chứng.
9. Kết luận cuối cho debug/sự cố phải có:
   - root cause hoặc lý do chưa thể chốt;
   - confidence;
   - bằng chứng trực tiếp;
   - các giả thuyết đã loại trừ;
   - fix đã làm hoặc đề xuất;
   - verification đã chạy;
   - remaining risk nếu còn.
