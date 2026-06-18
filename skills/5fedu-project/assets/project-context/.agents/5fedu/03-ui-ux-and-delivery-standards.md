# Pillar 3: UI/UX Parity & Delivery Quality Gates

Tài liệu này quy định các quy chuẩn thiết kế giao diện (UI/UX), cấu trúc component, định dạng xuất file báo cáo (Excel, PDF) và các cổng chất lượng (Quality Gates) bắt buộc kiểm duyệt trước khi bàn giao.

---

## 1. Quy Chuẩn Thiết Kế Giao Diện (UI/UX Parity)

### Template Parity Gate Bắt Buộc
- Áp dụng cho mọi task dính UI 5fedu: list, detail, form, drawer, toolbar, filter, export, responsive, module mới, hoặc feedback kiểu `chưa chuẩn`, `thiếu`, `không giống`, `chưa đủ`.
- Mọi thay đổi UI 5fedu, gồm làm mới, làm lại, chỉnh sửa, loại bỏ, bổ sung module, bổ sung nút, bổ sung tính năng, đổi layout, đổi flow hoặc đổi responsive behavior, bắt buộc bám pattern UI của template theo đúng surface/hành vi tương ứng. Không tự tạo UI khác template khi template đã có mẫu phù hợp.
- Trước khi sửa hoặc kết luận thiếu: đọc index/mapping để xác định module, route, source file và spec/source map liên quan.
- Tìm mẫu trong `/template` trước. Nếu có template trực tiếp và đủ đáp ứng ngữ cảnh prompt/app, bám sát template đó; chỉ sửa theo khoảng lệch thật, đổi tối thiểu theo domain, không tự sáng tạo thêm UI/flow/behavior ngoài scope.
- Chỉ dùng fallback/golden reference khi `/template` không có mẫu trực tiếp, mẫu template không đủ đáp ứng hành vi cần làm, hoặc đang đi vào ngõ cụt có bằng chứng. Fallback phải theo cùng loại hành vi, không theo module quen tay.
- Nếu user nói module/tính năng còn thiếu, phải phân biệt thiếu do template/spec yêu cầu, thiếu do rule sống, hay chỉ là phát hiện mới từ feedback. Phát hiện có giá trị tái sử dụng phải promote khỏi log `10`/`12` thành rule sống.
- Báo cáo cuối phải nêu `Template checked: <path>` hoặc `Template checked: none, golden reference: <path>`.

