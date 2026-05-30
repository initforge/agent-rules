# Working Format

## Mục tiêu

File này ghi khung format/cách làm mặc định để AI hiểu nên làm theo hướng 5fedu, kể cả khi dữ kiện cụ thể từng app chưa chốt.

Nguyên tắc: format có thể đã chốt, nhưng giá trị cụ thể vẫn phải hỏi nếu chưa có nguồn rõ.

## App và template

Format đã chốt:

- Ưu tiên dùng template `https://github.com/tahdieuphoi-ctrl/TAH_app`.
- Khi scaffold/adapt, đọc cấu trúc template trước rồi map spec vào domain/module/view có sẵn.
- Ưu tiên thêm hoặc adapt, hạn chế sửa/xóa module template.
- Nếu cần sửa/xóa lớn, báo lý do, rủi ro, file bị ảnh hưởng và xin chốt trước.

Dữ kiện cần hỏi theo app:

- Có clone/adapt template vào repo hiện tại không.
- App name chính xác.
- Module nào dùng nguyên template, module nào cần sửa theo spec.

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
- Google Sheets/AppSheet chỉ coi là khả năng thường gặp, không tự bật nếu spec không nói.

Dữ kiện cần hỏi theo app:

- Stack thật trong repo/spec có đúng mặc định không.
- App có dùng mock tạm hay phải nối thật ngay.
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

Ví dụ mapping và schema rút từ ảnh/spec ban đầu nằm ở `.codex/5fedu/08-source-examples.md`.

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

AI không được tự chốt:

- credentials thật
- schema/migration thật
- xóa/sửa lớn template
- permission rule cụ thể nếu người dùng chưa đưa
- bật RLS thay cho app-side permission
- dùng mock khi người dùng yêu cầu nối thật
