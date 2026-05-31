# Tech Stack Và Template

## Stack mặc định cần xác nhận

- Frontend: React (Vite) + TypeScript.
- UI: Tailwind CSS + component nội bộ trong `components/ui`, phong cách tương tự shadcn. Không mặc định cài shadcn/Radix registry nếu chưa được duyệt.
- Data/state: TanStack Query cho server state, Zustand cho client state, React Hook Form + Zod cho form.
- Backend: Supabase PostgreSQL + Supabase Auth.
- Mock data: chỉ dùng khi được xác nhận rõ.
- Media: Cloudinary.
- Có thể có Google Sheets/AppSheet credentials tùy dự án.

## Template frontend

5fedu thường cấp template:

```text
https://github.com/tahdieuphoi-ctrl/TAH_app
```

Người dùng đã có quyền qua GitHub CLI. Dự án này đã chốt clone/adapt template.

Template source local đã clone để tham chiếu:

```text
P:\tah-app-5f\.agents\template-source\TAH_app
```

Khi implement app root, đọc template source local trước, lấy/adapt đúng phần cần, và báo người dùng nếu phải chỉnh sửa phần template.

## Nguyên tắc dùng template

- Ưu tiên thêm/adapt module theo spec.
- Hạn chế sửa/xóa phần template đang hoạt động.
- Trước khi sửa module có sẵn, đọc flow, route, state, service và component liên quan.
- Nếu cần thay đổi lớn, báo cáo lý do và rủi ro trước.

