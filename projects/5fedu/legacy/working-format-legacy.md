# Working Format

## Mục tiêu

File này ghi khung format/cách làm mặc định để AI hiểu nên làm theo hướng 5fedu, kể cả khi dữ kiện cụ thể từng app chưa chốt.

Nguyên tắc: format có thể đã chốt, nhưng giá trị cụ thể vẫn phải hỏi nếu chưa có nguồn rõ.

Luu y legacy:

- Rule song uu tien doc o `00-index.md`, `03-ui-ux-and-delivery-standards.md`, `04-business-patterns.md`.
- File nay la legacy support/pointer, khong phai source of truth chinh cho rule moi.

## App và template

Format đã chốt:

- Ưu tiên dùng template `https://github.com/tahdieuphoi-ctrl/TAH_app`.
- Với dự án này: clone/adapt template là `DA_CHOT`; app name là `TAH APP`; scope là full app A-Z theo ảnh/spec đã gửi.
- Template source local nằm ở `P:\tah-app-5f\.agents\template-source\TAH_app`.
- Khi scaffold/adapt, đọc cấu trúc template trước rồi map spec vào domain/module/view có sẵn.
- Ưu tiên thêm hoặc adapt, hạn chế sửa/xóa module template.
- Nếu cần sửa/xóa lớn, báo lý do, rủi ro, file bị ảnh hưởng và xin chốt trước.

Không hỏi lại:

- Có clone template không.
- App name là gì.
- Làm module đầu tiên/phase đầu nào.

Thay vào đó:

- Tự đọc template/source.
- Map toàn bộ ảnh/spec đã có.
- Báo cáo chỗ nào giữ nguyên, chỗ nào cần adapt, chỗ nào cần hỏi thêm vì thiếu dữ kiện quyết định.

Nếu người dùng đưa ít instruction:

- Trước tiên tìm module tương tự trong template.
- Nếu module đã có, lập báo cáo adapt: giữ gì, thêm gì, sửa gì, vì sao.
- Nếu module chưa có, tạo module mới theo cấu trúc template gần nhất.
- **Rà soát Gaps (Khoảng trống giao diện)**: Khi chuẩn hóa một module theo mẫu chuẩn vàng (như Nhân viên), phải linh hoạt đối chiếu đa chiều cả spec/mã nguồn cũ của module đó lẫn template mẫu để nhận diện các thiếu sót (gaps) khi kết hợp cả hai. Không được áp dụng rập khuôn gây mất/thiếu tính năng nguyên bản hoặc bỏ sót các tương tác ẩn (như nút sửa dòng khi chọn, đổi trạng thái hàng loạt, các nút liên hệ động).

## Tech stack

Format đã chốt:

- Mặc định kiểm tra app theo hướng React Vite TypeScript.
- UI theo Tailwind CSS và component nội bộ `components/ui`.
- Server state theo TanStack Query, client state theo Zustand.
- Form theo React Hook Form + Zod.
- Backend theo Supabase PostgreSQL + Auth.
- Media theo Cloudinary nếu app có upload/ảnh.
- Với dự án này, stack ảnh 1 đã `DA_CHOT`; Google Sheets/AppSheet chỉ coi là khả năng thường gặp, không tự bật nếu spec không nói.

Chỉ hỏi thêm nếu phát hiện template/source khác ảnh/spec:

- Stack thật trong repo mâu thuẫn ảnh/spec.
- Có Google Sheets/AppSheet không.

## Credentials

Format đã chốt:

- Hỏi credentials ngay đầu phần backend/integration.
- Kiểm tra đúng format mà không in secret.
- Không lưu secret thật vào repo, plan, docs, log, hoặc câu trả lời.
- Chỉ ghi tên biến môi trường, nơi cấu hình, và cách verify không lộ giá trị.

Checklist credentials thường gặp:

- Supabase URL: dạng `https://<project-ref>.supabase.co`.
- Supabase anon key: JWT public anon key.
- Supabase service role key: chỉ dùng server/admin task, không đưa vào frontend.
- Database connection string/password: chỉ dùng migration hoặc thao tác DB trực tiếp.
- Cloudinary cloud name/upload preset/API credentials.
- Google Sheets/AppSheet credentials nếu dự án dùng.
- Vercel token/project/env nếu deploy hoặc Edge Function.

