# Owner Feedback Lessons Log

File này chỉ dùng để lưu raw feedback, bằng chứng lịch sử, hoặc note chưa chuyển hóa.

Quy tắc vận hành:

- Không để rule quan trọng chỉ nằm trong file này.
- Nếu feedback có tính lặp lại hoặc áp dụng lại được, promote ngay vào file rule sống phù hợp:
  - database/auth/permission -> `02-database-and-auth-rules.md`
  - UI/UX/export/test -> `03-ui-ux-and-delivery-standards.md`
  - status/blocker -> `04-decision-status-and-backlog.md` hoặc legacy `06-decision-status.md`
  - source/spec coverage -> `05-source-specs-and-coverage.md`
- Sau khi promote, giữ lại log ngắn nếu cần truy vết, hoặc ghi “đã promote sang ...”.

## Log

### Baseline promoted lessons

- Primary key app table dùng `id int8` auto-increment; foreign key tương ứng cũng `int8`. Đã promote vào database/auth rules.
- Login dùng `ten_dang_nhap`; admin mặc định `admin` / `5fedu.com`; user thường mặc định `123456`. Đã promote vào database/auth rules và project entry.
- Supabase Auth sync phải chạy qua server/admin path, không đưa service role lên client. Đã promote vào database/auth rules.
- Không dùng CRUD generic hời hợt cho module nghiệp vụ. Đã promote vào UI/UX rules.
- Không để action duyệt/in nằm lẫn trong form chính nếu nghiệp vụ cần action tách riêng. Đã promote vào UI/UX rules.
- Export Excel phải giữ numeric cell type cho cột số; PDF phải dùng font Unicode khi có tiếng Việt. Đã promote vào UI/UX/export rules.
- TDZ/React hooks/import thiếu là lỗi production nghiêm trọng; handler phải khai báo trước nơi dùng. Đã promote vào UI/UX/runtime rules.
- Permission phải test đa account, đa cấp quyền, UI và API/database nếu có. Đã promote vào database/auth rules và quality gates.