### Context-Aware Template Fallback Matrix
- Template là nguồn ưu tiên cao nhất. Nếu template có mẫu đủ tốt, agent phải bám theo template và không mở rộng giải pháp chỉ vì tìm được golden reference khác.
- Không fallback một cách máy móc sang bất kỳ module cố định nào, kể cả `features/he-thong/nhan-vien`. Golden reference chỉ dùng khi template thiếu/không đủ/ngõ cụt và phải là tab/module có hành vi tương tự nhất với yêu cầu.
- Khi cần fallback, agent phải research trong toàn bộ `/template` và app hiện tại theo reference pool: route/tab/module có hành vi giống, shared component, utility, service/query, file cấu hình, test hoặc export liên quan. Không dừng ở một module quen tay.
- Chọn reference theo mức khớp: cùng behavior/output > cùng surface/layout > cùng data relationship > cùng permission/action pattern > cùng shared primitive. Nếu Nhân viên không có behavior cần tìm, bỏ qua Nhân viên và tìm tab/module khác phù hợp hơn.
- Nếu task là list/table/toolbar/filter/pagination: ưu tiên `/template` list module, `GenericToolbar`, `GenericTable`, `TablePaginationFooter`, rồi golden reference list đang hoàn chỉnh nhất.
- Nếu task là form/detail/drawer/master-detail: ưu tiên `/template` form/detail/drawer, `FormDrawerFooter`, `DetailToolbar`, `GenericSubTableSection`, rồi module có quan hệ cha-con tương tự.
- Nếu task là print/in/PDF/export profile/report: ưu tiên tìm trong `/template` theo từ khóa `print`, `pdf`, `export`, `report`, `profile`, `@media print`, `jspdf`, `autoTable`. Reference tốt gồm `template/features/he-thong/nhan-vien/utils/print-employee-pdf.ts`, `EmployeeProfilePreviewPage`, `EmployeeProfilePreviewContent`, `export-stats-report`, `lib/utils exportToPDF`, `services/print-service`, `index.css @media print`, và cấu hình `jspdf` trong `vite.config/package.json`.
- Nếu `/template` thiếu mẫu trực tiếp, tìm trong app hiện tại theo cùng hành vi trước khi tự viết mới. Ví dụ in bảng lương phải tìm `features/quan-ly-van-tai/bang-luong/utils/print-payroll-pdf.ts`, `PayrollPreviewPage`, `export-transport-report.ts`, hoặc các utility PDF/export đã có.
- Nếu task là báo cáo/thống kê: tham chiếu `TransportReportPage`, `export-transport-report.ts`, `export-stats-report`, rules Excel/PDF và source data/database liên quan.
- Nếu task là permission/menu/action visibility: tham chiếu permission modules, `Can`, `useCan`, `use-resource-permissions`, và test đa role; không chỉ copy layout.
- Nếu task là import/export dữ liệu bảng: tham chiếu `ExportDialog`, `ImportDialog`, `exportToExcel/exportToPDF`, filtered data behavior, column search/filter và database/source data để đối chiếu.
- Khi không có reference trực tiếp, agent phải tách task thành các bề mặt nhỏ hơn: trigger UI, data source, business calculation, output format, permission, verification. Chọn reference riêng cho từng bề mặt thay vì tạo một generic implementation.
- Với ví dụ `in bảng lương`: hiểu là print/export PDF. Phải tham chiếu mẫu PDF/profile/report gần nhất, data/service bảng lương, rules PDF Unicode/font/layout, và verify bằng file PDF thật; không được chỉ thêm nút In hoặc sinh PDF sơ sài.

### Anti-Dead-End Behavior
- Không kết luận `không có trong template` sau một lần tìm hẹp hoặc sau khi chỉ xem một tab/module. Phải thử theo tên module, tên hành vi, từ đồng nghĩa nghiệp vụ, library/API liên quan, component dùng chung, utility, service, test và file cấu hình liên quan.
- Không copy nguyên reference khác nếu template đã đủ. Reference ngoài template chỉ để tháo ngõ cụt hoặc bổ sung đúng phần thiếu.
- Không biến một task nhỏ thành rewrite lớn. Nếu template đã có 80-100% hành vi cần dùng, giữ cấu trúc đó và chỉ thay dữ liệu/label/permission/calculation theo domain.
- Không dừng ở UI nếu hành vi là data/export/permission. Phải tìm đúng mặt trận bị thiếu: service/query, schema, utility export, generated file, permission gate, toolbar behavior, filter state, database verification.
- Nếu có nhiều reference phù hợp, chọn theo thứ tự: template trực tiếp -> template cùng behavior -> app hiện tại cùng behavior -> tab/module cùng surface và quan hệ dữ liệu -> utility/shared primitive. Báo rõ reference đã chọn và lý do không chọn reference quen thuộc hơn nếu nó thiếu hành vi cần làm.

