# Phân quyền — quy chuẩn 5F ERP

Tài liệu nguồn cho pattern phân quyền module CRUD. **Client `can()` chỉ UX** — RLS Supabase (`has_module_permission`, `nguoi_tao`) là lớp bắt buộc.

## Thứ tự ưu tiên quyền

1. **Super user theo cấp bậc:** `cap_bac = 1` trên chức vụ đăng nhập (`id_chuc_vu[0]`) → full CRUD **mọi module**.
2. **Quản trị module:** token `admin` hoặc `tat_ca` / `all` trên module trong ma trận → full CRUD **module đó**.
3. **Ma trận CSV:** `xem`, `them`, `sua`, `xoa` (map app: view, create, edit, delete).
4. **Theo dòng (`nguoi_tao`):**
   - Xem + sửa dòng mình tạo (kể cả không có `sua` module).
   - Xóa **không** bypass theo creator — vẫn cần `xoa`.

## Map App ↔ DB

| App resource | module_id | DB module_key |
|--------------|-----------|---------------|
| employees | he-thong/nhan-vien | nhan_vien |
| departments | he-thong/phong-ban | phong_ban |
| positions | he-thong/chuc-vu | chuc_vu |
| company | he-thong/thong-tin-cong-ty | thong_tin_cong_ty |
| permissions | he-thong/phan-quyen | phan_quyen |

Chi tiết token: `lib/permission-db-keys.ts`, client: `lib/permissions.ts` (`APP_RESOURCE_TO_MODULE`).

## API client

| Hàm / hook | Mục đích |
|------------|----------|
| `can(user, action, resource)` | Nút toolbar, action module-level |
| `canAccessModule(user, resource)` | Card dashboard, sidebar Hệ thống, route guard (view \| create \| edit) |
| `canOnRecord(user, action, resource, { nguoi_tao })` | Sửa/xóa/xem theo dòng |
| `useCan`, `useResourcePermissions`, `useCanOnRecord` | React subscribe matrix |
| `useCanAccessModuleChecker()` | Lọc nav động |

Hydrate: `useHydratePositionPermissions` → `grantsByModule` + `positionCapBac` trong `usePermissionGrantStore`.

## Navigation

- Config: `lib/module-nav-config.ts` (`SYSTEM_MODULE_NAV_GROUPS`).
- Ẩn card submenu nếu không `canAccessModule`.
- Ẩn **group** nếu mọi card trong group bị ẩn.
- Sidebar `/thong-tin-ban-quyen` **luôn hiện**.
- Route module: bọc `ModulePermissionRoute` (`components/auth/ModulePermissionRoute.tsx`).

## RLS (Supabase)

- `has_module_permission`: bypass khi `current_user_cap_bac() = 1`.
- **`canAccessModule`:** view **hoặc** create **hoặc** edit module (+ super / module admin).

### CRUD có `nguoi_tao` (Strict SELECT trên list)

| Bảng | SELECT | UPDATE | DELETE |
|------|--------|--------|--------|
| `var_nhan_vien` | view **hoặc** creator **hoặc** hàng login | update **hoặc** creator | delete module |
| `var_phong_ban` | view **hoặc** creator | update **hoặc** creator | delete module |
| `var_chuc_vu` | view **hoặc** creator | update **hoặc** creator | delete module |

Migrations: `20250609180000_var_nhan_vien_*`, `20250609190000_var_phong_ban_*`, `20250609200000_var_chuc_vu_*`.

**Master data lookup (Hybrid — nếu cần sau QA):** user chỉ `them` trên NV vẫn cần picker phòng/chức vụ — có thể mở SELECT tối thiểu qua RPC/`getActive*` riêng; mặc định rollout dùng Strict giống list.

### Singleton / matrix

| Bảng | SELECT | WRITE |
|------|--------|-------|
| `var_cong_ty` | view **hoặc** update | update module |
| `var_phan_quyen` | view **hoặc** update **hoặc** admin | admin **hoặc** update |

Migrations: `20250609210000_var_cong_ty_*`, `20250609220000_var_phan_quyen_*`.

## Checklist module CRUD mới

1. Thêm `AppResource` + `APP_RESOURCE_TO_MODULE` trong `lib/permissions.ts`.
2. Đăng ký module trong `permission-modules-config.ts` + seed `var_phan_quyen`.
3. RLS policies gọi `has_module_permission` (+ `nguoi_tao` nếu có quyền theo dòng).
4. Cột `nguoi_tao` + set khi create/import (`getCurrentEmployeeId()`).
5. Toolbar: `useResourcePermissions(resource)`.
6. Row/detail: `useCanOnRecord` khi entity có `nguoi_tao`.
7. Form: chặn save nếu không create / không edit record.
8. Thêm entry vào `lib/module-nav-config.ts` + `ModulePermissionRoute` trên route.
9. Tests: `lib/__tests__/permissions.test.ts` (nếu có rule đặc biệt).

## Rollout Hệ thống

| Module | Trạng thái |
|--------|------------|
| Nhân viên | Pilot — reference |
| Phòng ban, Chức vụ | `nguoi_tao` + `useCanOnRecord` + Strict RLS |
| Thông tin công ty | Read-only khi chỉ `view`; RLS SELECT siết |
| Phân quyền | Matrix read-only khi chỉ `view`; RLS SELECT siết |
