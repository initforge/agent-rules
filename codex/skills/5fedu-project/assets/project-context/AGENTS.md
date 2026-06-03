# 5fedu Project Entry

- Luôn đọc `.agents/5fedu/03-database-supabase.md` và `.agents/5fedu/04-auth-permissions-and-flows.md` trước khi làm database, auth, bảng nhân viên, migration, seed, service hoặc UI form liên quan.
- Các lỗi đã bị owner phản hồi và không được lặp lại: `id` bảng app phải là `int8` tự động tăng, Supabase có hỗ trợ identity/bigserial, bảng nhân viên phải tối giản, login dùng `ten_dang_nhap` chứ không dùng `ma_nhan_vien`, và thêm/sửa/xóa username phải đồng bộ Supabase Auth user qua server/admin path.
- **Quy tắc mật khẩu cứng**: Admin luôn dùng password `5fedu.com` — KHÔNG BAO GIỜ đổi hoặc dùng giá trị khác. Tài khoản người dùng thường mặc định `123456`. Khi viết script seed/test hoặc browser subagent login: BẮT BUỘC dùng đúng credentials này. Khi test tính năng đổi mật khẩu: dùng tài khoản test riêng, KHÔNG test trên admin.
- Luôn đọc `.agents/5fedu/07-working-format.md` và `.agents/5fedu/05-delivery-quality.md` trước khi làm trang chủ, module vận tải, list/detail/form, combobox, in/xuất/duyệt, hoặc các trường tổng hợp tự tính.
- Các lỗi UI/nghiệp vụ đã bị owner phản hồi và không được lặp lại: không dùng CRUD generic hời hợt cho module nghiệp vụ, không cho nhập tay tổng tiền/tổng chuyến phải tự tính, dropdown dữ liệu lớn phải dùng combobox, form/detail phải theo template, action in/duyệt phải tách khỏi form, detail tài xế/địa điểm/xe phải có lịch sử liên quan khi nghiệp vụ cần.

Repo này dùng bộ context dự án 5fedu. File này chỉ là con trỏ nhẹ để tránh nạp toàn bộ context mỗi lượt.

Người dùng không cần gọi `/5fedu` để cấp context mỗi lần làm việc. Khi làm trong repo này, AI phải tự đọc file này và các tài liệu liên quan theo chính sách bên dưới. `/5fedu` chỉ dùng để scaffold ban đầu hoặc bổ sung/sửa bộ rule/docs/status của dự án.

## Luôn đọc trước khi làm

- `.agents/5fedu/00-index.md`: nguyên tắc nền và cách dùng bộ context.
- `.agents/5fedu/06-decision-status.md`: trạng thái `DA_CHOT`, `CHUA_CHOT`, `CAN_HOI_THEM`.
- `.agents/5fedu/questions.md`: câu hỏi còn mở.
- `.agents/5fedu/11-current-sheets-source-map.md`: source map hiện tại từ 2 Google Sheets public, dùng để đối chiếu spec theo tab/ô.

## Chỉ đọc khi liên quan

- `.agents/5fedu/01-tech-stack-and-template.md`: khi scaffold app, clone/adapt template, kiểm tra stack, package, build/dev command.
- `.agents/5fedu/02-frontend-mapping.md`: khi làm domain, submenu, module, route, view, tab, search, responsive UI.
- `.agents/5fedu/03-database-supabase.md`: khi làm Supabase, schema, credentials, query, service, migration, storage/media, Google Sheets/AppSheet.
- `.agents/5fedu/04-auth-permissions-and-flows.md`: khi làm đăng nhập, tài khoản, nhân viên, phân quyền, flow thao tác.
- `.agents/5fedu/05-delivery-quality.md`: trước khi báo hoàn thành, verify, bàn giao, tối ưu Supabase Egress/Vercel Edge Function.
- `.agents/5fedu/07-working-format.md`: khi cần hiểu format/cách làm mặc định của 5fedu cho app, template, credentials, database, permission, hoặc khi một dữ kiện cụ thể chưa chốt.
- `.agents/5fedu/08-source-examples.md`: khi cần ví dụ cụ thể đã rút từ ảnh/spec ban đầu để tự suy luận đúng kiểu 5fedu.
- `.agents/5fedu/09-coverage-audit.md`: khi cần kiểm tra rule/context hiện đã phủ các yêu cầu gốc nào và còn chỗ nào cần chốt.

## Quy tắc cứng

- Trước mỗi task trong repo này, xem kỹ `AGENTS.md`, `00-index.md`, `06-decision-status.md`, `questions.md`, rồi mới chọn tài liệu chi tiết cần đọc.
- Scope dự án là làm full app A-Z theo template và spec đã đưa; không hỏi lại kiểu "làm module đầu tiên nào" hoặc "phase đầu là gì". Nếu cần chia nhỏ để an toàn, AI tự chia plan nội bộ và báo thứ tự thực hiện.
- Không đoán module, route, bảng, cột, credentials, quyền hoặc flow khi trạng thái còn `CHUA_CHOT` hoặc `CAN_HOI_THEM`.
- Khi dữ kiện cụ thể chưa chốt, vẫn phải follow khung format/cách làm trong `.agents/5fedu/07-working-format.md`; chỉ không được tự chọn giá trị cụ thể.
- Khi người dùng đưa ít instruction, dùng `.agents/5fedu/07-working-format.md` làm khung và `.agents/5fedu/08-source-examples.md` làm ví dụ tham chiếu; vẫn hỏi nếu thiếu dữ kiện quyết định.
- Khi người dùng chốt hoặc bổ sung rule mới, cập nhật file `.agents/5fedu/*.md` phù hợp và cập nhật `.agents/5fedu/06-decision-status.md`.
- Không lưu secret thật vào repo hoặc tài liệu. Chỉ ghi tên biến môi trường, nơi cần cấu hình, và cách kiểm tra không in giá trị secret.
- **Quy tắc cứng khi chỉnh sửa Frontend**: Phải suy luận chặt chẽ dựa trên template gốc nằm trong thư mục `/template` (đã checkout tại commit `47947e6eea0b1b7dc6723356f37f604e30ac690b`). Nếu nhận được feedback từ người dùng, bắt buộc phải đối chiếu lại với code của template. Trong trường hợp code hiện tại đã hoàn toàn chuẩn theo template mà người dùng vẫn phản hồi chưa đạt, **phải dừng lại và hỏi ngược người dùng ngay lập tức** kèm theo phân tích/suy luận rõ vị trí đang nói tới là ở đâu. Tuyệt đối cấm tự ý sửa đổi lung tung hay thay đổi sai lệch so với template chỉ để cố hoàn thành task cho xong.
- **Xác thực bắt buộc trên Production**: Mọi tính năng, sửa đổi UI hoặc sửa lỗi phải được verify trực tiếp trên môi trường production/live thực tế (ví dụ: `https://tah-app.vercel.app`), không được chỉ kiểm tra ở môi trường local (vì môi trường local có thể tự sửa lỗi hoặc bỏ qua lỗi build/runtime như thiếu import hook React, gây sập trang khi lên live).