Với dự án này: Supabase thật là `DA_CHOT`; không mặc định mock backend. Nếu chưa có credential values thì ghi blocker đúng tên credential, không hỏi lại "có dùng Supabase thật không".

## Database

Format đã chốt:

- Tên bảng: viết tắt submenu + tên module.
- Dạng đúng: `hc_phieu_hanh_chinh`, `var_nhan_su`.
- Không dùng tên bảng kiểu route như `nhan-su`, không bắt đầu bằng số.
- `id` dùng `int8` nếu không có lý do được chốt khác.
- Cột liên kết dùng dạng `id_<doi_tuong>`, ví dụ `id_khach_hang`.
- `tg_tao` và `tg_cap_nhat` có ở mọi bảng.
- `id_nguoi_tao` có ở hầu hết bảng nghiệp vụ, trừ bảng hệ thống/master data khi được chốt.
- Bảng đầy đủ cần policy authenticated, index/search convention, trigger cập nhật `tg_cap_nhat`.

### Quy chế liên kết các bảng dính nhau (Table Relations Convention):
- Khi thay đổi cấu trúc hoặc hợp nhất bảng (ví dụ: gộp `vt_tai_xe` vào `var_nhan_vien`), bất kỳ cập nhật schema (migration) nào cũng phải thực hiện **trong cùng một transaction** (`begin; ... commit;`) để đảm bảo tính nguyên tử.
- Bắt buộc phải **quét sạch và chuyển đổi toàn bộ khóa ngoại cũ sang khóa ngoại mới** ở tất cả các bảng tham chiếu có liên quan.
- **Xử lý dữ liệu mồ côi (Orphaned Records)**: Khi thay đổi khóa ngoại liên kết, nếu bảng tham chiếu có dòng dữ liệu trỏ về ID không còn tồn tại, **cấm tự ý xóa bỏ dữ liệu** của người dùng. Thay vào đó, phải di chuyển các bản ghi mồ côi này vào bảng gốc mới bằng đúng ID cũ của chúng, điền các trường bắt buộc (`NOT NULL`) bằng giá trị mặc định hợp lệ (ví dụ: `ten_dang_nhap = 'username'`) trước khi kích hoạt ràng buộc khóa ngoại mới.
- Thiết lập các trigger tính toán tự động ở mức Database để đồng bộ hóa số liệu tức thời giữa các bảng dính nhau (như từ chuyến xe chi tiết -> chuyến xe -> bảng lương), ngăn ngừa trôi lệch số liệu.
- **Xử lý Thực thể Con Mồ Côi trên Giao diện Phân cấp (Orphaned Nodes rendering)**: Đối với các thực thể con (ví dụ: Chức vụ) được hiển thị trên giao diện nhóm theo thực thể cha (ví dụ: Phòng ban):
  1. Khi một thực thể cha bị xóa và cơ sở dữ liệu sử dụng ràng buộc `ON DELETE SET NULL`, các thực thể con sẽ bị mất liên kết (`phong_ban_id = null`).
  2. Cấm ẩn hoàn toàn (tàng hình) các thực thể con này trên giao diện quản lý. Bắt buộc thuật toán dựng cây (render) phải gom tất cả các thực thể mồ côi này vào một nhóm giả lập ở cuối danh sách (ví dụ: "Chức vụ chưa phân phòng ban") để người dùng có thể nhìn thấy, chỉnh sửa gán lại phòng ban hợp lệ hoặc thực hiện xóa thủ công.
  3. Bắt buộc đồng bộ logic lọc/hiển thị: Khi tạo mới hoặc chỉnh sửa thực thể con trên UI, phải đặt trường chọn thực thể cha là bắt buộc (`required`). Đồng thời, các dropdown chọn ở phân hệ khác (ví dụ: chọn Chức vụ khi thêm Nhân viên) phải đồng nhất, tránh hiện tượng bất nhất dữ liệu ("có trong DB, hiển thị ở form thêm nhân viên nhưng tàng hình ở trang quản lý chức vụ").


Dữ kiện cần hỏi theo app:

- Prefix submenu đầy đủ.
- SQL/table mẫu nếu có.
- "Hàm index" nghĩa chính xác là SQL index, search function/RPC, hay convention riêng.
- Bảng nào được miễn `id_nguoi_tao`.

## Frontend mapping

Format đã chốt:

```text
spec -> submenu/domain -> module -> view -> tab -> route -> source path -> database table -> service/handler
```

