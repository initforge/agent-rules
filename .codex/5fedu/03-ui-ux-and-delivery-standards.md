# Pillar 3: UI/UX Parity & Delivery Quality Gates

Tài liệu này quy định các quy chuẩn thiết kế giao diện (UI/UX), cấu trúc component, định dạng xuất file báo cáo (Excel, PDF) và các cổng chất lượng (Quality Gates) bắt buộc kiểm duyệt trước khi bàn giao.

---

## 1. Quy Chuẩn Thiết Kế Giao Diện (UI/UX Parity)

### Pattern Fidelity Contract (Cấm tự chế UI/copy/module)
- Với mọi phân hệ 5fedu, template/current app là source of truth bắt buộc; agent không được coi template là gợi ý trang trí.
- Trước khi sửa UI, phải có `Pattern Fidelity Packet` theo mẫu trong `02-frontend-mapping.md`.
- Cấm tự tạo hoặc đổi tên module, description, button, icon, tooltip, empty state, tab, route, toolbar action, filter, badge hoặc mini-tab nếu không có nguồn từ spec/template/current app.
- Mọi UI khác pattern hoặc thêm hành động ngoài packet là lỗi nghiêm trọng, phải sửa trước khi báo `PASS`.

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
- Nếu task là list/table/toolbar/filter/pagination: ưu tiên `/template` list module, shared toolbar/table/pagination primitives hiện có, rồi golden reference list đang hoàn chỉnh nhất.
- Nếu task là form/detail/drawer/master-detail: ưu tiên `/template` form/detail/drawer, shared drawer/form/detail primitives hiện có, rồi module có quan hệ cha-con tương tự.
- Nếu task là print/in/PDF/export profile/report: ưu tiên tìm trong `/template` và app hiện tại theo từ khóa hành vi (`print`, `pdf`, `export`, `report`, `profile`, media print, PDF/table libraries), utility export, preview page, print service và cấu hình thư viện liên quan.
- Nếu `/template` thiếu mẫu trực tiếp, tìm trong app hiện tại theo cùng hành vi trước khi tự viết mới. Ví dụ in bảng lương phải tìm print/export PDF utility, preview page, report export utility hoặc helper PDF/export đã có của chính module đó.
- Nếu task là báo cáo/thống kê: tham chiếu report page/export utility gần nhất, rules Excel/PDF và source data/database liên quan.
- Nếu task là permission/menu/action visibility: tham chiếu permission modules/hooks/components hiện có và test đa role; không chỉ copy layout.
- Nếu task là import/export dữ liệu bảng: tham chiếu dialog/helper import-export hiện có, filtered data behavior, column search/filter và database/source data để đối chiếu.
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
  - **Bảng dữ liệu (Grid)**: Cột STT tự động tăng, cột thông tin chính (kèm avatar hoặc icon), các cột dữ liệu trung gian có icon đại diện đầu cột, badge màu hiển thị trạng thái chuẩn, và cột hành động theo pattern an toàn của template.
  - **Chân trang**: Phân trang có số trang, tổng số bản ghi và các nút chuyển trang theo component/pattern hiện có.
  - **Drawer chi tiết**: Chia cột thông tin trực quan, các tab thông tin liên quan, footer split-layout.
  - **Mobile Card View**: Danh sách hiển thị dạng card thu gọn trên màn hình điện thoại di động.
- Mọi sự thiếu sót hoặc cắt giảm layout so với khuôn mẫu vàng trên bị coi là lỗi nghiêm trọng (UI Gap).