### Nguyên Tắc Tham Chiếu Template Không Để Khoảng Trống (UI Parity - Zero Gaps)
- **Quy tắc**: Khi phát triển một phân hệ mới (ví dụ: Chuyến xe, Địa điểm, Bảng lương, Xe, v.v.), Agent phải lấy `/template` làm nguồn chuẩn đầu tiên. Chỉ khi template thiếu/không đủ/ngõ cụt thì mới dùng tab/module phù hợp nhất trong app để đối chiếu trực tiếp; reference đó phải cùng surface/hành vi/quan hệ dữ liệu, không mặc định Nhân viên.
- **Yêu cầu Zero Gaps**: Mọi phần tử giao diện trong reference đã chọn bắt buộc phải được đối chiếu với phân hệ mới ở mức độ trung thực cao nhất khi phù hợp với ngữ cảnh, bao gồm:
  - **Thanh Toolbar**: Ô tìm kiếm text, bộ lọc trạng thái dạng Combobox, nút Reset bộ lọc, nút Thêm mới (icon + chữ), nút Xuất Excel (icon-only kèm tooltip), dropdown chọn số dòng hiển thị.
  - **Bảng dữ liệu (Grid)**: Cột STT tự động tăng, cột thông tin chính (kèm avatar hoặc icon), các cột dữ liệu trung gian có icon đại diện đầu cột, badge màu hiển thị trạng thái chuẩn, cột hành động `DataTableRowActions` (nút Sửa/Xóa ẩn trong menu ba chấm).
  - **Chân trang (`TablePaginationFooter`)**: Phân trang có số trang, tổng số bản ghi và các nút chuyển trang.
  - **Drawer chi tiết**: Chia cột thông tin trực quan, các tab thông tin liên quan, footer split-layout.
  - **Mobile Card View**: Danh sách hiển thị dạng card thu gọn trên màn hình điện thoại di động.
- Mọi sự thiếu sót hoặc cắt giảm layout so với khuôn mẫu vàng trên bị coi là lỗi nghiêm trọng (UI Gap).

### Nguyên Tắc Cấm Generic Hóa Lười Biếng (Anti-Generic Constraint)
- **Bối cảnh**: Để đối phó và làm nhanh, Agents thường tự ý trừu tượng hóa các phân hệ cụ thể thành một component "Generic" dùng chung duy nhất (như tạo một bảng Generic nạp schema rồi tự render cho tất cả các trang, hoặc dùng một Form duy nhất tự sinh input). Việc này khiến UI trông rẻ tiền, thô sơ, thiếu các thành phần đặc thù của nghiệp vụ (như format tiền tệ, combobox động, ô thông tin lồng nhau, layout cột không đồng đều) và làm cho code cực kỳ khó bảo trì về sau.
- **Quy tắc**:
  1. **Cấm viết generic tùy tiện**: Mỗi phân hệ/trang nghiệp vụ (Nhân viên, Chuyến xe, Bảng lương, v.v.) **bắt buộc phải có các tệp tin view, table, form và service riêng biệt** nằm trong thư mục của feature đó.
  2. **Code tường minh (Explicit Logic)**: Các cột dữ liệu của Table, các trường nhập liệu của Form, các chi tiết hiển thị trong Drawer **phải được khai báo thủ công và tường minh** (explicitly declared) thay vì lặp qua một mảng cấu hình cấu trúc thô sơ.
  3. **Không lạm dụng generic components**: Chỉ sử dụng các components nền tảng dùng chung đã có sẵn trong dự án (như `GenericTable`, `GenericDrawer`, `Combobox`). Tuyệt đối cấm tạo thêm các hàm bọc hoặc component trung gian generic để gộp logic hiển thị của 2 phân hệ khác nhau. Mỗi phân hệ phải giữ cấu trúc độc lập để dễ dàng điều chỉnh nghiệp vụ chuyên biệt mà không ảnh hưởng phân hệ khác.