- Không code trước khi mapping đủ cho phần đang làm.
- Nếu ảnh/spec thiếu rõ, hỏi thêm.
- Search phải bao phủ trường trực tiếp và trường liên kết hiển thị.
- Desktop ưu tiên list view, mobile ưu tiên card view.
- Module nhiều tab phải giữ tab hiện tại trên router query `?tab=...`.

Ví dụ mapping và schema rút từ ảnh/spec ban đầu nằm ở `context/5fedu/08-source-examples.md`.

## Auth và permission

Format đã chốt:

- Login fake email: nhập `admin` thì dùng `admin@gmail.com`.
- Bỏ đăng ký mặc định.
- Account mặc định: `admin` / `5fedu.com`.
- Module nhân viên giữ trường chính, không kéo theo các trường rườm rà nếu app không cần.
- Quyền mặc định dùng `xem`, `them`, `sua`, `xoa`, `quan_tri`; `tat_ca` chỉ là UI helper, không lưu thành quyền riêng.
- Permission xử lý app-side mặc định, không tự đẩy sang Supabase RLS nếu chưa được yêu cầu.

### Tiêu chuẩn hoàn thiện Đăng ký / Đổi mật khẩu:
- **Đăng ký (Registration)**: Không có màn hình đăng ký công khai. Luồng đăng ký được thay thế hoàn toàn bằng luồng tạo tài khoản của quản trị viên (Admin tạo Nhân viên, hệ thống tự động gọi API `/api/employee-auth-sync` để đăng ký tài khoản Auth của Supabase với mật khẩu mặc định `123456`).
- **Đổi mật khẩu (Password Change)**: Phải sử dụng API thực tế (`supabase.auth.updateUser({ password })`). Tuyệt đối cấm sử dụng mã giả (mock) hoặc thông báo thành công ảo. Sau khi đổi mật khẩu thành công:
  - Hệ thống phải buộc đăng xuất hoặc làm mới phiên.
  - Phải kiểm thử thực tế (Smoke test) bằng cách đăng nhập lại bằng mật khẩu cũ (để chắc chắn mật khẩu cũ **bị từ chối**) và mật khẩu mới (để chắc chắn mật khẩu mới **được chấp nhận**).
  - Kết thúc kiểm thử phải khôi phục mật khẩu tài khoản về mặc định của hệ thống.


Dữ kiện cần hỏi theo module:

- Rule xem/thêm/sửa/xóa/quản trị cụ thể.
- Phạm vi xem theo cá nhân/phòng/nhóm/cấp bậc.
- Module có ngoại lệ so với default không.

## Delivery

Format đã chốt:

- Không để nút bấm không phản hồi hoặc flow giả vờ thành công.
- Nếu mock, ghi rõ mock ở đâu và điều kiện chuyển sang thật.
- Trước khi báo xong phải verify theo phần đã làm.
- Giai đoạn gần bàn giao phải lập plan tối ưu Supabase Egress + Vercel Edge Function và tra docs chính thức mới nhất.

## Khi instruction ít

AI được phép tự suy luận trong phạm vi format đã chốt:

- Suy luận vị trí cần đọc trong template.
- Đề xuất mapping spec -> module/view/table.
- Đề xuất schema draft theo format 5fedu.
- Đề xuất service/handler tách riêng để dễ debug.
- Tự lập thứ tự triển khai full app theo dependency, ví dụ template -> env -> schema -> auth -> services -> UI mapping -> QA, nhưng không hỏi người dùng chọn "phase đầu".

AI không được tự chốt:

- credentials thật
- schema/migration thật
- xóa/sửa lớn template
- permission rule cụ thể nếu người dùng chưa đưa
- bật RLS thay cho app-side permission
- dùng mock khi người dùng yêu cầu nối thật
- thu hẹp scope thành một module đầu tiên khi người dùng đã chốt làm full app A-Z

## Owner Feedback Gate & Platform Separation

### 1. Phân biệt Nền tảng Độc lập (.agents/ vs .codex/)
* **Antigravity (Agent)**: Sử dụng các quy tắc, log và mapping đặt tại `context/5fedu/`.
* **Codex (CLI)**: Sử dụng các cấu hình đặt tại `context/5fedu/`.
AI phải tự nhận diện môi trường runtime để truy cập đúng thư mục nền tảng, không hoán đổi hoặc sử dụng nhầm tệp của nhau.

