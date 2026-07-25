# Supabase: egress và hiệu năng (checklist nội bộ)

Tham chiếu chính: [Manage Egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

## Đã áp dụng trong codebase

- **PostgREST**: `select` liệt kê cột/embed thay vì `*` trên các bảng module Hệ thống (nhân viên, phòng ban, chức vụ, phân quyền).
- **List vs detail vs stats**: `EMPLOYEE_SELECT_TABLE` (list) · `EMPLOYEE_SELECT_FULL` (form/chi tiết) · `EMPLOYEE_SELECT_STATS` (tab thống kê — cột tối thiểu) — pattern `*_SELECT_*` trong `core/supabase-select.ts`.
- **Repository**: `createRepository` / `SupabaseRepository` bắt buộc `select` khi Supabase — không default `*`.
- **Map boundary**: `core/map-from-db.ts` + `mapFromDb` trong repository — FK bigint → string trong domain.
- **Sau insert/update**: `returningSelect` thu hẹp khi chỉ đổi trạng thái hoặc bulk không cần payload lớn.
- **Giới hạn getAll**: `SUPABASE_DEFAULT_MAX_ROWS = 5000` — mỗi feature có thể truyền `limit`/`offset` qua `RepositoryQueryOptions`.
- **Nhân viên stats**: `getEmployeesForStats()` + `employeesStatsSampleQueryOptions` — không tải avatar/auth/chức vụ embed.
- **TanStack Query cache tiers** (`lib/supabase/query-config.ts`):
  - `listQueryOptions` — stale 5 phút (danh sách transaction, matrix admin per-module)
  - `masterDataQueryOptions` — stale 30 phút (phòng ban, chức vụ, công ty)
  - `authSensitiveQueryOptions` — stale 0, refetch on mount (`permissionGrants` session — admin đổi quyền có hiệu lực sau reload)
- **Query keys**: tập trung `lib/query-keys.ts`; invalidate prefix (`pagePrefix`) — không truyền factory function làm `queryKey`.
- **queryOptions factories**: `features/he-thong/queries/master-data.ts`, `features/he-thong/nhan-vien/queries/employees.ts` — dùng chung hook + prefetch.
- **Phân quyền theo module**: `getPhanQuyenByModule` + `queryKeys.roles.forModule` — tránh `getRoles()` full matrix trên UI.
- **Prefetch matrix**: `prefetchModuleRolePermissions` / `prefetchAdjacentModuleRolePermissions` — hover tab module.
- **Chức vụ active**: `getActivePositions()` + `queryKeys.positions.active` cho picker/FK; invalidate `roles.all` + `permissionGrants.all` khi đổi trạng thái chức vụ.
- **Login/session**: `AuthSessionSynchronizer` invalidate `permissionGrants.all` trước prefetch grants.

## Cache tiers — khi nào dùng gì

| Tier | Constant | staleTime | Dùng cho |
|------|----------|-----------|----------|
| Transaction list | `listQueryOptions` | 5 phút | NV list/page, matrix admin `roles.forModule` |
| Master data | `masterDataQueryOptions` | 30 phút | PB, CV, công ty, shell matrix positions |
| Auth-sensitive | `authSensitiveQueryOptions` | 0 | `permissionGrants.byPosition` — `can()` session |

**Không** gán `masterDataQueryOptions` cho quyền session — correctness quan trọng hơn tiết kiệm vài KB/request.

## Tab Thống kê — decision tree

```
≤500 NV + aggregate client-side  →  *_SELECT_STATS + getXForStats()
500+ NV + cần full dataset       →  SQL VIEW read-model (RLS security invoker)
Aggregate nặng (nhiều GROUP BY)  →  Postgres RPC trả JSON aggregates
```

Với quy mô hiện tại (≤500 NV): **chưa cần view/RPC** — `EMPLOYEE_SELECT_STATS` đủ.

## Vận hành (Dashboard Supabase)

- **Usage / Observability**: theo dõi egress theo dịch vụ; tìm endpoint `/rest/v1/...` gọi nhiều.
- **Database → Query performance**: truy vấn gọi nặng, số dòng trả về trung bình.
- **Index**: cột dùng trong `filter`, `order`, `eq` trên Postgres (giảm scan, gián tiếp giảm retry/refetch phía client).

## Khi mở rộng

- Realtime: subscribe tối thiểu, hủy khi unmount.
- Storage: ảnh qua CDN/transform, `cache-control`.
- Backend/BFF: pooler Postgres (Supavisor) theo [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres).
- Stats view/RPC khi vượt ngưỡng pagination hoặc cần aggregate server-side.
