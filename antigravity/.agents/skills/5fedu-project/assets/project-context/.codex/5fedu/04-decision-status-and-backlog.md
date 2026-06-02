# Pillar 4: Decision Status & Backlog

Tài liệu này lưu trữ ma trận trạng thái chốt duyệt tính năng, danh sách câu hỏi mở đang đợi làm rõ từ phía chủ dự án (owner), và nhật ký phản hồi thô (raw feedback log).

---

## 1. Quy Ước Trạng Thái
- **`DA_CHOT`**: Đã được người dùng hoặc owner xác nhận rõ, được phép dùng làm cơ sở triển khai.
- **`CHUA_CHOT`**: Mới là ghi nhận ban đầu hoặc mặc định theo 5fedu, chưa được phép triển khai phần rủi ro nếu chưa hỏi lại.
- **`CAN_HOI_THEM`**: Thiếu dữ kiện, ảnh/spec chưa đủ rõ, có nhiều cách hiểu, hoặc cần owner xác nhận thêm.

*Chỉ chuyển sang `DA_CHOT` khi có xác nhận chính thức từ người dùng qua chat, tài liệu spec, Google Sheets hoặc file ảnh đã được làm rõ.*

---

## 2. Ma Trận Quyết Định Hiện Tại (Decision Matrix)

| Mục | Trạng thái | Nguồn/xác nhận | Ghi chú |
| --- | --- | --- | --- |
| Dùng context 5fedu theo từng dự án | DA_CHOT | User prompt | Tránh làm phình global context |
| Repo `P:\tah-app-5f` là dự án 5fedu | DA_CHOT | User prompt | Đã setup project-local `AGENTS.md` |
| `AGENTS.md` là con trỏ nhẹ | DA_CHOT | User prompt | Đọc theo loading policy tinh gọn |
| Clone/adapt template `TAH_app` | DA_CHOT | User prompt | Dùng làm nền giao diện |
| Tech stack & backend Supabase thật | DA_CHOT | User cung cấp keys | Không dùng mock mặc định |
| Quy chuẩn khóa chính `id int8` auto-increment | DA_CHOT | Owner feedback | Identity/bigserial; cấm uuid |
| Bảng nhân viên tối giản | DA_CHOT | Owner feedback | Bỏ các trường HR không cần thiết |
| Đăng nhập bằng `ten_dang_nhap` | DA_CHOT | Owner feedback | Không dùng mã nhân viên |
| Đồng bộ user Supabase Auth | DA_CHOT | Owner feedback | fake email `<ten_dang_nhap>@gmail.com` mật khẩu `123456` |
| Mềm dẻo khi lỗi Auth Sync | DA_CHOT | User feedback | API lỗi vẫn cho phép CRUD DB |
| Giao diện desktop list, mobile card | DA_CHOT | Spec & template | Phải có TablePaginationFooter |
| Lọc theo URL query (Deep Linking) | DA_CHOT | User feedback | Tự động điền bộ lọc từ URL |
| Khóa kế thừa cha-con (Cascading Locks) | DA_CHOT | User feedback | Cha duyệt thì con read-only |
| Xuất Excel kiểu số `'n'` và PDF Unicode | DA_CHOT | User feedback | Bắt buộc đối với tính năng xuất báo cáo |
| Tài xế ngoài công ty | DA_CHOT | Owner feedback | `id_nhan_vien` là tùy chọn (optional) |
| Bảng lương tự tính lương chuyến | DA_CHOT | Owner feedback | Cấm nhập tay tổng lương |
| Chuyến xe cha tự tính tổng chuyến/tiền | DA_CHOT | Owner feedback | Tự tính dựa trên child grid con |
| Thống kê chuyến đi dashboard | DA_CHOT | Owner feedback | Lọc động theo nhiều tiêu chí |
| Cloudinary credentials | CHUA_CHOT | Chưa cung cấp | Cần cho upload media |
| Google Sheets/AppSheet credentials | CAN_HOI_THEM | User prompt | Chỉ hỏi nếu spec yêu cầu kết nối trực tiếp |

---

## 3. Danh Sách Câu Hỏi Mở (Open Questions)

### Chỉ hỏi khi chuẩn bị tích hợp thật:
- **Tác vụ Admin Auth**: Có cần service role key để quản trị tài khoản không? (Cung cấp qua env, không paste vào chat/docs).
- **Hàm index database**: Ý nghĩa chính xác là tạo SQL index, search function/RPC, hay convention nào khác? Có SQL mẫu không?
- **Quyền đặc thù**: Module nào có permission exception so với default `xem/them/sua/xoa/quan_tri`?

---

## 4. Nhật Ký Tiến Hóa Quy Tắc (Structured Rule Evolution Registry)

Khi có phản hồi mới từ owner hoặc thay đổi nghiệp vụ phát sinh, Agent **tuyệt đối không được ghi nhận dưới dạng ngôn ngữ thô hay ghi chú thiếu tổ chức**. Mọi tiến hóa tri thức bắt buộc phải được mã hóa thành các quy tắc cấu trúc chuẩn theo mẫu dưới đây và được ánh xạ (codified) trực tiếp vào các tệp tin Trụ cột tương ứng (Pillar 1, 2, 3) ngay lập tức.