### 2. Nguyên tắc Tiến hóa từ Feedback (Quy tắc Cứng)
* Các tệp `context/5fedu/10-owner-feedback-lessons.md` và `context/5fedu/12-owner-feedback-transport-ui.md` đóng vai trò là **lịch sử phản hồi thô** và **mapping đặc thù dự án** (link sheets, danh sách quan hệ...).
* Khi cac bug hoac yeu cau chinh sua trong file 10-12 da duoc giai quyet, quy luat rut ra phai duoc promote vao file song dung lop: `00-index.md`, `03-ui-ux-and-delivery-standards.md`, `04-business-patterns.md` hoac file canonical phu hop. Khong de rule quan trong chi nam o log tho, va khong promote nham len global core neu do chi la 5fedu-common.

### 3. Checklist Kiểm soát Phản hồi (Owner Feedback Gate)

Khi làm database/auth/nhân viên/giao diện, phải chạy checklist này trước khi code:

- `id` bảng app đã là `int8` auto increment chưa?
- Có dùng nhầm `uuid` cho `id` không?
- Foreign key tới bảng app đã là `int8` chưa?
- Bảng nhân viên có đang bị thêm trường linh tinh ngoài source không?
- Login có dùng đúng `ten_dang_nhap` thay vì `ma_nhan_vien` không?
- Thêm/sửa/xóa `ten_dang_nhap` đã đồng bộ Supabase Auth qua server/admin path chưa?
- Đã đọc `context/5fedu/10-owner-feedback-lessons.md` và `context/5fedu/12-owner-feedback-transport-ui.md` để lấy mapping và log thô chưa?

Nếu câu trả lời nào là chưa, dừng triển khai và sửa mapping/schema/plan trước.

## Quy Tắc Thiết Kế Giao Diện (UI) & Nghiệp Vụ Vận Tải (Quy Tắc Cứng)

1. **Thứ Tự Danh Mục Trên Trang Chủ**:
   - Menu điều hướng phải sắp xếp theo đúng thứ tự:
     1. `Quản lý vận tải`
     2. `Hệ thống`
     3. `Thông tin bản quyền`

2. **Thiết Kế Form & Detail Drawer**:
   - Tất cả các module phải thiết kế form nhập liệu và màn chi tiết (Detail Drawer) theo chuẩn của template, không sử dụng CRUD generic thô.
   - **Footer Drawer Chi tiết**: Footer phải sử dụng layout, vị trí nút, kích thước nút và nhãn nút theo reference drawer hiện có của template.
   - **Form Drawer Footer**: Các form drawer (Thêm/Sửa) phải tái sử dụng footer/action primitive chuẩn của dự án thay vì code tay thủ công.
   - **Icon Hiển Thị**: Các trường thông tin chi tiết trong Drawer cần có icon Lucide tương ứng đứng trước nhãn (label) để tăng tính thẩm mỹ và dễ đọc.
   - **Icon Trong Ô Bảng (Cell Icons)**: Các giá trị dữ liệu chính trong ô của bảng phải hiển thị kèm icon theo helper/pattern hiện có nếu template đang dùng cách này.
   - **Nút Chỉnh Sửa**: Sử dụng đồng bộ icon chỉnh sửa theo template/app hiện tại cho cùng một hành động, không trộn nhiều icon khác nhau.

3. **Cơ Chế Tính Toán Tự Động**:
   - Các trường tổng hợp (như `so_chuyen`, `tong_tien_luong`, `tong_phi`, `tong_luong_chuyen`, `tong_chi_phi_chuyen`, `tong_con_lai`) bắt buộc phải tính tự động từ bảng chi tiết hoặc dữ liệu chuyến xe thực tế.
   - Tuyệt đối cấm cho phép người dùng nhập tay các giá trị này.

4. **Trường Liên Kết Lớn (Relations)**:
   - Các trường nhập liệu liên quan đến đối tượng lớn (như tài xế, địa điểm, xe, chuyến xe) bắt buộc phải sử dụng `Combobox` hoặc `AsyncCombobox` hỗ trợ tìm kiếm, cấm sử dụng thẻ `<select>` thô.
   - Thiết lập hỗ trợ tài xế ngoài công ty: Thông tin tài xế phải cho phép nhập độc lập, liên kết `id_nhan_vien` (nhân viên nội bộ) là tùy chọn (optional).

