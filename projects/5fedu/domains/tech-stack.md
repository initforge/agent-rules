# Tech stack và template

**Vai trò:** Stack mặc định và cách dùng template.  
**Ý đồ:** Agent xác nhận stack từ dự án, không copy path máy dev.

## Stack mặc định (xác nhận khi cài)

- Frontend: **React (Vite)** + TypeScript
- UI: Tailwind + `components/ui` nội bộ (shadcn-style); không cài registry ngoài nếu chưa duyệt
- Data: TanStack Query, Zustand, React Hook Form + Zod
- Backend: Supabase PostgreSQL + Auth
- Media: Cloudinary (khi dự án khai báo)
- Mock data: chỉ khi owner xác nhận

## Template frontend

```text
https://github.com/admin5fedu/5f-template-ket-noi-supabase
```

Khi implement:

1. Clone template (hoặc dùng bản local owner cung cấp — **không** hardcode path máy dev vào repo)
2. Đọc module reference trong template trước khi adapt
3. Báo owner nếu phải sửa phần core template

## Infra tối ưu (pattern)

- **Supabase:** giảm egress — select đủ cột, pagination server-side
- **Vercel Edge:** cache static; API nặng ở server/RPC
- Media qua CDN; không proxy ảnh lớn qua client

## Nguyên tắc dùng template

- Ưu tiên thêm/adapt module theo spec
- Hạn chế sửa/xóa phần template đang hoạt động
- Trước khi sửa module có sẵn: đọc flow, route, state, service, component
- Thay đổi lớn: báo lý do và rủi ro trước

## Nostime (legacy Next.js)

Stack Next.js App Router của Nostime → chỉ `archive/nostime/` — không phải template chung.
