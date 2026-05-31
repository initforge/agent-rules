# Working Format

## Mục tiêu

File này ghi khung format/cách làm mặc định để AI hiểu nên làm theo hướng 5fedu, kể cả khi dữ kiện cụ thể từng app chưa chốt.

Nguyên tắc: format có thể đã chốt, nhưng giá trị cụ thể vẫn phải hỏi nếu chưa có nguồn rõ.

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

Ví dụ mapping và schema rút từ ảnh/spec ban đầu nằm ở `.agents/5fedu/08-source-examples.md`.

## Auth và permission

Format đã chốt:

- Login fake email: nhập `admin` thì dùng `admin@gmail.com`.
- Bỏ đăng ký mặc định.
- Account mặc định: `admin` / `5fedu.com`.
- Module nhân viên giữ trường chính, không kéo theo các trường rườm rà nếu app không cần.
- Quyền mặc định dùng `xem`, `them`, `sua`, `xoa`, `quan_tri`; `tat_ca` chỉ là UI helper, không lưu thành quyền riêng.
- Permission xử lý app-side mặc định, không tự đẩy sang Supabase RLS nếu chưa được yêu cầu.

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
## Owner Feedback Gate 2026-05-31

Khi làm database/auth/nhân viên, phải chạy checklist này trước khi code:

- `id` bảng app đã là `int8` auto increment chưa?
- Có dùng nhầm `uuid` cho `id` không?
- Foreign key tới bảng app đã là `int8` chưa?
- Bảng nhân viên có đang bị thêm trường linh tinh ngoài source không?
- Login có dùng đúng `ten_dang_nhap` thay vì `ma_nhan_vien` không?
- Thêm/sửa/xóa `ten_dang_nhap` đã đồng bộ Supabase Auth qua server/admin path chưa?
- Đã đọc `.agents/5fedu/10-owner-feedback-lessons.md` chưa?

Nếu câu trả lời nào là chưa, dừng triển khai và sửa mapping/schema/plan trước.

## Format UI/Nghiệp Vụ Vận Tải

Format đã chốt từ owner feedback ngày 2026-05-31:

- Trang chủ hiển thị module theo thứ tự `Quản lý vận tải` -> `Hệ thống` -> `Thông tin bản quyền`.
- Mỗi module vận tải phải map đủ: list view desktop, card view mobile, detail drawer, form drawer, row action, bulk action, print/export/approve action nếu có.
- `Tài xế`, `Địa điểm`, `Danh sách xe`, `Chuyến xe`, `Bảng lương` không được chỉ dùng CRUD generic nếu nghiệp vụ cần form/detail riêng.
- Relation field có nhiều lựa chọn phải dùng `Combobox`/`AsyncCombobox` theo template, không dùng `<select>` thô.
- Tổng tiền/tổng chuyến/tổng lương/tổng còn lại phải phân loại rõ là field nhập tay hay field tự tính; nếu tính được từ bảng con hoặc dữ liệu thực tế thì không cho nhập tay.
- Action `duyệt` không nằm trong form nhập liệu. Duyệt là action riêng trên detail/list/row/bulk theo nghiệp vụ.
- Action `in` bảng lương phải có khi làm module bảng lương.
- Detail tài xế cần lịch sử chuyến xe và lịch sử lương; detail địa điểm/xe cần lịch sử chuyến liên quan khi có dữ liệu.
- Trước khi sửa giao diện, đối chiếu `.agents/template-source/TAH_app` commit `47947e6eea0b1b7dc6723356f37f604e30ac690b`.