5. **Phân Tách Action & Form**:
   - Các hành động nghiệp vụ (như `Duyệt` chuyến đi/bảng lương, `In` bảng lương, `Xuất` báo cáo) phải tách biệt hoàn toàn khỏi form nhập liệu. Nút duyệt không được đặt bên trong form.

6. **Hiển Thị Lịch Sử Liên Quan (Detail History)**:
   - Màn hình chi tiết của các thực thể chính phải render danh sách lịch sử tương ứng:
     - **Chi tiết tài xế**: Hiển thị lịch sử chuyến xe và lịch sử lương.
     - **Chi tiết địa điểm**: Hiển thị danh sách chuyến xe/chuyến chi tiết liên quan.
     - **Chi tiết xe**: Hiển thị lịch sử chuyến xe đã chạy.

7. **Trình Bày Bảng & Phân Trang**:
   - **Đồng Bộ Chân Trang Phân Trang**: Tất cả các bảng dữ liệu, kể cả bảng báo cáo/thống kê tùy chỉnh, phải sử dụng chân trang phân trang chuẩn của template. Không để bảng trần không có footer phân trang.
   - **Tiếng Việt Hóa Header**: Tên các cột trong bảng khi render động phải được ánh xạ qua bộ từ điển dịch `HEADER_LABELS` để hiển thị tiếng Việt có dấu chuẩn hóa, không hiển thị key DB thô.
   - **Nút Xuất (Export)**: Toolbar dùng Download icon-only kèm tooltip nếu template đang theo pattern đó.
   - **Excel/PDF export**: Rule sống nằm ở `03-ui-ux-and-delivery-standards.md`. Tóm tắt bắt buộc: số liệu xuất dạng Number thật, header/style theo thương hiệu, PDF dùng font tiếng Việt đã đăng ký, tiêu đề có ĐVT khi cần, tên file tiếng Việt rõ nghĩa, và không tự chế layout báo cáo nếu template đã có chuẩn.

8. **Quản lý múi giờ và đồng bộ Drawer (UI/UX)**:
   - **Múi giờ Local khi lọc báo cáo**: Không sử dụng `.toISOString().split('T')[0]` để định dạng ngày lọc ở client vì nó gây trôi ngày theo UTC (UTC+7 bị lùi 7 tiếng sẽ trôi về ngày hôm trước). Bắt buộc trích xuất trực tiếp các thành phần ngày cục bộ (`d.getFullYear()`, `d.getMonth() + 1`, `d.getDate()`).
   - **Cơ chế tải file Blob URL trên Chrome**: Chrome sandbox chặn các lượt tải từ Data URI trực tiếp. Bắt buộc giải mã Base64 sang Blob và tạo Object URL (`URL.createObjectURL(blob)`), đồng thời tăng thời gian chờ thu hồi `URL.revokeObjectURL` lên tối thiểu `30 giây` để trình duyệt hoàn tất ghi file xuống ổ đĩa.
   - **Loại trừ Drawer lồng nhau**: Để tránh Form sửa bị che khuất bên dưới Drawer xem chi tiết, phải áp dụng cơ chế loại trừ (Mutual Exclusion): khi Form sửa được bật, bắt buộc unmount/đóng Drawer xem chi tiết tương ứng.
   - **Kiểm soát an toàn kiểu dữ liệu (TypeScript Safe-guards)**: Khi thao tác với các đối tượng có thuộc tính động hoặc kiểu chưa xác định (như `TransportRow` có index signature là `unknown`, dữ liệu từ bảng cấu hình động `var_cong_ty`), bắt buộc ép kiểu sang `any` trước khi truyền vào các constructor nghiêm ngặt (như `new Date(value as any)`) hoặc trước khi truy cập thuộc tính động. Luôn kiểm tra tính khả dụng (`if (row)`) trước khi truy xuất `.id` của các state drawer lồng nhau để loại bỏ triệt để lỗi sập trang (white screen) ở runtime.

9. **Quy chuẩn in ấn Phiếu lương & Chứng từ (Print Standards)**:
   - In chứng từ dùng cấu trúc HTML/CSS in A4 sạch, ẩn navigation/action thừa, giữ layout tinh gọn theo template.
   - Bảng kê tài chính phải rõ nguồn số liệu, khoản khấu trừ hiển thị đúng dấu/màu cảnh báo, và số tiền thực nhận có phần đọc bằng chữ tiếng Việt khi chứng từ yêu cầu.


