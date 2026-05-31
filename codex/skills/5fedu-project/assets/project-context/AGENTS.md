# 5fedu Project Entry

## Owner Feedback Gate 2026-05-31

- Luôn đọc `.codex/5fedu/10-owner-feedback-lessons.md` trước khi làm database, auth, bảng nhân viên, migration, seed, service hoặc UI form liên quan.
- Các lỗi đã bị owner phản hồi và không được lặp lại: `id` bảng app phải là `int8` tự động tăng, Supabase có hỗ trợ identity/bigserial, bảng nhân viên phải tối giản, login dùng `ten_dang_nhap` chứ không dùng `ma_nhan_vien`, và thêm/sửa/xóa username phải đồng bộ Supabase Auth user qua server/admin path.
- Luôn đọc `.codex/5fedu/12-owner-feedback-transport-ui.md` trước khi làm trang chủ, module vận tải, list/detail/form, combobox, in/xuất/duyệt, hoặc các trường tổng hợp tự tính.
- Các lỗi UI/nghiệp vụ đã bị owner phản hồi và không được lặp lại: không dùng CRUD generic hời hợt cho module nghiệp vụ, không cho nhập tay tổng tiền/tổng chuyến phải tự tính, dropdown dữ liệu lớn phải dùng combobox, form/detail phải theo template, action in/duyệt phải tách khỏi form, detail tài xế/địa điểm/xe phải có lịch sử liên quan khi nghiệp vụ cần.

Repo này dùng bộ context dự án 5fedu. File này chỉ là con trỏ nhẹ để tránh nạp toàn bộ context mỗi lượt.

Người dùng không cần gọi `/5fedu` để cấp context mỗi lần làm việc. Khi làm trong repo này, AI phải tự đọc file này và các tài liệu liên quan theo chính sách bên dưới. `/5fedu` chỉ dùng để scaffold ban đầu hoặc bổ sung/sửa bộ rule/docs/status của dự án.

## Luôn đọc trước khi làm

- `.codex/5fedu/00-index.md`: nguyên tắc nền và cách dùng bộ context.
- `.codex/5fedu/06-decision-status.md`: trạng thái `DA_CHOT`, `CHUA_CHOT`, `CAN_HOI_THEM`.
- `.codex/5fedu/questions.md`: câu hỏi còn mở.
- `.codex/5fedu/11-current-sheets-source-map.md`: source map hiện tại từ 2 Google Sheets public, dùng để đối chiếu spec theo tab/ô.

## Chỉ đọc khi liên quan

- `.codex/5fedu/01-tech-stack-and-template.md`: khi scaffold app, clone/adapt template, kiểm tra stack, package, build/dev command.
- `.codex/5fedu/02-frontend-mapping.md`: khi làm domain, submenu, module, route, view, tab, search, responsive UI.
- `.codex/5fedu/03-database-supabase.md`: khi làm Supabase, schema, credentials, query, service, migration, storage/media, Google Sheets/AppSheet.
- `.codex/5fedu/04-auth-permissions-and-flows.md`: khi làm đăng nhập, tài khoản, nhân viên, phân quyền, flow thao tác.
- `.codex/5fedu/05-delivery-quality.md`: trước khi báo hoàn thành, verify, bàn giao, tối ưu Supabase Egress/Vercel Edge Function.
- `.codex/5fedu/07-working-format.md`: khi cần hiểu format/cách làm mặc định của 5fedu cho app, template, credentials, database, permission, hoặc khi một dữ kiện cụ thể chưa chốt.
- `.codex/5fedu/08-source-examples.md`: khi cần ví dụ cụ thể đã rút từ ảnh/spec ban đầu để tự suy luận đúng kiểu 5fedu.
- `.codex/5fedu/09-coverage-audit.md`: khi cần kiểm tra rule/context hiện đã phủ các yêu cầu gốc nào và còn chỗ nào cần chốt.
- `.codex/5fedu/10-owner-feedback-lessons.md`: bắt buộc đọc khi làm database, auth, bảng nhân viên, migration, seed, service hoặc UI form liên quan.
- `.codex/5fedu/11-current-sheets-source-map.md`: bắt buộc đọc khi làm module, schema, seed/import dữ liệu vận tải, auth/nhân viên, hoặc kiểm tra một yêu cầu có nằm trong sheet không.
- `.codex/5fedu/12-owner-feedback-transport-ui.md`: bắt buộc đọc khi làm trang chủ, Quản lý vận tải, Tài xế, Địa điểm, Danh sách xe, Chuyến xe, Bảng lương, Thống kê chuyến đi/lương, hoặc chuẩn list/detail/form/action.

## Quy tắc cứng

- Trước mỗi task trong repo này, xem kỹ `AGENTS.md`, `00-index.md`, `06-decision-status.md`, `questions.md`, rồi mới chọn tài liệu chi tiết cần đọc.
- Scope dự án là làm full app A-Z theo template và spec đã đưa; không hỏi lại kiểu "làm module đầu tiên nào" hoặc "phase đầu là gì". Nếu cần chia nhỏ để an toàn, AI tự chia plan nội bộ và báo thứ tự thực hiện.
- Không đoán module, route, bảng, cột, credentials, quyền hoặc flow khi trạng thái còn `CHUA_CHOT` hoặc `CAN_HOI_THEM`.
- Khi dữ kiện cụ thể chưa chốt, vẫn phải follow khung format/cách làm trong `.codex/5fedu/07-working-format.md`; chỉ không được tự chọn giá trị cụ thể.
- Khi người dùng đưa ít instruction, dùng `.codex/5fedu/07-working-format.md` làm khung và `.codex/5fedu/08-source-examples.md` làm ví dụ tham chiếu; vẫn hỏi nếu thiếu dữ kiện quyết định.
- Khi người dùng chốt hoặc bổ sung rule mới, cập nhật file `.codex/5fedu/*.md` phù hợp và cập nhật `.codex/5fedu/06-decision-status.md`.
- Không lưu secret thật vào repo hoặc tài liệu. Chỉ ghi tên biến môi trường, nơi cần cấu hình, và cách kiểm tra không in giá trị secret.
