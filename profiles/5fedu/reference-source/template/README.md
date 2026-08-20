# 5F Template – Ứng dụng quản lý nội bộ

Ứng dụng web quản lý thiết bị / nhân sự và nghiệp vụ nội bộ: Trang chủ, Hệ thống (nhân viên, phòng ban, chức vụ, thông tin công ty, phân quyền, …), Hồ sơ. Giao diện tiếng Việt, dark mode; tông màu chủ đạo chọn trong menu người dùng (avatar).

## Stack (tóm tắt)

- **Frontend:** React (Vite) + TypeScript.
- **UI:** Tailwind CSS + **component nội bộ** trong `components/ui/` (phong cách tương tự shadcn, **không** cài registry shadcn/Radix để giữ kiểm soát bundle).
- **Dữ liệu:** TanStack Query (server) + Zustand (client); React Hook Form + Zod.
- **Backend:** Supabase (PostgreSQL + Auth); dev mặc định mock, production build mặc định Supabase.

### Reserved dependencies (QR / payment)

`napas-qr`, `vietqr`, `qrcode` — giữ cho tích hợp thanh toán / in QR (NAPAS, VietQR). Xem `lib/payment/reserved-deps.ts`.

## Supabase

1. Tạo project trên [Supabase](https://supabase.com), lấy **URL** và **anon key**.
2. Copy `.env.example` → `.env` và đặt `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`.
3. **Dev không có Supabase:** thêm `VITE_DATA_SOURCE=mock`. **Dev upload base64:** thêm `VITE_MEDIA_PROVIDER=local`.
4. Sinh type TypeScript cho PostgREST (khuyến nghị khi schema ổn định):

   ```bash
   npm run types:supabase
   ```

   (Cần [Supabase CLI](https://supabase.com/docs/guides/cli) và project đã `supabase link`, hoặc chỉnh script trong `package.json` dùng `--project-id`.)

5. **Schema DB (fresh):** chạy **một lần** [`scripts/bootstrap-var-he-thong.sql`](scripts/bootstrap-var-he-thong.sql) trong SQL Editor — **không** chạy `supabase/migrations/_archive/`. Chi tiết: [`docs/supabase-setup.md`](docs/supabase-setup.md).

6. Bật **RLS** và policy phù hợp trên các bảng; client chỉ dùng anon key nên policy là lớp bảo vệ chính.

**Hiệu năng (đã áp dụng trong code):** client Supabase singleton + PKCE; TanStack Query `staleTime` / `gcTime`; repository giới hạn số dòng mỗi lần `getAll` (xem `SUPABASE_DEFAULT_MAX_ROWS`); `select` trong service chỉ lấy cột và quan hệ cần thiết. Dev: nút **React Query Devtools** góc dưới trái.

## Yêu cầu

- Node.js (khuyến nghị LTS)

## Chạy dự án

1. Cài đặt phụ thuộc:
   ```bash
   npm install
   ```
2. Chạy máy chủ phát triển:
   ```bash
   npm run dev
   ```
3. Mở trình duyệt theo địa chỉ in ra (thường là `http://localhost:5173`).

## Scripts

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Chạy dev server (Vite) |
| `npm run build` | Build production (output trong `dist/`) |
| `npm run preview` | Xem bản build (sau khi chạy `npm run build`) |
| `npm run test` | Chạy test (Vitest) |
| `npm run test:watch` | Chạy test ở chế độ watch |
| `npm run lint` | ESLint toàn repo |
| `npm run lint:ci` | ESLint **0 warnings** — dùng trước merge / CI |
| `npm run lint:imports:check` | Kiểm tra không còn import cross-folder `../../*` (phải dùng `@/`) |
| `npm run types:supabase` | Sinh `lib/supabase/database.types.ts` (cần Supabase CLI) |

**Pre-commit:** Husky chạy `lint-staged` (ESLint `--max-warnings 0` trên file `.ts`/`.tsx` staged). Pipeline CI nên chạy `npm run lint:ci` · `npm run test` · `npm run build`.

## Deploy Vercel

Frontend là **Vite SPA** (static) — Supabase PostgREST + Auth chạy phía client; Edge Function `employee-auth` deploy riêng trên Supabase (xem [Supabase setup](docs/supabase-setup.md)).

### Cấu hình project Vercel

| Setting | Giá trị |
|---------|----------|
| Framework Preset | **Vite** |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | **22.x** (từ `engines` trong `package.json`) |

[`vercel.json`](vercel.json) đã cấu hình SPA rewrite (`/(.*) → /index.html`) và security headers cơ bản.

### Biến môi trường (Production)

Chỉ cần **4 biến** trên Vercel (production build mặc định Supabase + Cloudinary):

| Biến | Ghi chú |
|------|---------|
| `VITE_SUPABASE_URL` | URL project Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key (không dùng service role) |
| `VITE_CLOUDINARY_CLOUD_NAME` | Unsigned preset only |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | |

Tuỳ chọn: `VITE_SENTRY_DSN`. Không cần `VITE_DATA_SOURCE`, `VITE_MEDIA_PROVIDER`, `VITE_USE_PERMISSION_MATRIX` (mặc định trong code).

Preview (PR): cùng 4 biến; demo mock → set `VITE_DATA_SOURCE=mock` trên môi trường Preview.

### Supabase Auth URLs

Sau deploy, vào Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:** thêm `https://your-app.vercel.app/**` và `https://*.vercel.app/**` (preview)

### Kiểm tra sau deploy

1. Mở deep link trực tiếp (vd. `/he-thong/nhan-vien`) — không được 404.
2. Đăng nhập với tài khoản Supabase Auth.
3. Upload ảnh (avatar/logo) qua Cloudinary.

## Tài liệu

- [Quy ước giao diện (UI Conventions)](docs/UI-CONVENTIONS.md) – Dialog/Drawer, Section, Design system (border radius, button, error message).
- [Catalog view types ERP](docs/view-types.md) – `VIEW_TYPE_REGISTRY`, primitive theo nhóm, tách `ViewTypeId` vs `DataTypeId`.
- [Data types & field-meta](docs/data-types.md) – `DataTypeId`, `RhfDataField`, `formatValueByDataType`, `*-field-meta.ts`.
- [Checklist module mới](docs/checklist-module.md) – CRUD baseline, toolbar, import/export, phân quyền.
- [Supabase setup (fresh DB)](docs/supabase-setup.md) – Bootstrap SQL một lần, deploy edge function, admin đầu tiên.
- [Supabase egress](docs/supabase-egress.md) – selective columns, pagination, cache invalidation.
- [Pattern: nhãn nút](docs/patterns-button-labels.md) · [Pattern: hành động bảng](docs/patterns-data-table-actions.md)

## Cấu trúc chính

- `App.tsx` – Router, theme, ngôn ngữ, route bảo vệ.
- `components/` – Layout, UI dùng chung (Button, Input, Table, …), shared (ConfirmDialog, ErrorState, HierarchyListShell, …).
- `features/he-thong/` – Module Hệ thống: nhân viên, phòng ban, chức vụ, thông tin công ty, phân quyền; **cấp bậc / chi nhánh** chỉ là lookup (hooks + service), không có trang riêng.
- `hooks/` – Cross-cutting React hooks (export, media query, hierarchy root filter, …).
- `lib/` – Tiện ích, `lib/text` (chuỗi giao diện + module registry), `lib/factories/` (CRUD factories), theme, sidebar, `lib/query-keys`, `lib/supabase/`.
- `locales/` – File JSON / gộp chuỗi (theo cấu hình dự án).
- `pages/` – Trang đơn (Home, Login, Profile, …).
- `store/` – Zustand (auth, UI, confirm).