### Nguyên Tắc Cấm Generic Hóa Lười Biếng (Anti-Generic Constraint)
- **Bối cảnh**: Để đối phó và làm nhanh, Agents thường tự ý trừu tượng hóa các phân hệ cụ thể thành một component "Generic" dùng chung duy nhất (như tạo một bảng Generic nạp schema rồi tự render cho tất cả các trang, hoặc dùng một Form duy nhất tự sinh input). Việc này khiến UI trông rẻ tiền, thô sơ, thiếu các thành phần đặc thù của nghiệp vụ (như format tiền tệ, combobox động, ô thông tin lồng nhau, layout cột không đồng đều) và làm cho code cực kỳ khó bảo trì về sau.
- **Quy tắc**:
  1. **Cấm viết generic tùy tiện**: Mỗi phân hệ/trang nghiệp vụ (Nhân viên, Chuyến xe, Bảng lương, v.v.) **bắt buộc phải có các tệp tin view, table, form và service riêng biệt** nằm trong thư mục của feature đó.
  2. **Code tường minh (Explicit Logic)**: Các cột dữ liệu của Table, các trường nhập liệu của Form, các chi tiết hiển thị trong Drawer **phải được khai báo thủ công và tường minh** (explicitly declared) thay vì lặp qua một mảng cấu hình cấu trúc thô sơ.
  3. **Không lạm dụng generic components**: Chỉ sử dụng các component nền tảng dùng chung đã có sẵn trong dự án khi chúng đúng pattern hiện tại. Tuyệt đối cấm tạo thêm hàm bọc hoặc component trung gian generic để gộp logic hiển thị của 2 phân hệ khác nhau. Mỗi phân hệ phải giữ cấu trúc độc lập để dễ điều chỉnh nghiệp vụ chuyên biệt mà không ảnh hưởng phân hệ khác.

### Giao Diện Danh Sách & Thao Tác (ListView)
- **Xóa Header Dư Thừa**: Tuyệt đối không tự vẽ khối Page Header (tiêu đề, mô tả, icon lớn) bên trong panel nội dung của các trang phân hệ. Sử dụng Breadcrumbs và Layout bao quát chung của hệ thống.
- **Tiếng Việt Hóa Header**: Tên các cột trong bảng khi dựng động phải được ánh xạ qua bộ từ điển dịch `HEADER_LABELS` để hiển thị tiếng Việt có dấu chuẩn hóa.
- **Chân Trang Phân Trang**: Tất cả các bảng dữ liệu (kể cả bảng báo cáo, thống kê tùy chỉnh) bắt buộc phải có footer phân trang theo pattern hiện có. Không để bảng trần.
- **Bảo Vệ Hành Động Phá Hủy**: Các nút Xóa (destructive) hoặc Duyệt phải nằm trong pattern hành động an toàn của dự án (menu/dropdown/confirm), không hiển thị lộ thiên gây bấm nhầm trên dòng dữ liệu hoặc mobile card.
- **Icon Trong Ô Bảng (Cell Icons)**: Các giá trị chính trong ô bảng nên render kèm icon cùng hệ icon hiện có khi reference/template đang dùng cách này. Không tự chọn icon khác hệ hoặc icon trang trí không có trong pattern.
- **Phân tách Icon Tài chính (Financial Icons differentiation)**: Các trường tài chính phải dùng icon/visual khác nhau đủ phân biệt theo semantic của template; không lặp một biểu tượng tiền tệ cho mọi trường nếu reference đã có pattern rõ hơn.


### Form & Detail Drawer Layout
- **Footer Drawer Chi Tiết**: Giữ layout footer, mật độ, vị trí nút và nhãn nút theo drawer/detail reference hiện có. Không tự đổi sang footer mới nếu template đã có pattern.
- **Form Drawer Footer**: Tái sử dụng footer/form action component của dự án khi có sẵn; chỉ thay icon/label theo nguồn spec/template.
- **Nút Chỉnh Sửa**: Dùng icon chỉnh sửa thống nhất với template/app hiện tại; không trộn nhiều icon khác nhau cho cùng một hành động.