## Thiết kế các Module Dùng chung dữ liệu (Shared Data Modules Pattern)

Đối với các module nghiệp vụ có sự chồng chéo hoặc liên quan chặt chẽ đến nhau về mặt thông tin (ví dụ: Nhân sự & Tài xế, Khách hàng & Nhà cung cấp...):

1. **Dữ liệu (Database - Single Source of Truth)**:
   - Thiết kế một bảng dữ liệu gốc duy nhất (ví dụ: `var_nhan_vien`) để lưu trữ tất cả thông tin chung.
   - Sử dụng các cờ boolean (ví dụ: `la_tai_xe: boolean`) để phân loại đối tượng thay vì tách ra thành các bảng độc lập. Cách này giúp tránh trùng lặp dữ liệu và đồng bộ hóa phức tạp.

2. **Giao diện (UI - Dedicated Modules)**:
   - Vẫn duy trì các module/màn hình quản lý riêng biệt cho từng vai trò nghiệp vụ (ví dụ: có cả trang Nhân viên và trang Tài xế).
   - Module chuyên sâu (ví dụ: Tài xế) sẽ tự động lọc dữ liệu từ bảng gốc theo cờ phân loại (`la_tai_xe === true`).
   - Module chuyên sâu này sẽ chứa các tab/mục hiển thị chi tiết nghiệp vụ sâu hơn mà module gốc không cần hiển thị (ví dụ: Tài xế cần hiển thị *Lịch sử chuyến xe*, *Lịch sử lương*; trong khi Nhân sự nói chung thì không cần).

3. **Cơ chế liên kết điều hướng (Navigation Link)**:
   - Trong form nhập liệu của module gốc (ví dụ: form Nhân sự), khi tích chọn cờ vai trò (ví dụ: `la_tai_xe`), cần hiển thị ngay một link điều hướng nhanh (ví dụ: `Xem thông tin tại Module Tài xế →`) để hướng dẫn người dùng sang trang chuyên môn để quản lý sâu hơn.

4. **Hành động Xóa (Soft Delete Role)**:
   - Khi xóa một đối tượng ở module chuyên sâu (ví dụ: xóa Tài xế khỏi danh sách tài xế), hành vi hệ thống là **chuyển cờ phân loại về `false`** (ví dụ: `la_tai_xe: false`), chứ không được xóa vật lý bản ghi trong bảng gốc (`var_nhan_vien`) để bảo toàn thông tin hồ sơ nhân viên gốc.

5. **Cấu hình Dropdown liên kết (Dropdown-as-a-Service Pattern)**:
   - Các trường khóa ngoại trỏ đến bảng dùng chung (ví dụ: `id_tai_xe` trên chuyến xe, bảng lương) phải sử dụng combobox/select lọc động dữ liệu đã lọc theo vai trò (`la_tai_xe = true`) ở tầng Service/API trước khi nạp vào UI.
   - Nhãn hiển thị của các khóa ngoại này phải được phân giải dựa trên thông tin đầy đủ từ bảng dùng chung để đảm bảo tính nhất quán (ví dụ: hiển thị `ho_va_ten` từ `var_nhan_vien` thay vì chỉ hiển thị ID thô).

6. **Đồng bộ Auth và Bảo mật Đổi mật khẩu**:
   - Giao diện đổi mật khẩu (Change Password) trên trang cá nhân phải hoạt động trực tiếp thông qua API `supabase.auth.updateUser` thay vì hiển thị "Coming Soon".
   - Luồng đồng bộ hóa tài khoản admin (`api/employee-auth-sync`) cần được bọc lớp fallback tự động catch lỗi cảnh báo nhưng cho phép lưu dữ liệu gốc thành công nếu môi trường không thiết lập Service Role Key.

## Bài học Kinh nghiệm & Nguyên tắc Thiết kế Hiển thị (UI/UX Lessons Learned)

1. **Khắc phục sự bất nhất giữa Mock Data và Real Database**:
   - Dữ liệu thực tế thường phát sinh các ô liên kết bị trống (`null` hoặc `undefined`) do import hoặc thao tác cũ.
   - Luôn thiết kế giải pháp hiển thị và gom nhóm dự phòng (như nhóm giả lập "Khác" cho các dòng mồ côi) để tránh hiện tượng ẩn/tàng hình dữ liệu trên UI.