### Giao Diện Danh Sách & Thao Tác (ListView)
- **Xóa Header Dư Thừa**: Tuyệt đối không tự vẽ khối Page Header (tiêu đề, mô tả, icon lớn) bên trong panel nội dung của các trang phân hệ. Sử dụng Breadcrumbs và Layout bao quát chung của hệ thống.
- **Tiếng Việt Hóa Header**: Tên các cột trong bảng khi dựng động phải được ánh xạ qua bộ từ điển dịch `HEADER_LABELS` để hiển thị tiếng Việt có dấu chuẩn hóa.
- **Chân Trang Phân Trang (`TablePaginationFooter`)**: Tất cả các bảng dữ liệu (kể cả bảng báo cáo, thống kê tùy chỉnh) bắt buộc phải có footer phân trang chuẩn. Không để bảng trần.
- **Bảo Vệ Hành Động Phá Hủy**: Các nút Xóa (destructive) hoặc Duyệt phải đưa vào dropdown menu ẩn (`DataTableRowActions`), không hiển thị lộ thiên trên dòng dữ liệu hoặc chân Mobile Card.
- **Icon Trong Ô Bảng (Cell Icons)**: Các giá trị chính trong ô bảng (họ tên, sđt, biển số, tiền lương, ngày tháng, trạng thái) render kèm icon Lucide tương ứng (dùng `getFieldIcon(colId)`).
- **Phân tách Icon Tài chính (Financial Icons differentiation)**: Để tăng tính trực quan cho giao diện và tránh lặp lại biểu tượng `$` gây đơn điệu (Visual Noise) trong form/chi tiết, các trường tài chính của Bảng lương bắt buộc phải dùng các biểu tượng chuyên biệt: Lương chuyến dùng `Banknote`, Chi phí chuyến dùng `Receipt`, Trừ tiền khác dùng `MinusCircle`, Chi phí khác dùng `CreditCard`, và Tổng còn lại dùng `Wallet`.


### Form & Detail Drawer Layout
- **Footer Drawer Chi Tiết**: Sử dụng split-layout compact (`h-8 px-3 text-xs`): nút Đóng (ghost button) nằm bên trái, nút Sửa (primary) và nút Xóa (destructive/outline) nằm bên phải. Sử dụng hàm nhãn nút chuẩn từ `lib/button-labels.ts` (`BTN_CLOSE()`, `BTN_EDIT()`, `BTN_DELETE()`).
- **Form Drawer Footer**: Tái sử dụng component `FormDrawerFooter` với thuộc tính `compact` và truyền `createIcon` (như `<Plus className="..." />`).
- **Nút Chỉnh Sửa**: Sử dụng đồng bộ icon `Edit` của Lucide cho tất cả các nút chỉnh sửa, không dùng icon `Pencil`.

### Thiết Kế Mô Hình Master-Detail (Cha - Con)
- **Bảng Con Nhúng (Embedded Sub-Grid)**: Sử dụng cặp `DetailSection` và `EmbeddedChildDataGrid` để đảm bảo giao diện đồng bộ 100% về viền, bóng, và chiều cao tự cuộn dọc.
- **Ngăn Chặn Sai Lệch Dữ Liệu**: Khi mở form con từ chi tiết cha, bắt buộc điền sẵn ID của cha và khóa cứng (disabled) trường liên kết đó.
- **Drawers Xếp Chồng (Stacked Drawers)**: Quản lý qua `nestedFormConfig` ở cấp trang cha. Khi Drawer con mở ra, sử dụng thuộc tính `stackLevel` để tự động thụt lề và đổ bóng chuẩn.
- **Kế Thừa Trạng Thái Khóa (Cascading Locks)**: Khi dòng cha ở trạng thái đã phê duyệt/hoàn thành, member **không có** `quan_tri`/`cap_bac=1` phải bị khóa — **ẩn** nút sửa/xóa/báo cáo (không hiện nút rồi toast từ chối). **Ngoại lệ bắt buộc**: `role=admin`, `cap_bac=1`, hoặc grant ma trận `admin`/`all` (`quan_tri`) **vẫn được sửa/xóa** mọi trạng thái; handler UI phải dùng `isRowLockedForUser()` (đồng bộ `canEditRow`/`canDeleteRow`), không gọi thẳng `config.lockedWhen`. Luồng **báo cáo CT** chỉ route cho **tài xế** sở hữu chuyến — admin sửa CT mở form con, không popup báo cáo.
- **Không Bỏ Sót Bảng Con Nghiệp Vụ**: Nếu spec/database có quan hệ cha-con thật (ví dụ `vt_chuyen_xe` -> `vt_chuyen_xe_ct`), detail drawer của bản ghi cha bắt buộc có section bảng con để end user xem và thao tác chi tiết liên quan. Form thêm/sửa bản ghi cha phải có section con phù hợp: nếu chưa thể thêm con trước khi có ID cha thì hiển thị hướng dẫn rõ và cho thêm con ngay sau khi lưu/mở detail, không được bỏ trống như chỉ có form cha.
- **Verify Master-Detail Theo Dữ Liệu Thật**: Khi sửa module cha-con phải test bằng record cha có ít nhất 2 dòng con trong database, đối chiếu tổng hợp/rollup ở cha và danh sách con trên FE. Không kết luận PASS chỉ vì CRUD cha chạy được.
- **Tạo bảng con trực tiếp khi tạo mới cha (Nested Creation Flow)**: Form tạo mới cha (ví dụ: Chuyến xe) bắt buộc phải cho phép thêm/sửa/xóa dòng con trực tiếp trong form trước khi lưu bản ghi cha. Sử dụng React state tạm thời (`tempChildRows`) ở client và lưu tuần tự: Insert cha trước -> Thu thập ID tự tăng của cha -> Map ID này vào trường FK (`id_chuyen_xe`) của danh sách con tạm thời -> Insert dòng con hàng loạt.
- **Tự động điền dữ liệu liên kết Địa điểm (Location Lookup Autofill)**: Khi chọn Địa điểm (`id_dia_diem`) trong form chi tiết dòng con, form phải tự động tra cứu thông tin địa điểm từ lookup `locations` và tự động điền các trường `tien_luong` và `chi_phi` tương ứng theo cấu hình mặc định của địa điểm đó.