### Thiết Kế Mô Hình Master-Detail (Cha - Con)
- **Bảng Con Nhúng (Embedded Sub-Grid)**: Nếu spec/database có quan hệ cha-con, dùng pattern bảng con/detail section đang có trong template/app để đảm bảo giao diện đồng bộ về viền, mật độ, scroll và hành động.
- **Ngăn Chặn Sai Lệch Dữ Liệu**: Khi mở form con từ chi tiết cha, bắt buộc điền sẵn ID của cha và khóa cứng (disabled) trường liên kết đó.
- **Drawers Xếp Chồng (Stacked Drawers)**: Khi có drawer/form con, dùng cơ chế nested drawer hiện có của dự án; không tự viết một stack mới nếu template đã có pattern.
- **Kế Thừa Trạng Thái Khóa (Cascading Locks)**: Khi dòng cha ở trạng thái đã phê duyệt/hoàn thành, user không đủ quyền phải bị khóa hành động sửa/xóa/báo cáo ở UI và service. Ngoại lệ quyền quản trị phải đi qua helper/permission source chung của dự án, không gọi trực tiếp điều kiện rời rạc tại từng component.
- **Không Bỏ Sót Bảng Con Nghiệp Vụ**: Nếu spec/database có quan hệ cha-con thật (ví dụ phiếu cha -> dòng chi tiết), detail drawer của bản ghi cha bắt buộc có section bảng con để end user xem và thao tác chi tiết liên quan. Form thêm/sửa bản ghi cha phải có section con phù hợp: nếu chưa thể thêm con trước khi có ID cha thì hiển thị hướng dẫn rõ và cho thêm con ngay sau khi lưu/mở detail, không được bỏ trống như chỉ có form cha.
- **Verify Master-Detail Theo Dữ Liệu Thật**: Khi sửa module cha-con phải test bằng record cha có ít nhất 2 dòng con trong database, đối chiếu tổng hợp/rollup ở cha và danh sách con trên FE. Không kết luận PASS chỉ vì CRUD cha chạy được.
- **Tạo bảng con trực tiếp khi tạo mới cha (Nested Creation Flow)**: Nếu nghiệp vụ yêu cầu tạo cha-con trong một form, form tạo mới cha phải cho phép nhập dòng con tạm thời và lưu tuần tự an toàn: insert cha -> lấy ID cha -> map FK cho dòng con -> insert dòng con.
- **Tự động điền dữ liệu liên kết (Lookup Autofill)**: Khi chọn bản ghi liên kết có cấu hình mặc định, form phải tự động tra cứu và điền các trường dẫn xuất theo spec; không bắt người dùng nhập tay dữ liệu có thể suy ra từ lookup đã chốt.


### Tối Ưu Hóa Trải Nghiệm Thao Tác & Quản Lý Tab (Interaction & Navigation Guard)
- **Triệt Tiêu Tab Mini Trùng Lặp (No Duplicate Mini-Tabs)**:
  - Các tính năng đã được quy hoạch ở phân hệ riêng (ví dụ: Báo cáo Thống kê Chuyến xe, Báo cáo Thống kê Lương đã có trong các module thống kê chuyên biệt) thì **tuyệt đối không được nhúng lại thành các tab phụ (mini-tabs) trong trang danh sách của phân hệ chính** (như Chuyến xe, Bảng lương).
  - Tránh trùng lặp chức năng, làm rối loạn luồng đi của người dùng và làm giảm hiệu năng load trang.
  - Nếu một phân hệ chỉ còn một tab danh sách duy nhất sau khi loại bỏ tab trùng lặp, phải loại bỏ hoàn toàn `TabGroup` để trực tiếp hiển thị bảng dữ liệu chính (tương tự trang Địa điểm).
- **Cơ Chế Xác Nhận Tuyệt Đối Trước Khi Thao Tác (Absolute Action Confirmation Gate)**:
  - Mọi nút hành động thay đổi dữ liệu hoặc thay đổi trạng thái trực tiếp trên giao diện (ví dụ: `Quản lý duyệt` trong bảng con, `Quản lý duyệt` trên toolbar chi tiết, hoặc các nút đổi trạng thái hàng loạt như "Kích hoạt", "Ngừng hoạt động") **bắt buộc phải đi kèm popup xác nhận (`confirm` dialog)**.
  - Tuyệt đối không bao giờ cho phép thực thi thay đổi ngay lập tức (instant mutation) chỉ bằng một click chuột mà không có bước xác nhận an toàn từ phía người dùng.
  - Sử dụng cơ chế confirm/dialog chuẩn của dự án để hiển thị nhãn nút và thông điệp tiếng Việt tường minh rõ ràng.
