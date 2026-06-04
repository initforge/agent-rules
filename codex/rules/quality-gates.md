# Quality Gates

## Trigger

Áp dụng khi triển khai, sửa lỗi, review, refactor, test, bàn giao hoặc xác nhận production/local behavior.

## Nguyên Tắc

- Verify phải phản ánh hành vi thật của hệ thống, không chỉ chứng minh code compile.
- Test phải bao phủ dữ liệu, quyền, UI, API, database, export, toolbar/filter và flow liên module khi các mặt trận đó liên quan.
- Không báo `PASS` nếu verification cốt lõi có thể tự làm nhưng chưa làm.
- Không sửa production/deploy/push nếu user chưa yêu cầu rõ.

## Mặc Định Môi Trường Test

- Dự án thường: test local mặc định, trừ khi user yêu cầu staging/production.
- 5fedu: production là môi trường verify mặc định sau khi code đã được push và deploy qua CI/CD, trừ khi user yêu cầu test local.
- Không tự push để mở production verify nếu user chưa yêu cầu trong session. Khi user đã yêu cầu push hoặc nói workflow này luôn push, được push theo đúng scope và phải kiểm tra CI/deploy sau đó.

## Smart Verification Activation

Khi user yêu cầu verify rộng như `verify production hết`, phải hiểu là verify theo hệ thống liên kết, không phải smoke test:

- Trước khi test: đọc context index/mapping để xác định module, role, database table, UI surface, export và cross-module flow liên quan.
- 5fedu: dùng production sau khi thay đổi đã được push/deploy; nếu chưa được phép push thì dừng ở local/static verification và báo `PARTIAL`.
- Dự án khác: mặc định local, trừ khi user chỉ định staging/production.
- Báo cáo cuối phải nêu: context đã nạp, môi trường, URL nếu có, tài khoản/role đã test, database checks, UI/browser checks, export files, cross-module checks và gap còn lại.

## Verification Matrix

Chọn các gate phù hợp theo rủi ro và bề mặt thay đổi:

- Build/type/lint: chạy lệnh phù hợp với stack.
- Unit/integration: validators, mappers, services, state logic, permission logic.
- Browser/UI: click thật qua flow liên quan, kiểm tra không crash, không overlap, không mất footer/pagination.
- CRUD: create/read/update/delete bằng dữ liệu thật hoặc test data được phép.
- Database: đối chiếu record trước/sau bằng query, schema, trigger, rollup, cascade, constraint, RLS/policy nếu có.
- Permission: tạo hoặc dùng đủ account đại diện các cấp quyền; test từng account với full CRUD và truy cập trái phép qua UI/API nếu có thể.
- Cross-module/cross-flow: dữ liệu thay đổi ở module này phải phản ánh đúng ở module liên quan, bảng tổng hợp, báo cáo, dropdown, cache/query.
- Toolbar/filter/search: kiểm tra bulk action, row action, filter chip, column filter, reset, search; đối chiếu kết quả lọc với database hoặc source data.
- Export/download: tải file thật; kiểm tra tên file, extension, nội dung, format, cell type với Excel, font Unicode/layout với PDF.
- External integrations: nếu không có quyền/không thể kích hoạt thật như Zalo, payment, webhook bên ngoài, đọc code kỹ, kiểm tra config/error path, để lại verification gap rõ ràng cho user test.

## Permission Gate

Khi task liên quan auth, role, permission, row-level filtering, menu visibility hoặc API authorization:

1. Đọc rule/context permission liên quan.
2. Trace spec -> code -> store/session -> API/database.
3. Chuẩn bị account test đại diện các cấp quyền cần thiết.
4. Với mỗi account, test ít nhất read/list/detail và các action được phép/không được phép.
5. Đổi quyền hoặc role nếu feature hỗ trợ, đăng nhập lại hoặc refresh session để kiểm tra quyền áp dụng.
6. Không báo hoàn thành nếu chỉ test admin.

## Production Gate

Khi verify production:

- Xác nhận đúng URL/site chính thức.
- Xác nhận build/deploy mới nhất đã hoàn tất nếu có push.
- Kiểm tra console/network lỗi nghiêm trọng.
- Dùng test data an toàn; không phá dữ liệu thật nếu chưa được phép.
- Nếu cần credential/MFA/session, hỏi đúng phạm vi và chỉ thao tác read/write đã được phép.

## Iteration Rule

Nếu verify phát hiện lỗi nghiêm trọng trong scope:

1. Sửa tiếp.
2. Chạy lại gate liên quan.
3. Lặp cho đến khi đạt hoặc bị chặn bởi quyền/dữ liệu/môi trường.

Chỉ dừng ở `PARTIAL` hoặc `BLOCKED` khi đã nêu rõ blocker và verification còn thiếu.