2. **Đồng bộ hóa thuộc tính thực thể liên kết ở tầng Service**:
   - Khi giao diện cần sắp xếp hoặc nhóm dữ liệu con dựa theo thứ tự của thực thể cha (ví dụ: sắp xếp vị trí chức vụ theo phòng ban), tầng Service/API phải chủ động nạp thuộc tính thứ tự của cha (ví dụ: `thu_tu` của phòng ban) và map vào dữ liệu trả về cho Client.

3. **Nguyên tắc Sắp xếp Nhóm Giả lập/Dự phòng (Fallback Groups)**:
   - Các nhóm ảo/giả lập gom dữ liệu mồ côi (như nhóm "Khác") bắt buộc phải được quy định trọng số lớn nhất trong hàm so sánh (`sort`), đảm bảo chúng luôn được hiển thị ở vị trí cuối cùng dưới cùng của danh sách.

4. **Mật khẩu mặc định — QUY TẮC CỨNG (Credentials Convention)**:
   - **Tài khoản admin**: Mật khẩu luôn là `5fedu.com`. Tuyệt đối KHÔNG được thay đổi, không dùng `123456` hay bất kỳ giá trị nào khác cho admin.
   - **Tài khoản người dùng/nhân viên thường**: Mật khẩu mặc định khi tạo mới là `123456`.
   - Khi viết script tạo tài khoản, test login, seed user hoặc browser subagent test: BẮT BUỘC phải dùng đúng mật khẩu theo quy tắc trên. Sai mật khẩu → lock out hệ thống.
   - Khi test tính năng "Đổi mật khẩu" trên giao diện Profile: PHẢI đổi lại về đúng mật khẩu gốc sau khi test xong, hoặc dùng tài khoản test riêng — KHÔNG BAO GIỜ test đổi mật khẩu trên tài khoản admin chính.
   - **Bài học**: Conversation trước đã vô tình làm mất password admin do test không đúng quy trình, gây lock out toàn bộ hệ thống.

 5. **Xuất file trên trình duyệt — bài học download & font preload**:
   - Không xuất file theo cách làm mất tên file, không persist vào Downloads, hoặc bị service worker/browser chặn. Luôn verify bằng file tải thật trên trình duyệt mục tiêu.
   - Ưu tiên một helper download thống nhất của dự án cho PDF/XLSX/CSV thay vì mỗi module tự dùng API download khác nhau.
   - PDF tiếng Việt phải preload/register font theo một cơ chế dùng chung, có cache promise để tránh race condition khi nhiều tác vụ export chạy gần nhau.
   - Bài học kỹ thuật chi tiết như data URI, blob, `MouseEvent`, `showSaveFilePicker`, Workbox denylist là evidence/reference; chỉ áp dụng nguyên văn khi dự án hiện tại dùng cùng stack và tái hiện cùng lỗi.

 6. **Popup Xác nhận Bắt buộc cho hành động con/nested nguy hiểm (Action Confirmation)**:
   - Mọi nút hành động trên bảng con nhúng hoặc nested detail drawer (như Sửa, Xóa, Đổi trạng thái, Báo cáo tiến độ) đều bắt buộc phải hiển thị hộp thoại xác nhận theo cơ chế chuẩn của dự án trước khi thực hiện.
   - Không chấp nhận ngoại lệ "Form đã là bước đệm đủ". Người dùng trên mobile dễ bấm nhầm nút nhỏ, popup xác nhận là lớp bảo vệ bắt buộc.
   - **Bài học**: Nút sửa dòng con và nút thay đổi trạng thái dòng con trong drawer từng bị bỏ sót không có popup xác nhận.

 7. **PWA Service Worker ảnh hưởng download filename (PWA Download Exclusion — QUY TẮC CỨNG)**:
   - Khi ứng dụng sử dụng VitePWA + Workbox, Service Worker có thể intercept các blob download request làm mất tên file hoặc gây lỗi. Bắt buộc phải cấu hình loại trừ (`navigateFallbackDenylist`) trong Workbox config đối với các đường dẫn download, preview.
   - Đồng thời, khi implement `saveBlobAs`, ưu tiên sử dụng `showSaveFilePicker` (File System Access API) trên các trình duyệt Chromium hiện đại để có trải nghiệm download tin cậy nhất và luôn giữ đúng tên file.

 8. **Mobile Card Responsive phải tham chiếu template**:
   - Mobile card của mọi module phải tuân thủ cấu trúc mobile card hiện có trong template/app.
   - Khi làm mobile card cho module mới, phải đối chiếu reference implementation gần nhất theo cùng surface/hành vi; chỉ dùng chi tiết cấu trúc như `leading`, `titleRow`, `subheader`, `metaLine` nếu template hiện tại đang dùng pattern đó.

 9. **Đồng bộ Format giữa các Trang In (Print Format Parity — QUY TẮC CỨNG)**:
   - Tất cả các trang preview/in (như In bảng lương, In hồ sơ nhân viên) phải đồng nhất về cấu trúc layout và thiết kế tinh gọn theo quy chuẩn A4.
   - Sử dụng chung cấu trúc Header (logo công ty bên trái, tên địa chỉ công ty bên cạnh, không để thông tin linh tinh hoặc mã phiếu to bản bên phải), style bảng dữ liệu header xanh dương (`bg-primary text-white`), và ẩn hoàn toàn các thành phần chữ ký ký duyệt ở cuối trang.
   - Trực tiếp lấy thông tin công ty từ source chung của dự án thay vì truyền prop thủ công từ trang cha.

 10. **Deploy Production chỉ dùng Git Push (Deploy Governance — QUY TẮC CỨNG)**:
   - Project `tah-app.vercel.app` đã được nối với GitHub repo qua Vercel Dashboard (auto-deploy on push). **KHÔNG ĐƯỢC** dùng `npx vercel --prod` hoặc `node scripts/deploy-no-git.js` để deploy thủ công — sẽ tạo ra project Vercel mới hoặc link nhầm project, gây deploy lên domain sai.
   - **Quy trình đúng duy nhất**: `git push` → Vercel tự detect → build → deploy lên `tah-app.vercel.app`.
   - **Bài học**: Đã từng deploy nhầm sang `tahdieuphoi.vercel.app` (project mới do Vercel CLI tự tạo) thay vì `tah-app.vercel.app`, khiến bản mới không lên production thật.

 11. **Thông tin công ty phải có Single Source of Truth**:
   - Mọi component và utility export/preview cần thông tin công ty (logo, tên, địa chỉ, SĐT, email) phải đọc từ nguồn state/service chung của dự án.
   - Không tự fetch thông tin công ty riêng lẻ trong từng page/component nếu template đã có source chung. Object fetch riêng thường thiếu trường, gây layout không đồng nhất giữa preview và export.
   - Reference implementation cụ thể của dự án hiện tại chỉ dùng làm evidence; không hard-code tên store/component nếu template đổi.
  12. **Tránh Stale Closure trong Callback Hộp thoại Xác nhận (Stale Closure Prevention — QUY TẮC CỨNG)**:
    - Khi tích hợp các hộp thoại xác nhận có form/input động (như dialog Báo cáo/Đổi trạng thái) bằng hàm `confirm()` từ Zustand, tuyệt đối **KHÔNG** truyền các biến closure cục bộ (`let selectedStatus`, `onStatusChange`) trực tiếp vào các prop callback của element hoặc callback `onConfirm`.
    - **Lý do**: Khi component re-render, các hàm callback này vẫn giữ tham chiếu cũ (stale closure) từ render trước đó, làm lệch dữ liệu gửi lên hoặc khiến Promise không được resolve/reject dẫn đến kẹt/loading không đóng được modal.
    - **Giải pháp chuẩn**:
      1. Lưu trữ hàm callback bằng `useRef` (vd: `const onStatusChangeRef = useRef(onStatusChange); useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange]);`).
      2. Đóng gói dữ liệu thay đổi vào một object wrapper ổn định (vd: `const currentValues = { status: initialStatus };` và cập nhật thông qua `onChange={(v) => { currentValues.status = v; }}`).
      3. Gọi qua ref trong `onConfirm` (vd: `onConfirm: async () => { if (onStatusChangeRef.current) await onStatusChangeRef.current(currentValues.status); }`).
    - **Bài học**: Nút Báo cáo và Đổi trạng thái trên toolbar từng sử dụng các biến cục bộ thuần và hàm trực tiếp gây kẹt cứng hộp thoại khi cập nhật.
