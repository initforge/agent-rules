# Decision Status

## Quy ước trạng thái

- `DA_CHOT`: đã được người dùng hoặc owner xác nhận rõ, được phép dùng làm cơ sở triển khai.
- `CHUA_CHOT`: mới là ghi nhận ban đầu hoặc mặc định theo 5fedu, chưa được phép triển khai phần rủi ro nếu chưa hỏi lại.
- `CAN_HOI_THEM`: thiếu dữ kiện, ảnh/spec chưa đủ rõ, có nhiều cách hiểu, hoặc cần owner xác nhận thêm.

Chỉ cập nhật một mục sang `DA_CHOT` khi người dùng xác nhận rõ trong chat, tài liệu spec, Google Sheet, hoặc source chính thức của dự án.

## Trạng thái hiện tại

| Mục | Trạng thái | Nguồn/xác nhận | Ghi chú |
| --- | --- | --- | --- |
| Dùng context 5fedu theo từng dự án, không nhét full vào global | DA_CHOT | User prompt | Global chỉ giữ một slash `/5fedu` và skill tái dùng |
| Repo hiện tại là dự án 5fedu | DA_CHOT | User prompt | Setup project-local `AGENTS.md` |
| `AGENTS.md` chỉ là con trỏ nhẹ, không `@` toàn bộ docs | DA_CHOT | User prompt | Đọc theo loading policy |
| `/5fedu` chỉ dùng để scaffold hoặc bảo trì context/rule/status, không cần gọi mỗi lần để cấp context | DA_CHOT | User prompt | Normal work phải tự đọc `AGENTS.md` |
| Format/cách làm mặc định của 5fedu phải được ghi rõ dù giá trị từng app chưa chốt | DA_CHOT | User prompt | Xem `07-working-format.md` |
| Tech stack mặc định React Vite TypeScript, Tailwind, TanStack Query, Zustand, React Hook Form, Zod, Supabase, Cloudinary | CHUA_CHOT | Ảnh/user prompt | Phải xác nhận lại theo từng app |
| Clone/adapt template `https://github.com/tahdieuphoi-ctrl/TAH_app` vào repo hiện tại | CHUA_CHOT | User prompt nói template thường được cấp | Chưa clone, cần user chốt |
| App name chính xác | CHUA_CHOT | Ảnh có `TAH APP` | Cần chốt theo dự án thật |
| Supabase credentials | CHUA_CHOT | User yêu cầu phải xin lúc đầu | Chưa có secret, không được tự giả |
| Cloudinary credentials | CHUA_CHOT | Ảnh/user prompt | Chưa có secret |
| Google Sheets/AppSheet credentials | CHUA_CHOT | User nói thường có | Cần hỏi từng dự án |
| Vercel/Edge Function setup | CHUA_CHOT | Quy tắc tối ưu cuối dự án | Chỉ làm plan khi đến giai đoạn bàn giao/tối ưu |
| Prefix bảng database theo submenu | CAN_HOI_THEM | User đưa ví dụ, chưa có bảng prefix đầy đủ | Cần danh sách prefix chuẩn |
| Ý nghĩa chính xác của "hàm index" database | CAN_HOI_THEM | User prompt ghi theo lời sếp | Cần SQL mẫu hoặc giải thích từ owner |
| Bảng được miễn `id_nguoi_tao` | CAN_HOI_THEM | Ảnh chat nói trừ bảng hệ thống như phòng ban/chức vụ | Cần chốt từng bảng |
| Permission chi tiết từng module | CHUA_CHOT | Có ví dụ Phiếu hành chính | Mỗi module cần rule riêng hoặc xác nhận dùng default |

## Cách AI phải dùng file này

- Trước khi code: đọc bảng trạng thái và nêu rõ mục nào đang chặn phần việc.
- Khi người dùng chốt: cập nhật trạng thái, nguồn/xác nhận, ghi chú.
- Khi phát hiện mâu thuẫn giữa ảnh, sheet, code template và lời chat: đổi sang `CAN_HOI_THEM`, hỏi lại, không tự chọn.
- Khi lập plan: đưa các mục `CHUA_CHOT`/`CAN_HOI_THEM` liên quan vào Risk Register hoặc Stop Conditions.