### Tối Ưu Hóa Trải Nghiệm Thao Tác & Quản Lý Tab (Interaction & Navigation Guard)
- **Triệt Tiêu Tab Mini Trùng Lặp (No Duplicate Mini-Tabs)**:
  - Các tính năng đã được quy hoạch ở phân hệ riêng (ví dụ: Báo cáo Thống kê Chuyến xe, Báo cáo Thống kê Lương đã có trong các module thống kê chuyên biệt) thì **tuyệt đối không được nhúng lại thành các tab phụ (mini-tabs) trong trang danh sách của phân hệ chính** (như Chuyến xe, Bảng lương).
  - Tránh trùng lặp chức năng, làm rối loạn luồng đi của người dùng và làm giảm hiệu năng load trang.
  - Nếu một phân hệ chỉ còn một tab danh sách duy nhất sau khi loại bỏ tab trùng lặp, phải loại bỏ hoàn toàn `TabGroup` để trực tiếp hiển thị bảng dữ liệu chính (tương tự trang Địa điểm).
- **Cơ Chế Xác Nhận Tuyệt Đối Trước Khi Thao Tác (Absolute Action Confirmation Gate)**:
  - Mọi nút hành động thay đổi dữ liệu hoặc thay đổi trạng thái trực tiếp trên giao diện (ví dụ: `Quản lý duyệt` trong bảng con, `Quản lý duyệt` trên toolbar chi tiết, hoặc các nút đổi trạng thái hàng loạt như "Kích hoạt", "Ngừng hoạt động") **bắt buộc phải đi kèm popup xác nhận (`confirm` dialog)**.
  - Tuyệt đối không bao giờ cho phép thực thi thay đổi ngay lập tức (instant mutation) chỉ bằng một click chuột mà không có bước xác nhận an toàn từ phía người dùng.
  - Sử dụng hàm `confirm` từ `useConfirmStore` của hệ thống để hiển thị popup xác nhận với các nhãn nút và thông điệp tiếng Việt tường minh rõ ràng (ví dụ: "Đồng ý", "Xóa", "Hủy").
