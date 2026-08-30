# Phân quyền 5fedu

**Vai trò:** Pattern-format phân quyền theo module — linh hoạt, không rập khuôn cứng.  
**Ý đồ:** Agent áp đúng cap_bac và scope dữ liệu; lọc chủ yếu ở app, RLS chỉ khi nhạy cảm.

## 6 quyền cơ bản

`Xem` | `Thêm` | `Sửa` | `Xóa` | `Quản trị` | `Tất cả`

Module key trên Supabase: **tiếng Việt không dấu, slug module** (vd `nhan_vien`, `don_hang`). Map app ↔ DB: `src/lib/permission-db-keys.ts`.

## Taxonomy admin — phân hệ / group / module

**Nguồn chuẩn navigation:** `src/lib/sidebar-menu.tsx` (không phải folder `src/features/`).

| Cấp | Ý nghĩa | Ví dụ |
|-----|---------|-------|
| **Phân hệ** | Tab dashboard admin | Website · Hành chính · Kinh doanh · Tài chính · Hệ thống |
| **Group module** | Nhóm card trong phân hệ | *Quản lý bán hàng* · *Tồn kho & Kho vận* · *Dịch vụ & Sửa chữa* |
| **Module** | Một card / route | Đơn hàng · Nhập hàng · Tồn kho · … |

**Ma trận phân quyền** (`permission-modules-config.ts`) phải mirror cùng cấu trúc phân hệ → group → module như sidebar. Không gom theo bounded-context code (`kho-van`, `kinh-doanh/...`) nếu card hiển thị dưới phân hệ khác.

**Module tham chiếu template** (Nhân viên, tab stats Nhân viên…) = pattern UI — không thay tên card trên ma trận.

### Module stats / báo cáo

| Pattern | Quyền ma trận | UI thực tế |
|---------|---------------|------------|
| Tab stats trong CRUD | Cùng module cha | Chỉ xem + xuất |
| Standalone stats, quyền riêng | Dòng riêng — ưu tiên chỉ **Xem** (+ xuất = xem) | Không CRUD |
| Standalone stats, mượn quyền cha | Không dòng riêng | Vào được nếu có quyền module cha |

Cột Thêm/Sửa/Xóa trên ma trận stats **không** map nút UI — tránh cấp quyền gây hiểu nhầm; plan refactor sẽ tách `allowedActions` theo surface.

### Checklist module mới (phân quyền)

1. Xác định phân hệ + group từ sidebar
2. Thêm `permission-modules-config.ts` đúng group
3. `permission-module-registry.ts` + `permission-db-keys.ts`
4. Verify nav filter + route guard + toolbar hooks
5. Stats: chọn inherit vs module key riêng

## Chuẩn cap_bac (pattern Sheet gốc)

| Cấp | Xem | Thêm / Sửa / Xóa |
|---|---|---|
| `cap_bac=1` hoặc `quyen_quan_tri` | Toàn bộ | Toàn bộ |
| `cap_bac=2` | Theo `phong_id` (phòng ban) | Chỉ bản ghi chưa duyệt/khóa trong phòng |
| `cap_bac=3` | Theo `nhom_id` | Tương tự trong nhóm |
| Còn lại | Chỉ bản ghi của mình (`id_nhan_vien` / `nguoi_tao`) | Chỉ bản ghi của mình |

## RLS vs lọc app

- **Mặc định:** lọc quyền theo dòng ở **tầng app/service** (agent kiểm soát tốt hơn).
- **RLS authenticated:** mọi bảng app phải có policy "chỉ user đã login" — xem `domains/database.md`.
- **RLS theo dòng:** chỉ khi dữ liệu nhạy cảm (vd bảng lương) — owner phải chốt.

## Câu lệnh mẫu owner

> "Hãy phân quyền cho tôi module Phiếu hành chính"

Agent phải: xác nhận module key → áp cap_bac theo bảng trên → verify bằng ≥2 loại account (không chỉ admin).

## Do NOT

- Không suy diễn quyền sửa thường = quyền duyệt.
- Không test permission chỉ bằng admin.
