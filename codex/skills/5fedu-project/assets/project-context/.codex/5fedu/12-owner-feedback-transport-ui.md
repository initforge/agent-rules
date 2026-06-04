# Owner Feedback Transport UI Log

File này là log riêng cho feedback vận tải/UI có tính lịch sử. Rule sống phải nằm ở `03-ui-ux-and-delivery-standards.md`, `02-database-and-auth-rules.md`, hoặc decision/status file phù hợp.

Khi nhận feedback vận tải mới:

1. Ghi raw wording ngắn vào file này nếu cần giữ bằng chứng.
2. Promote rule dùng lại được vào file rule sống.
3. Cập nhật decision/status nếu feedback làm thay đổi phạm vi đã chốt.
4. Sync `.agents/5fedu` và `.codex/5fedu`.

## Log

### Baseline promoted transport/UI lessons

- Module vận tải không được dựng CRUD generic theo bảng thô; phải mô hình hóa master-detail và flow nghiệp vụ thật.
- Tổng chuyến, tổng tiền, tổng lương chuyến, tổng phí và các trường derived không cho nhập tay nếu có thể tính từ dòng con hoặc dữ liệu liên quan.
- Chuyến xe cha, chi tiết chuyến, bảng lương, tài xế, xe, địa điểm và báo cáo phải verify chéo dữ liệu sau CRUD.
- Dropdown danh sách lớn như tài xế, xe, địa điểm, chuyến xe phải dùng combobox/searchable picker, không dùng native select thô.
- Toolbar phải kiểm tra bulk actions, row actions, action nguy hiểm, action duyệt/in, disabled/hidden state và responsive behavior.
- Filter/search phải đối chiếu với database/source data, bao gồm trường liên kết hiển thị nhưng lưu bằng ID.
- Drawer/detail phải giữ dữ liệu mới nhất sau mutation, không hiển thị state cũ khi React Query đã refetch.
- Khi cha đã duyệt/chốt, dòng con phải kế thừa trạng thái khóa nếu nghiệp vụ yêu cầu.
- Detail tài xế/xe/địa điểm cần hiển thị lịch sử liên quan khi nghiệp vụ cần điều tra luồng vận tải.
- File export phải được tải thật và kiểm tra tên file, extension, format, dữ liệu và font/cell type.

Các bài học trên đã được promote vào `03-ui-ux-and-delivery-standards.md`, `02-database-and-auth-rules.md` và quality gates chung. File này giữ vai trò log để truy vết khi user nhắc lại feedback vận tải.