- **Cơ Chế Một Nút Thao Tác Trạng Thái Trên Toolbar Chi Tiết (Single Status Toolbar Button)**:
  - Trên thanh toolbar chi tiết (`DetailToolbar`) của các thực thể chính, nếu có các hành động thay đổi trạng thái tương đương nhau thì **chỉ hiển thị một nút hành động chính, linh hoạt và đầy đủ nhất**.
  - Chuyến xe/CT (owner 2026-06-15): **duyệt** do cấp trên qua `Quản lý duyệt` từ bảng cha; **thực hiện** do tài xế trên từng CT qua popup báo cáo (đổi thực hiện + nhập chi phí). Không trộn hai lớp trạng thái vào một cột/nút.
  - Làm gọn toolbar chi tiết, tránh gây nhiễu và bối rối cho người dùng khi chọn giữa hai nút có bản chất tương tự nhau.

---

## 2. Kỷ Luật Biên Dịch & Code Hygiene

- **Phòng Vệ Temporal Dead Zone (TDZ)**: Khai báo tất cả các hàm handler (`askApprove`, `handleSave`...) ở đầu component (ngay sau state). Tuyệt đối cấm tham chiếu các handler này trong dependency array của `useMemo`/`useCallback` đặt ở phía trước dòng định nghĩa handler.
- **React Hooks Trong Render**: Tất cả các hooks (`useMemo`, `useCallback`, `useEffect`) bắt buộc phải được khai báo ở đầu component. Tuyệt đối không gọi hooks có điều kiện hoặc trả về sớm (JSX early return) ở phía trên các khai báo React Hook khác.
- **Kiểm Soát Import**: Không sử dụng component hoặc icon mà không import rõ ràng ở đầu file (tránh lỗi ReferenceError runtime do DOM toàn cục).
- **Phòng Vệ Kiểu Dữ liệu FK trên Form (FK Type Guard)**:
  - Khi form có trường `select` trỏ đến bảng khác (có `relation`) và trường đó **không bắt buộc** (`required: false`), giá trị mặc định của trường phải là `null` thay vì chuỗi rỗng `''`.
  - Hàm `normalizeFormValues()` bắt buộc phải xử lý: nếu trường có `relation` và giá trị hiện tại là `''` (chuỗi rỗng) hoặc `'0'`, phải chuyển thành `null` trước khi gửi lên service/repository.
  - Quy tắc này phòng vệ lỗi `invalid input syntax for type bigint: ""` khi PostgreSQL nhận chuỗi rỗng cho cột kiểu `int8`.

---

## 3. Quy Chuẩn Xuất File Báo Cáo (Excel & PDF)

### Xuất File Excel (`.xlsx`)
Sử dụng thư viện `xlsx-js-style` để định dạng chuyên nghiệp:
- **Kiểu Dữ Liệu Thực (Cell Type 'n')**: Các cột chứa số liệu (Tiền lương, Chi phí, Số chuyến...) bắt buộc xuất dưới dạng Number thực tế để có thể tính toán (`SUM`, `AVERAGE`), cấm xuất dạng String. Định dạng hiển thị số: `numFmt: "#,##0"`.
- **Căn Lề (Alignment)**: Cột số căn lề phải (right), cột ngày tháng/trạng thái/biển số căn giữa (center), cột text thường căn lề trái (left).
- **Header & Layout**: Header màu xanh dương đậm (`#1E3A8A`), chữ trắng, font Segoe UI, in đậm. Dùng màu nền dòng xen kẽ nhẹ nhàng để tăng độ tương phản.
- **Nút Xuất trên Toolbar**: Hiển thị dạng icon-only (Download icon) kèm tooltip mô tả, không dùng nút to bản kèm chữ.

### Xuất File PDF (`.pdf`)
Sử dụng jsPDF để định dạng:
- **Hỗ Trợ Tiếng Việt (Unicode)**: Cấm dùng font mặc định của jsPDF (như Helvetica, Times) gây lỗi hiển thị ký tự lạ (mojibake).
- **Đăng Ký Font Chữ**: Tải file font TrueType hỗ trợ tiếng Việt (`Roboto-Regular.ttf` và `Roboto-Medium.ttf` từ CDN), chuyển đổi sang base64 thông qua ArrayBuffer, và đăng ký với jsPDF bằng `doc.addFileToVFS` và `doc.addFont`.
- **Áp Dụng Font**: Đảm bảo tất cả văn bản vẽ bằng `doc.text` và bảng vẽ bằng `autoTable` đều chỉ định sử dụng font đã đăng ký (`font: 'Roboto'`).

