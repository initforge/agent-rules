# Phân quyền 5fedu

**Vai trò:** Pattern-format phân quyền theo module — linh hoạt, không rập khuôn cứng.  
**Ý đồ:** Agent áp đúng cap_bac và scope dữ liệu; lọc chủ yếu ở app, RLS chỉ khi nhạy cảm.

## 6 quyền cơ bản

`Xem` | `Thêm` | `Sửa` | `Xóa` | `Quản trị` | `Tất cả`

Module key trên Supabase: **tiếng Việt không dấu, slug module** (vd `nhan-vien`, `phieu-hanh-chinh`). Không lưu dạng `he-thong/nhan-vien`.

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