---

### Bảng Đăng Ký Tiến Hóa Quy Tắc (Evolution Rule Registry)

#### EVO-20260531-01: Chuẩn Hóa Schema & Đồng Bộ Auth Căn Bản
*   **Mô tả Quy tắc (Rule Spec)**: 
    1. Khóa chính của tất cả các bảng nghiệp vụ bắt buộc phải dùng kiểu dữ liệu `int8` (bigint) auto-increment, nghiêm cấm dùng `uuid` hoặc `text`.
    2. Tài khoản đăng nhập sử dụng cột `ten_dang_nhap` của bảng nhân viên, bỏ qua mã nhân viên HR.
    3. Khi tạo/sửa nhân viên, hệ thống tự động đồng bộ tài khoản auth với email giả dạng `<ten_dang_nhap>@gmail.com` và mật khẩu mặc định `123456`.
*   **Phạm vi ảnh hưởng (Target Area)**: Thư mục `supabase/migrations/`, `features/he-thong/nhan-vien/`
*   **Đối chiếu Trụ cột (Pillar Map)**: [02-database-and-auth-rules.md#1-thiet-ke-database--schema-quy-tac-cung](file:///P:/agent-rules/antigravity/.agents/skills/5fedu-project/assets/project-context/.agents/5fedu/02-database-and-auth-rules.md#L7-L33)
*   **Trạng thái áp dụng (Enforcement)**: `DA_AP_DUNG`

---

#### EVO-20260601-01: Đồng Bộ UI Drawer & Gộp Bảng Danh Mục
*   **Mô tả Quy tắc (Rule Spec)**:
    1. Chân trang Drawer chi tiết bắt buộc dùng split-layout compact: nút Đóng (ghost/left), nút Sửa và nút Xóa (primary/destructive/right).
    2. Gộp dữ liệu Nhân sự và Tài xế vào bảng `var_nhan_vien` chung, phân loại bằng cờ mềm `la_tai_xe` để tối giản bảng danh mục.
    3. Các cột trong bảng phải hiển thị cell icon chuẩn, các trường khóa ngoại dùng Combobox tìm kiếm động, và file xuất Excel/PDF phải hỗ trợ Unicode cùng định dạng số thực.
*   **Phạm vi ảnh hưởng (Target Area)**: `components/ui/`, `features/he-thong/`, các modules xuất báo cáo.
*   **Đối chiếu Trụ cột (Pillar Map)**: [03-ui-ux-and-delivery-standards.md#1-quy-chuan-thiet-ke-giao-dien-uiux-parity](file:///P:/agent-rules/antigravity/.agents/skills/5fedu-project/assets/project-context/.agents/5fedu/03-ui-ux-and-delivery-standards.md#L7-L20)
*   **Trạng thái áp dụng (Enforcement)**: `DA_AP_DUNG`

---

#### EVO-20260602-01: Khóa Kế Thừa & Deep Linking Query
*   **Mô tả Quy tắc (Rule Spec)**:
    1. Áp dụng quy tắc Khóa kế thừa (Cascading Lock): Khi dòng dữ liệu cha ở trạng thái phê duyệt hoặc hoàn thành, toàn bộ các bản ghi con liên kết phải tự động bị khóa (read-only) trên cả bảng con nhúng và drawer chi tiết con.
    2. Hỗ trợ kích hoạt bộ lọc và chuyển hướng màn hình thông qua việc đọc các tham số query URL (ví dụ: `?tab=danh-sach&id_tai_xe=1`).
*   **Phạm vi ảnh hưởng (Target Area)**: `features/quan-ly-van-tai/chuyen-xe/`
*   **Đối chiếu Trụ cột (Pillar Map)**: [03-ui-ux-and-delivery-standards.md#thiet-ke-mo-hinh-master-detail-cha---con](file:///P:/agent-rules/antigravity/.agents/skills/5fedu-project/assets/project-context/.agents/5fedu/03-ui-ux-and-delivery-standards.md#L21-L26)
*   **Trạng thái áp dụng (Enforcement)**: `DA_AP_DUNG`

---

#### EVO-20260602-02: Bảo Mật RLS, Phân Quyền Khắt Khe & Quy Trình Kiểm Thử E2E Chéo Vai Trò
*   **Mô tả Quy tắc (Rule Spec)**:
    1. Cấm granular RLS trên database của Supabase để tránh việc AI bị "mù thông tin", thực hiện lọc phân quyền hoàn toàn ở phía client/app-side.
    2. Bổ sung quyền `kiem_tra` vào danh sách quyền DB hợp lệ (cột `quyen` trong bảng `var_phan_quyen`).
    3. Quyền "Tất cả" chỉ tồn tại dưới dạng checkbox giao diện, khi lưu xuống database phải tách thành các dòng quyền riêng lẻ.
    4. Áp dụng quy trình kiểm thử E2E chéo vai trò: Dùng tối thiểu 3 tài khoản cấp bậc khác nhau đăng nhập thực tế để kiểm tra ẩn/hiện UI, thử hành động trái phép, và kiểm tra quyền được áp dụng lập tức.
    5. Thiết lập quy tắc Zero Gaps UI Parity (bắt buộc phải đủ toolbar, pagination, card, drawer giống Nhân viên) và cấm viết code generic gộp các phân hệ khác nhau.
*   **Phạm vi ảnh hưởng (Target Area)**: Quy trình vận hành và toàn bộ hệ thống phân quyền, module.
*   **Đối chiếu Trụ cột (Pillar Map)**: [00-index.md#1-hop-dong-thuc-thi-chat-che-anti-flaw-contract](file:///P:/agent-rules/antigravity/.agents/skills/5fedu-project/assets/project-context/.agents/5fedu/00-index.md#L43-L53), [02-database-and-auth-rules.md#4-phan-quyen-ung-dung-permissions-model](file:///P:/agent-rules/antigravity/.agents/skills/5fedu-project/assets/project-context/.agents/5fedu/02-database-and-auth-rules.md#L80-L125), [03-ui-ux-and-delivery-standards.md#nguyen-tac-tham-chieu-template-khong-de-khoang-trong-ui-parity---zero-gaps](file:///P:/agent-rules/antigravity/.agents/skills/5fedu-project/assets/project-context/.agents/5fedu/03-ui-ux-and-delivery-standards.md#L7-L22)
*   **Trạng thái áp dụng (Enforcement)**: `DA_AP_DUNG`

---

#### EVO-20260602-03: Audit Toàn Diện — 9 Lỗ Hổng Phòng Vệ CRUD & Schema
*   **Mô tả Quy tắc (Rule Spec)**:
    1. **Data Sanitization Before Write** (Global): Tầng repository bắt buộc chuyển `""` → `null` cho cột `id_*` và numeric trước khi gửi PostgreSQL.
    2. **Self-Contained Migration** (Global): File migration phải chứa đầy đủ CREATE TABLE + ENABLE RLS + CREATE POLICY + CREATE TRIGGER.
    3. **Error Message Localization** (Global): Lỗi database phải được dịch tiếng Việt trước khi hiển thị toast.
    4. **Schema Verification Before Development** (Global): Bắt buộc truy vấn `information_schema.columns` trước khi code.
    5. **RLS Checklist** (5fedu): Thêm truy vấn `pg_policies` bắt buộc sau migration.
    6. **Trigger Verification** (5fedu): Thêm kiểm tra trigger `tg_cap_nhat` tồn tại sau migration.
    7. **FK Type Guard** (5fedu): FK nullable trên form mặc định `null`, không phải `''`.
    8. **Pillar 5 Schema Sync** (5fedu): Cập nhật spec `vt_tai_xe` → đã gộp vào `var_nhan_vien`, cập nhật cột `vt_luong`.
    9. **Schema Drift Check** (5fedu): Thêm quy trình đối chiếu schema production trước khi phát triển.
    10. **Cấm tạo Vercel site/deployment mới** (Global): Siết chặt quy tắc chỉ test trên domain production chính thức.
*   **Phạm vi ảnh hưởng (Target Area)**: `global-rules.md`, `02-database-and-auth-rules.md`, `03-ui-ux-and-delivery-standards.md`, `05-source-specs-and-coverage.md`
*   **Đối chiếu Trụ cột (Pillar Map)**: Toàn bộ 5 Pillars + Global Rules
*   **Trạng thái áp dụng (Enforcement)**: `DA_AP_DUNG`

---

#### EVO-20260602-04: Phân tách Icon Tài chính Bảng lương
*   **Mô tả Quy tắc (Rule Spec)**:
    1. Tránh lặp lại biểu tượng `$` gây đơn điệu (Visual Noise) và giảm hiệu quả nhận diện trường trong các form chi tiết tài chính.
    2. Sử dụng các biểu tượng chuyên biệt cho từng trường:
       - Lương chuyến: `Banknote` (hoặc `Coins`)
       - Chi phí chuyến: `Receipt`
       - Trừ tiền khác: `MinusCircle`
       - Chi phí khác: `CreditCard`
       - Tổng còn lại: `Wallet`
*   **Phạm vi ảnh hưởng (Target Area)**: `features/quan-ly-van-tai/shared/TransportModulePage.tsx`, `.agents/5fedu/03-ui-ux-and-delivery-standards.md`
*   **Đối chiếu Trụ cột (Pillar Map)**: [03-ui-ux-and-delivery-standards.md#1-quy-chuan-thiet-ke-giao-dien-uiux-parity](file:///p:/tahdieuphoi/.agents/5fedu/03-ui-ux-and-delivery-standards.md)
*   **Trạng thái áp dụng (Enforcement)**: `DA_AP_DUNG`

