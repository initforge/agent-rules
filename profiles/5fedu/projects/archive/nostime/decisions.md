# Quyết định — dự án Nostime (NOSTIME APP)

**Vai trò:** Decision matrix chỉ cho dự án **nostime** (`/home/linhnxdeveloper/Projects/nostime`).  
**Ý đồ:** Tách khỏi template chung; sau cài profile `nostime` nằm tại `context/5fedu/project-overlay/` hoặc tham chiếu từ repo.

## Ngữ cảnh

- App: **NOSTIME APP** — đồng hồ xa xỉ, admin Next.js
- Spec sheet: `1ROjN7Ag0MEcEFkY9C-MLnO2ntVmlru5ecGZM9P-2xGI`

## Quyết định đã chốt (Nostime-only)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Loại bỏ CRM / Tư vấn VIP | DA_CHOT | Không build module |
| Loại bỏ Báo cáo (module generic) | DA_CHOT | Theo scope Nostime |
| Loại bỏ Voucher | DA_CHOT | |
| Loại bỏ Thành viên / đăng ký khách | DA_CHOT | Khách không login |
| Ảnh sản phẩm & bài viết | DA_CHOT | URL dán link, không upload |
| Sản phẩm 1 mã = 1 chiếc | DA_CHOT | Không quản lý số lượng kiểu ERP đại trà |
| Admin: bỏ Dashboard, redirect `/san-pham` | DA_CHOT | Luxury brand flow |
| Login điền sẵn test | DA_CHOT | `admin@gmail.com` / `5fedu.com` |
| Icon Watch Gear / Royal Oak Bezel | DA_CHOT | Brand SVG |
| Báo cáo NXT 3 tab | DA_CHOT | Tổng hợp kỳ / Chi tiết phiếu / Tồn tại thời điểm |
| Không module Tồn kho theo danh mục | DA_CHOT | Chỉ Tồn kho + Báo cáo NXT |
| Báo cáo Tài khoản tra cứu theo kỳ | DA_CHOT | Tab Danh sách + Tra cứu |
| Auto-fill Tài khoản quỹ / Hạng mục P&L trên Đơn hàng | DA_CHOT | `is_default === true` |
| Phiếu sửa chữa → `kd_khach_hang` | DA_CHOT | FK đối tác |
| Danh mục tài chính bỏ phân quyền xem/quản lý | DA_CHOT | 2 cấp + cột P&L |
| Báo cáo tài chính → P&L | DA_CHOT | So sánh cột theo tháng/quý/năm |
| Đánh giá / Liên hệ | CAN_HOI_THEM | Xem xét sau |

Chi tiết kiến trúc/route: `architecture-and-specs.md`, `database-specs.md`, `backend-notes.md`.
