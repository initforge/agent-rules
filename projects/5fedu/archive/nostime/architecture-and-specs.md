# Pillar 1: System Architecture, Specs & Google Sheets Map

Tài liệu này quy định cấu trúc kỹ thuật hệ thống, cách tích hợp template giao diện tham chiếu, định dạng cấu trúc route/view và bản đồ dữ liệu Google Sheets làm spec chính.

---

## 1. Cấu Trúc Kỹ Thuật (Tech Stack) & Template

### Tech Stack Mặc Định (Đã Chốt)
- **Frontend**: Next.js (App Router) + TypeScript.
- **UI & Styling**: Tailwind CSS + components nội bộ trong `components/ui` (phong cách tương tự shadcn). Cấm cài thư viện bên ngoài nếu chưa được phê duyệt.
- **State Management**: TanStack Query (server state), Zustand (client state).
- **Form Validation**: React Hook Form + Zod.
- **Backend & Database**: Supabase PostgreSQL + Auth thật.
- **Media Storage**: Nhập dạng URL dán link trực tiếp, không upload file.

---

## 2. Giao Diện & Quy Ước Route Admin Panel (Next.js App Router)

Trang admin panel sử dụng giao diện Obsidian Dark (`#001E15` / `#001511`) kết hợp Chrono Gold (`#D4B675`).

### Quy ước thiết kế & Ý đồ đã chốt (DA_CHOT):
- **Trang Dashboard Tổng quan**: Loại bỏ hoàn toàn khỏi menu Sidebar. Route `/admin` tự động redirect trực tiếp sang `/admin/san-pham` bằng cơ chế Client-side redirect (`router.replace`).
- **Form Đăng nhập (Login)**: Điền sẵn thông tin mock/bypass kiểm thử (`admin@gmail.com` / `5fedu.com`).
- **Phân nhóm menu**: Sidebar chia làm 2 vùng chính:
  1. *Quản trị Website*: Sản phẩm, Danh mục, Đơn hàng, Bài viết Journal, Banner & Giao diện.
  2. *Quản trị Nghiệp vụ*: Kho hàng, Phiếu sửa chữa, Tài liệu nội bộ, Tài chính (Thu chi), Nhân sự & Lương, Phân quyền ma trận, Cấu hình hệ thống.
- **Biểu tượng (Iconography)**:
  - *Logo*: Sử dụng SVG bánh răng đồng hồ cơ học (Tourbillon Watch Gear) kết hợp chữ N cách điệu màu vàng gold.
  - *Avatar*: Sử dụng SVG niềng bát giác đính ốc Audemars Piguet Royal Oak (Royal Oak Bezel) bao quanh chữ cái viết tắt tên người dùng.
- **Favicon tab trình duyệt**: Sử dụng favicon tĩnh chuẩn (`favicon.ico` + `icon.png`) bằng logo chữ N gold để Next.js static HTML export tương thích hoàn toàn, xóa bỏ dynamic `icon.tsx` để sửa lỗi build.

### Danh Sách Route Thực Tế Trong Thư Mục `src/app/admin/`:
1. `/admin` (Redirect): Tự động chuyển hướng sang `/admin/san-pham`.
2. `/admin/san-pham`: Quản lý danh sách sản phẩm đồng hồ xa xỉ (Rolex, Patek Philippe...).
3. `/admin/danh-muc`: Quản lý danh mục đồng hồ (Nam, Nữ, Vintage...).
4. `/admin/don-hang`: Quản lý đơn hàng và trạng thái đặt cọc/thẩm định.
5. `/admin/bai-viet`: Soạn thảo và cấu hình bài viết tin tức Journal.
6. `/admin/banner`: Cấu hình slide Hero banner của trang chủ.
7. `/admin/kho-hang`: Phiếu nhập kho, quản lý danh sách từng chiếc đồng hồ (Serial Number).
8. `/admin/sua-chua`: Quản lý phiếu dịch vụ sửa chữa đồng hồ nội bộ.
9. `/admin/tai-lieu`: Quản lý tài liệu và các văn bản nội bộ.
10. `/admin/tai-chinh`: Quản lý các khoản Thu/Chi và phân bổ chi phí theo tháng.
11. `/admin/nhan-vien`: CRUD nhân sự và thiết lập lương tay, in phiếu lương.
12. `/admin/phan-quyen`: Ma trận phân quyền chức vụ và phòng ban (kế thừa logic template).
13. `/admin/thong-tin-cong-ty`: Cấu hình thông tin showroom, hotline, tỷ giá ngoại tệ.

---

## 3. Bản Đồ Dữ Liệu Google Sheets (Specs Source Map)

Các liên kết Google Sheets làm nguồn đặc tả nghiệp vụ chính:
- **Sheet app/data/spec**: `1ROjN7Ag0MEcEFkY9C-MLnO2ntVmlru5ecGZM9P-2xGI`

### Phân Bổ View & Tab Nghiệp Vụ Từ Spec (13 Module Quản trị Nostime):
1. **Tổng quan (Dashboard Overview)**: `/admin/dashboard` (Doanh thu, Đơn hàng, Lịch hẹn CRM, Tồn kho).
2. **Sản phẩm (Products)**: `/admin/products` (Thương hiệu, Model, Ref, Giá bán, Tình trạng, Bộ máy...).
3. **Danh mục (Categories)**: `/admin/categories` (Đồng hồ Nam, Đồng hồ Nữ, Limited, Vintage).
4. **Thương hiệu (Brands)**: `/admin/brands` (Rolex, Patek Philippe, Audemars Piguet, Omega...).
5. **Bộ sưu tập (Collections)**: `/admin/collections` (Rolex Day-Date Collection, Patek Grand Complications).
6. **Đơn hàng (Orders)**: `/admin/orders` (Quản lý đơn hàng, trạng thái cọc/thẩm định/vận chuyển/hoàn tất).
7. **Khách hàng (Customers / Leads)**: `/admin/customers` (Họ tên, SĐT, Email, Lịch sử mua hàng, Tổng chi tiêu).
8. **Yêu cầu Tư vấn CRM (Private Consultation)**: `/admin/crm` (Lên lịch đón tiếp phòng VIP, phân công nhân viên).
9. **Bài viết (Journal / Content)**: `/admin/journal` (Soạn thảo Nostime Journal, ảnh đại diện, danh mục).
10. **Giao diện (Banner & Theme)**: `/admin/theme` (Hero Banner, text mô tả).
11. **Media Manager (Asset Manager)**: `/admin/media` (Quản lý ảnh sản phẩm, ảnh showroom tập trung).
12. **Tồn kho (Inventory)**: `/admin/inventory` (Serial Number, vị trí két sắt, lịch bảo dưỡng).
13. **Báo cáo & Cấu hình (Reports & Settings)**: `/admin/reports` và `/admin/thong-tin-cong-ty` (Doanh thu thương hiệu, Hotline, địa chỉ showroom).