---

## 4. Cổng Chất Lượng Bàn Giao (Quality Gates)

Trước khi bàn giao bất kỳ task nào, Agent bắt buộc phải vượt qua các cổng kiểm tra sau:

1.  **Cổng 1: Biên dịch cục bộ (Local Compile Check)**:
    - Chạy thử build production ở local: `npm run build` hoặc `npm run type-check`.
    - Phải giải quyết 100% lỗi cú pháp, TypeScript type mismatches, và thiếu import trước khi commit.
2.  **Cổng 2: Browser Click-through Test**:
    - Dùng browser subagent/Playwright mở localhost, đăng nhập `admin` / `5fedu.com`.
    - Thực hiện **chuỗi CRUD đầy đủ**: Thêm mới bản ghi -> Kiểm tra bảng -> Click chọn dòng -> Bấm sửa -> Lưu -> Mở drawer chi tiết -> Click xóa -> Kiểm tra dòng biến mất. Chụp ảnh/quay video màn hình làm bằng chứng kiểm thử.
3.  **Cổng 3: Verify-on-Production (Hậu Kiểm)**:
    - Sau khi CI/CD tự động deploy lên Vercel, lặp lại Bước 2 trực tiếp trên môi trường Live để đảm bảo tính năng không bị crash hoặc chặn do cấu hình CDN/cửa sổ bảo mật của trình duyệt.
4.  **Kỷ Luật Cấm Deploy Thủ Công**:
    - AI tuyệt đối không chạy lệnh deploy trực tiếp ứng dụng lên production qua terminal (`vercel --prod` hoặc tương đương) để tránh xung đột trạng thái build và rò rỉ secrets. Chỉ commit, push mã nguồn để CI/CD xử lý tự động.
## Universal Verification Gate For 5fedu UI

Mỗi thay đổi UI hoặc flow nghiệp vụ phải verify như một hệ thống liên kết, không chỉ bấm thử nút vừa sửa.

- Kiểm tra toolbar: bulk actions, row actions, dropdown actions, destructive actions, disabled/hidden states.
- Kiểm tra filter/search: filter chip, column filter, reset, search theo trường trực tiếp và trường liên kết; đối chiếu kết quả với database/source data.
- Kiểm tra list/detail/form/drawer: create, view, edit, delete, cancel, save, validation, refresh state, drawer state sau mutation.
- Kiểm tra responsive: desktop list view và mobile card view nếu module có mobile behavior.
- Kiểm tra export: tải file thật, mở/đọc file, xác nhận tên file, extension, dữ liệu, định dạng Excel/PDF/CSV.
- Kiểm tra cross-module: dữ liệu thay đổi ở module này phải cập nhật đúng dropdown, báo cáo, bảng tổng hợp, module cha/con, cache/query ở module liên quan.
- **Phòng vệ lỗi in ấn & tính toán Lương/Báo cáo (Date Parsing Robustness)**: Tuyệt đối không sử dụng `new Date(dateString + "T00:00:00")` để so sánh hoặc tính toán năm/tháng của các chuyến xe. Định dạng ngày thô có thể gây lỗi `Invalid Date` hoặc sai lệch múi giờ trên trình duyệt của người dùng (như Safari hoặc iOS). Bắt buộc sử dụng phân tách chuỗi `dateString.split(/[-T]/)` để trích xuất trực tiếp giá trị năm và tháng dưới dạng số.
- **Hai lớp trạng thái Chuyến xe (không lẫn lộn)**:
  - **Duyệt**: cha `vt_chuyen_xe.trang_thai`, con `vt_chuyen_xe_ct.phe_duyet` — bộ `Chưa duyệt`/`Đã duyệt`/`Không duyệt`; duyệt từ cha cascade xuống CT; action `Quản lý duyệt`.
  - **Thực hiện**: con `vt_chuyen_xe_ct.trang_thai` — bộ template `Chưa thực hiện`/`Đang thực hiện`/`Đã thực hiện`/`Hủy`; tài xế popup vừa đổi thực hiện vừa nhập `chi_phi`; cho phép CT đã thực hiện nhưng chưa duyệt.
  - Cột cha `Hoàn thành` dạng `2/4`: đếm CT **đã thực hiện**/tổng, không đếm duyệt.
  - Toolbar tài xế: **`Báo cáo CT`** (per-CT popup TH + chi phí); **cấm** modal báo cáo chỉ ghi chú chuyến cha.
  - Duyệt: **chỉ** `Quản lý duyệt` trên chuyến cha → cascade; **cấm** nút/modal duyệt lẻ từng CT (R4).
  - `so_chuyen` list cha = CT đã TH; `tong_luong`/`tong_phi` = CT đủ R6 (đã TH + đã duyệt).
