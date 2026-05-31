# 5fedu Context Index

## Owner Feedback Gate 2026-05-31

Phản hồi owner ngày 2026-05-31 đã chốt thêm rule chống sai:

- `id` các bảng app phải là `int8` và tự động tăng dần bằng identity/bigserial; Supabase có hỗ trợ tính năng này.
- Bảng nhân viên không được tự thêm các trường hồ sơ nhân sự rườm rà nếu sheet/source không chốt.
- Phần login phải dùng `ten_dang_nhap`, không dùng `ma_nhan_vien`.
- Thêm/sửa/xóa `ten_dang_nhap` phải đồng bộ Supabase Auth user tương ứng qua server/admin path.

Trước khi làm database/auth/bảng nhân viên/migration, bắt buộc đọc `.agents/5fedu/10-owner-feedback-lessons.md`.

## Source map hiện tại

Hai Google Sheets public người dùng gửi ngày 2026-05-31 là nguồn spec chính hiện tại. Đã tải và phân tích vào `output/sheets/current/`.

Khi làm module, schema, seed/import dữ liệu vận tải, auth/nhân viên, hoặc đối chiếu yêu cầu với sheet, bắt buộc đọc `.agents/5fedu/11-current-sheets-source-map.md`.

## Mục tiêu

Đây là bộ context project-local cho dự án 5fedu. Global runtime chỉ giữ quy tắc chung; toàn bộ quy ước riêng của 5fedu nằm trong repo để AI chỉ nạp khi làm đúng dự án này.

Người dùng không cần gọi `/5fedu` để cấp context mỗi lần. `/5fedu` chỉ dùng khi scaffold ban đầu hoặc khi muốn bổ sung/sửa bộ rule/docs/status. Khi làm việc bình thường trong repo, AI phải tự đọc `AGENTS.md` và các file `.agents/5fedu/` liên quan.

## Cách làm bắt buộc

- Không đoán mò spec, màn hình, route, bảng, cột, quyền hoặc credentials.
- Scope hiện tại là full app A-Z theo template 5fedu và ảnh/spec đã đưa. Không hỏi người dùng "làm module đầu tiên nào" khi yêu cầu là hoàn thiện toàn dự án.
- Nếu ảnh/spec không đủ rõ, hỏi lại người dùng hoặc yêu cầu link Google Sheet/source chính.
- Khi bắt đầu task, mapping theo chuỗi: spec -> domain/submenu -> module -> view/tab -> route -> source path -> database table -> service/handler.
- Với auth, permission, database, credentials, migration hoặc tài khoản người dùng: coi là HIGH risk, lập locked plan trước khi sửa.
- Không lưu secret thật vào file. Chỉ lưu tên biến môi trường và checklist xác thực.

## Nguồn cần nhớ

- Frontend template: `https://github.com/tahdieuphoi-ctrl/TAH_app`
- Agent rules backup/sync: `https://github.com/initforge/agent-rules`

## Khi thiếu dữ kiện

Hỏi thẳng, ngắn, rõ. Không tự suy diễn. Ghi phần chưa rõ vào `.agents/5fedu/questions.md` hoặc plan của feature đang làm.

## Cách nạp context

`AGENTS.md` là con trỏ nhẹ, không ép nạp toàn bộ tài liệu mỗi lượt. Khi bắt đầu việc, đọc:

- `00-index.md`
- `06-decision-status.md`
- `questions.md`

Sau đó chỉ đọc file chủ đề liên quan đến việc hiện tại.

Việc đọc kỹ mỗi lúc làm việc là khả thi nếu context được chia nhỏ như hiện tại: chỉ ba file nền luôn đọc, còn file chi tiết đọc theo phạm vi task.

Nếu cần chia nhỏ việc làm, đó là cơ chế thực thi nội bộ để kiểm soát rủi ro, không phải câu hỏi để thu hẹp scope dự án.

## Phân biệt format và giá trị cụ thể

Một số dữ kiện từng app có thể chưa chốt, nhưng khung làm việc 5fedu vẫn phải được hiểu và follow.

Ví dụ:

- Chưa chốt Supabase credentials cụ thể, nhưng đã chốt cách yêu cầu, kiểm tra format, và không lưu secret.
- Chưa chốt prefix bảng đầy đủ, nhưng đã chốt format đặt tên bảng là viết tắt submenu + tên module.
- Chưa chốt permission từng module, nhưng đã chốt format mô tả quyền `xem/them/sua/xoa/quan_tri`.

Khi cần khung làm việc, đọc `.agents/5fedu/07-working-format.md`.

## Trạng thái chốt

Luôn đọc `.agents/5fedu/06-decision-status.md` trước khi triển khai. Chỉ coi một nội dung là đã chốt khi có trạng thái `DA_CHOT` và có nguồn/xác nhận rõ. Nếu trạng thái là `CHUA_CHOT` hoặc `CAN_HOI_THEM`, phải hỏi người dùng trước khi code phần liên quan.

## Owner Feedback Gate UI/Vận Tải 2026-05-31

- Trang chủ phải theo thứ tự `Quản lý vận tải` -> `Hệ thống` -> `Thông tin bản quyền`.
- Module vận tải không được chỉ dựng CRUD generic: list/detail/form/action phải theo template và đúng nghiệp vụ từng module.
- Các tổng hợp như tổng chuyến, tổng lương chuyến, tổng phí, tổng còn lại không được nhập tay nếu có thể tính từ chi tiết/chuyến xe thực tế.
- Dropdown dữ liệu liên kết lớn như tài xế, địa điểm, xe, chuyến xe phải dùng combobox/searchable picker thay vì select thô.
- Action `duyệt`, `in`, `xuất` là hành động riêng ngoài form; không đặt nút duyệt trong form nhập liệu.
- Trước khi làm trang chủ, module vận tải, list/detail/form/action, combobox hoặc trường tổng hợp tự tính, bắt buộc đọc `.agents/5fedu/12-owner-feedback-transport-ui.md`.

## Template Tham Chiếu Hiện Tại

Template giao diện phải tham chiếu local tại:

```text
.agents/template-source/TAH_app
```

Commit đã chốt để tham chiếu:

```text
47947e6eea0b1b7dc6723356f37f604e30ac690b
```

Khi làm list/detail/form/dashboard/combobox, ưu tiên đối chiếu các component template như `components/shared/GenericTable.tsx`, `GenericToolbar.tsx`, `GenericDrawer.tsx`, `DetailSection.tsx`, `DetailFieldGrid.tsx`, `FormSection.tsx`, `FormGrid.tsx`, `FormDrawerFooter.tsx`, `MobileListCard.tsx`, `components/ui/Combobox.tsx`, `AsyncCombobox.tsx`, `NumericFormatInput.tsx`, và các module mẫu trong `features/he-thong/`.

