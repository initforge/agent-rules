# 5fedu Business Patterns

Tài liệu này là thư viện pattern nghiệp vụ sống cho các app ERP/admin 5fedu. Mục tiêu là giữ các bài học từ TAH ở dạng khuôn mẫu rộng, không biến ví dụ vận tải thành thế giới mặc định của mọi dự án.

## 1. Shared Base Entity + Specialized Roles

Khi một thực thể vừa là hồ sơ gốc vừa có vai trò nghiệp vụ chuyên sâu, không tự tách dữ liệu thành nhiều bảng trùng nhau.

- Giữ một nguồn dữ liệu gốc cho thông tin định danh, liên hệ, trạng thái và audit.
- Vai trò chuyên sâu có thể dùng cờ phân loại, bảng liên kết, hoặc bảng mở rộng tùy spec.
- Màn hình chuyên sâu lọc dữ liệu theo vai trò và bổ sung tab/lịch sử nghiệp vụ riêng.
- Xóa vai trò chuyên sâu phải là soft-delete role hoặc unlink theo spec; không xóa vật lý hồ sơ gốc nếu hồ sơ còn dùng ở nơi khác.
- Dropdown/combobox trỏ tới vai trò chuyên sâu phải lấy dữ liệu đã lọc từ service/API, không tự lọc rời rạc trong từng component.

Ví dụ: Nhân viên là hồ sơ gốc; Tài xế là vai trò chuyên sâu có lịch sử chuyến/lương.

## 2. Master-Detail Và Nested Creation

Với nghiệp vụ cha-con, agent phải xem cha và con là một workflow dữ liệu liên kết, không phải hai CRUD rời nhau.

- Detail của bản ghi cha phải hiển thị dòng con liên quan khi spec/database có quan hệ thật.
- Form tạo/sửa cha phải có cách nhập hoặc dẫn sang dòng con phù hợp với lifecycle của ID cha.
- Nếu cần tạo cha-con trong một lần, dùng state tạm cho dòng con, lưu tuần tự: insert cha -> lấy ID cha -> map FK -> insert dòng con.
- Mọi FK từ dòng con về cha phải được điền và khóa khi mở từ context cha.
- Verify bằng dữ liệu thật có nhiều dòng con; không báo PASS chỉ vì CRUD cha chạy.

Ví dụ: Phiếu cha và chi tiết phiếu; đơn hàng và dòng hàng; chuyến xe và chi tiết chuyến.

## 3. Approval Workflow Và Hai Trục Trạng Thái

Nhiều nghiệp vụ có cả trạng thái thực hiện và trạng thái phê duyệt. Không gộp hai trục này vào một field hoặc một nút nếu spec thể hiện chúng khác nhau.

- Trạng thái thực hiện mô tả tiến độ nghiệp vụ của dòng/việc.
- Trạng thái phê duyệt mô tả quyết định kiểm tra/chấp thuận.
- Nếu duyệt ở cấp cha, phải xác định rõ cascade xuống dòng con hay aggregate từ dòng con lên cha.
- Dữ liệu đã duyệt/khóa phải ẩn hoặc khóa hành động sửa/xóa ở UI và service cho user không đủ quyền.
- Action duyệt phải qua permission matrix hoặc role/scope đã chốt, không suy diễn từ quyền sửa thông thường.

Ví dụ: Chi tiết công việc đã thực hiện nhưng phiếu cha chưa duyệt; bảng lương chỉ tính dòng đủ điều kiện thực hiện + duyệt.

## 4. Derived Fields Và Rollup

Các trường tổng hợp hoặc tính toán không được nhập tay nếu có source records rõ ràng.

- Total/count/status summary phải tính từ dữ liệu nguồn hoặc trigger/service đã chốt.
- Field dẫn xuất trên UI nên read-only và thể hiện nguồn tính.
- Sau CRUD dòng con, phải invalidate cache và verify lại cha, báo cáo, export, dropdown liên quan.
- Export/print/report dùng cùng nguồn tính với UI, không tự tính lại bằng logic khác.

Ví dụ: tổng tiền, tổng số lượng, số dòng hoàn thành, tổng chi phí, tổng lương, trạng thái tổng hợp.

## 5. Lookup Autofill

Khi bản ghi liên kết có cấu hình mặc định, form phải hỗ trợ tự động điền trường dẫn xuất theo spec.

