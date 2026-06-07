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
- **[New] Sửa lỗi in bảng lương trắng tinh (Date Parsing Robustness)**: Tuyệt đối không dùng `new Date(dateString + "T00:00:00")` để parse năm/tháng của chuyến xe, do dễ gây lỗi `Invalid Date` hoặc sai lệch múi giờ trên một số trình duyệt (đặc biệt Safari/iOS), làm tính toán số chuyến bằng 0. Thay vào đó, trích xuất trực tiếp bằng cách cắt chuỗi `.split(/[-T]/)`.
- **[New] Tích hợp bảng con khi tạo mới cha (Nested Creation)**: Form thêm mới chuyến xe cha phải cho phép thêm các dòng con trực tiếp trước khi lưu. Logic lưu sẽ là: Insert cha trước -> Lấy ID mới sinh -> Gắn vào khóa ngoại dòng con tạm thời -> Insert dòng con hàng loạt.
- **[New] Liên kết Địa điểm tự động nhảy lương/chi phí**: Khi chọn Địa điểm (`id_dia_diem`) trong chi tiết chuyến xe, phải tự động tra cứu lookup địa điểm và điền các trường `tien_luong` và `chi_phi` tương ứng.
- **[New] Đồng bộ Trạng thái Phê duyệt & Thực hiện**: Phân biệt rõ bảng cha dùng trạng thái duyệt (`Chưa duyệt`, `Đã duyệt`, `Không duyệt`) và bảng con dùng trạng thái thực hiện (`Chưa thực hiện`, `Đang thực hiện`, `Đã thực hiện`, `Không thực hiện`).
- **[New] Popup Duyệt chi tiết bám sát template**: Nút Duyệt không dùng confirm box thô sơ, mà phải mở Popup chứa Form gồm: chọn kết quả duyệt (Đã duyệt / Không duyệt) và ô nhập Ghi chú ý kiến phê duyệt (`ghi_chu`).

Các bài học trên đã được promote vào `03-ui-ux-and-delivery-standards.md`, `02-database-and-auth-rules.md` và quality gates chung. File này giữ vai trò log để truy vết khi user nhắc lại feedback vận tải.