- **Popup Phê duyệt phải có Form nhập ý kiến**: Nút phê duyệt (Duyệt/Không duyệt) của các chứng từ/bảng lương/chuyến xe không được xác nhận đơn giản, mà phải mở Popup chứa Form gồm: lựa chọn kết quả (Đã duyệt / Không duyệt) dạng 2 thẻ nút bấm song song và ô nhập Ý kiến phê duyệt (`ghi_chu`).
  - Giao diện thẻ Phê duyệt Active/Inactive: Sử dụng màu nền nhạt pastel (Duyệt active: `bg-[#f3faf7]`, viền lục `border-[#31c48d]`; Không duyệt active: `bg-[#fdf2f2]`, viền đỏ `border-[#f05a5a]`). Text có màu sẫm `text-foreground`. Icon trạng thái là hình tròn có nền màu (Duyệt: vòng lục nhạt `bg-[#def7ec]` chứa icon `Check` xanh `text-[#0e9f6e]` nét stroke-[3.5]; Không duyệt: vòng đỏ nhạt `bg-[#fde8e8]` chứa icon `X` đỏ `text-[#e02424]` nét stroke-[3.5]).
- Nếu phát hiện lỗi nghiêm trọng trong scope, tự sửa và test lại cho đến khi đạt hoặc bị chặn bởi quyền/dữ liệu/môi trường.


## Production Verification Default

Với 5fedu, production là môi trường verify mặc định sau khi user đã yêu cầu push và CI/CD deploy xong. Không tự push chỉ để test production nếu user chưa yêu cầu rõ.

Khi verify production:

- xác nhận đúng site production;
- xác nhận deploy mới nhất đã hoàn tất;
- dùng dữ liệu test an toàn;
- kiểm tra console/network lỗi nghiêm trọng;
- đối chiếu database sau CRUD hoặc export nếu feature ghi dữ liệu;
- báo `PARTIAL` nếu thiếu credential/MFA/quyền hoặc không thể test external integration thật.

### Harness Playwright production (TAH)

Chi tiết đầy đủ: `14-production-e2e-harness.md`. Tóm tắt bắt buộc:

- Chạy qua `npx playwright test --project=production-e2e` sau deploy; không deploy thủ công bằng terminal.
- Sửa module **Chuyến xe / CT / lương / phân quyền vận tải** → chạy thêm `production-trip-execution.spec.ts` và unit `trip-execution-sync.test.ts`.
- Test làm thay đổi dữ liệu: `snapshotPendingDriverTrip` / `restorePendingDriverTrip` (fixture chuyến `52`).
- Assert duyệt cha: `expectTripParentApprovalDialog` — không kỳ vọng modal duyệt lẻ CT (R4).
- Skip có chủ đích khi production chưa có filter **Thực hiện** hoặc popup TH mới → kiểm tra gate bundle trước khi báo FAIL.