- **Cơ Chế Một Nút Thao Tác Trạng Thái Trên Toolbar Chi Tiết (Single Status Toolbar Button)**:
  - Trên thanh toolbar chi tiết (`DetailToolbar`) của các thực thể chính, nếu có các hành động thay đổi trạng thái tương đương nhau thì **chỉ hiển thị một nút hành động chính, linh hoạt và đầy đủ nhất**.
  - Với nghiệp vụ có hai trục trạng thái, không trộn action **duyệt** và action **thực hiện/báo cáo tiến độ** vào cùng một nút/cột. Ví dụ: phiếu cha duyệt qua action quản lý duyệt; dòng con báo cáo thực hiện qua popup riêng theo spec.
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
Sử dụng thư viện export hiện có trong dự án để định dạng chuyên nghiệp:
- **Kiểu Dữ Liệu Thực**: Các cột chứa số liệu (tiền, số lượng, số chuyến, chi phí...) bắt buộc xuất dưới dạng Number thực tế để có thể tính toán (`SUM`, `AVERAGE`), cấm xuất dạng String. Định dạng hiển thị số phải thống nhất với template.
- **Căn Lề (Alignment)**: Cột số căn lề phải (right), cột ngày tháng/trạng thái/biển số căn giữa (center), cột text thường căn lề trái (left).
- **Header & Layout**: Header, font, màu và dòng xen kẽ phải bám mẫu export hiện có; không tự chế style báo cáo mới nếu template đã có chuẩn.
- **Nút Xuất trên Toolbar**: Hiển thị theo pattern toolbar hiện có, thường là icon/tooltip gọn nếu template đang dùng cách đó.

### Xuất File PDF (`.pdf`)
Sử dụng thư viện PDF hiện có trong dự án để định dạng:
- **Hỗ Trợ Tiếng Việt (Unicode)**: Cấm dùng font mặc định của jsPDF (như Helvetica, Times) gây lỗi hiển thị ký tự lạ (mojibake).
- **Đăng Ký Font Chữ**: Phải đăng ký font TrueType hỗ trợ tiếng Việt theo cơ chế của thư viện đang dùng trước khi vẽ nội dung.
- **Áp Dụng Font**: Đảm bảo mọi text và bảng trong PDF dùng font đã đăng ký; verify bằng file PDF thật, không chỉ nhìn preview HTML.

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
- **Hai lớp trạng thái nghiệp vụ (không lẫn lộn)**:
  - **Duyệt**: quyết định phê duyệt/không duyệt theo cấp quản lý và permission matrix.
  - **Thực hiện**: tiến độ thực tế của dòng công việc/nghiệp vụ.
  - Nếu spec có cả hai trục, UI phải tách cột, nút, popup và điều kiện tính toán cho từng trục.
  - Cột tiến độ cha dạng `n/tổng` phải đếm theo trạng thái thực hiện nếu đó là ý nghĩa nghiệp vụ; không dùng số dòng đã duyệt để thay thế.
  - Action báo cáo thực hiện phải gắn với dòng/đối tượng thực hiện thật; action duyệt phải đi qua luồng duyệt đã chốt.
  - Total/rollup/report chỉ tính dòng đủ điều kiện theo spec, ví dụ đủ cả thực hiện và duyệt nếu nghiệp vụ yêu cầu.
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

### Tiêu chuẩn an toàn kiểm thử E2E Production (Safety Gates)
 
- Chạy qua Playwright test trên project production sau khi CI/CD đã tự động deploy xong; tuyệt đối không tự ý deploy thủ công từ terminal bằng lệnh `vercel --prod`.
- **Bảo toàn dữ liệu thực tế (Data Safety)**: Mọi ca kiểm thử làm thay đổi dữ liệu (mutating tests) bắt buộc phải chụp snapshot dữ liệu trước khi test và khôi phục (restore) nguyên trạng dữ liệu ngay khi test kết thúc (sử dụng hook `afterAll` hoặc `afterEach`).
- **Chống báo cáo PASS ảo (No Fake PASS)**: Yêu cầu ghi log đầy đủ ma trận độ bao phủ kiểm thử thực tế. Chỉ báo PASS khi tất cả các ca kiểm thử cốt lõi đã chạy thành công thực tế, không chấp nhận việc bỏ qua (skip) hoặc che giấu lỗi bằng assert mù.
- **Assert Database an toàn**: Chỉ assert trực tiếp trên database khi các biến môi trường cấu hình DB credentials (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) tồn tại hợp lệ. Nếu thiếu, ghi nhận trạng thái kiểm thử là `PARTIAL` (chỉ kiểm thử UI), cấm để bộ test bị crash.