- Tra cứu dữ liệu liên kết qua service/API hoặc lookup source chuẩn.
- Chỉ autofill các field đã được spec/source xác nhận.
- Field autofill cần cho phép override hay read-only phải theo nghiệp vụ, không đoán.
- Nếu lookup thiếu dữ liệu, hiển thị trạng thái thiếu dữ liệu và không tự bịa giá trị.

Ví dụ: chọn địa điểm tự điền đơn giá/chi phí; chọn sản phẩm tự điền đơn vị/quy cách; chọn nhân sự tự điền phòng ban/chức vụ.

## 6. Action Segregation Và Confirmation

Form nhập liệu chỉ nên nhập dữ liệu. Hành động nghiệp vụ có side effect phải tách rõ.

- Các action như duyệt, in, xuất, báo cáo, đổi trạng thái, hủy, khóa/mở khóa không đặt lẫn vào submit form nếu chúng là workflow riêng.
- Action phá hủy hoặc đổi trạng thái phải có confirm/dialog theo pattern dự án.
- Toolbar/list/detail/mobile phải cùng một policy hiển thị action.
- Không thêm action mới nếu Pattern Fidelity Packet không chứng minh nguồn từ spec/template/current app.

## 7. Report, Print, Export Parity

Report/print/export là bề mặt nghiệp vụ thật, không phải tiện ích phụ.

- File xuất phải dùng cùng dữ liệu đã filter/tính toán với UI.
- Excel phải giữ kiểu số thật cho số liệu, không xuất số dạng string.
- PDF tiếng Việt phải dùng font hỗ trợ Unicode và verify bằng file thật.
- Preview, print và file export phải cùng format thông tin công ty, header, bảng dữ liệu và tổng hợp chính.
- Nếu browser/PWA/service worker ảnh hưởng download hoặc tên file, dùng helper download chung và verify trên trình duyệt mục tiêu.

## 8. Permission Scope Matrix

Permission phải gồm cả quyền hành động và phạm vi dữ liệu.

- Grant quyết định user được xem/thêm/sửa/xóa/duyệt/hành động gì.
- Scope quyết định user được tác động dòng nào: toàn bộ, phòng ban/nhóm, bản ghi liên quan trực tiếp, hoặc scope khác theo spec.
- Role cấp cao/admin không được là test duy nhất.
- UI hidden/disabled state, service guard và database/RLS policy phải được verify nhất quán khi có thể.

Ví dụ: cấp quản trị xem toàn bộ; quản lý xem nhóm/phòng ban; nhân sự thường chỉ xem bản ghi liên quan trực tiếp.

## 9. Organizational Baseline: Nhan Vien -> Phong Ban -> Chuc Vu

Voi nhom module quan tri noi bo, khong duoc suy luan moi module la mot the gioi rieng.

- `Nhan vien` la baseline entity/module goc cho CRUD, form, detail, toolbar, export va stats shell.
- `Phong ban` la truc to chuc cha va mac dinh chi dung hierarchy 2 cap tru khi spec/template/app xac nhan cau truc sau hon.
- `Chuc vu` la doi tuong nam trong truc `Phong ban`; khi them/sua/loc/grouping/permission scope, xem `Phong ban` la parent context.
- Neu can tao module moi cung ho quan tri noi bo, uu tien clone/adapt tu baseline `Nhan vien`, roi chi doi khac biet nghiep vu.
- Khong tach `Chuc vu` thanh pattern doc lap lam lech dropdown, detail, filter va quan he to chuc da co.

Vi du: form Nhan vien chon `Chuc vu` de suy ra `Phong ban`; detail `Phong ban` hien quan he xuong `Chuc vu`; list `Chuc vu` loc theo cay `Phong ban`.

## 10. Stats Shell Reuse

Thong ke la mot pattern song rieng, khong phai moi module tu ve lai.

- Neu module co `Thong ke`, reuse shell stats cua `Nhan vien`: tab `stats`, toolbar loc, KPI grid, charts, data grid, drilldown, export report.
- Chi thay source data, label nghiep vu, cong thuc tinh va permission scope theo module.
- Khong chen mini-stats tam bo vao CRUD page neu nghiep vu can mot surface stats/report rieng.
- Export/print cua stats phai dung cung data da filter/tinh toan voi UI stats, khong dung mot source khac.

Vi du: thong ke module moi van di theo shell `Nhan vien`, nhung thay KPI, chart, bang tong hop va ten file xuat theo domain that.
