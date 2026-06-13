# Pillar 1: System Architecture, Specs & Google Sheets Map

Tài liệu này quy định cấu trúc kỹ thuật hệ thống, cách tích hợp template giao diện tham chiếu, định dạng cấu trúc route/view và bản đồ dữ liệu Google Sheets làm spec chính.

---

## 1. Cấu Trúc Kỹ Thuật (Tech Stack) & Template

### Tech Stack Mặc Định (Đã Chốt)
- **Frontend**: React (Vite) + TypeScript.
- **UI & Styling**: Tailwind CSS + components nội bộ trong `components/ui` (phong cách tương tự shadcn). Cấm cài thư viện bên ngoài nếu chưa được phê duyệt.
- **State Management**: TanStack Query (server state), Zustand (client state).
- **Form Validation**: React Hook Form + Zod.
- **Backend & Database**: Supabase PostgreSQL + Auth thật (không mặc định mock).
- **Media Storage**: Cloudinary (nếu có tính năng upload ảnh/media).

### Template Tham Chiếu (`TAH_app`)
Quy trình kế thừa và chỉnh sửa giao diện:
- Template source local được clone tại: `.agents/template-source/TAH_app` (commit chốt: `47947e6eea0b1b7dc6723356f37f604e30ac690b`).
- **Nguyên tắc**: Ưu tiên thêm mới hoặc adapt module theo spec. Hạn chế sửa/xóa các module template đang hoạt động bình thường. Nếu bắt buộc phải thay đổi lớn ở phần template dùng chung, phải lập kế hoạch chi tiết và xin ý kiến người dùng trước.

---

## 2. Giao Diện & Quy Ước Route (Frontend Mapping)

### Quy Trình Ánh Xạ (Mapping Chain)
Trước khi triển khai bất kỳ module nào, Agent phải lập sơ đồ ánh xạ từ spec tới code theo chuỗi:
```text
spec/source -> submenu -> module -> view/tab -> route -> source path -> database table -> service/handler
```

### Menu & Thư Mục Nghiệp Vụ
- **Tên submenu và thư mục**: Dùng tiếng Việt (không dấu hoặc có dấu tùy giao diện) để người dùng không biết tiếng Anh vẫn dễ tra cứu. Ví dụ: `Hệ thống`, `Nhân sự`, `Vận hành`, `Tài chính`.
- **Tên view**: Dùng dạng hybrid tiếng Việt không dấu + English suffix (ví dụ: `nhan-vien-form`).
- **Module key lưu trên DB**: Dùng slug tiếng Việt không dấu của module (ví dụ: `nhan-vien`), không lưu kèm domain cha (như `he-thong/nhan-vien`).

### Tab & Điều Hướng (Deep Linking)
- Khi module có nhiều tab (ví dụ: Chuyến xe có tab `Danh sách` và `Danh sách CT`), tab đang mở phải được lưu trên query URL:
  ```text
  ?tab=<tab-key>
  ```
- Phải đọc `searchParams` (`id_tai_xe`, `id_xe`, `id_dia_diem`, `trang_thai`) từ URL để tự động kích hoạt bộ lọc của danh sách, giúp liên kết chuyển hướng từ màn hình chi tiết sang mượt mà.

---

## 3. Bản Đồ Dữ Liệu Google Sheets (Specs Source Map)

Các liên kết Google Sheets làm nguồn đặc tả nghiệp vụ chính (Public & Export offline tại `output/sheets/current/`):
- **Sheet app/data/spec**: `1NY4sVW2GZaOjtZ-Mivq-B5PlXZPL_QEhbJjAJe_0ddg`
- **Sheet dự án/quy tắc**: `1KF3Pe-N7S4DJm_6TKi9QXy4jXPKzqDmeLVHxgiuGoZY`

### Phân Bổ View & Tab Nghiệp Vụ Từ Spec:
- **Hệ thống / Sơ đồ**: Phòng ban, Chức vụ, Nhân viên.
- **Hệ thống / Thiết lập khác**: Thông tin công ty, Phân quyền.
- **Quản lý vận tải / Kế hoạch**:
  - Chuyến xe (Tab: `Danh sách`, `Danh sách CT`)
  - Bảng lương (Tab: `Danh sách`)
  - Thống kê chuyến đi (Lọc theo ngày/chuyến/tài xế/địa điểm/xe/lương/chi phí)
  - Thống kê lương (Lọc theo ngày/tài xế)
- **Quản lý vận tải / Thiết lập**: Tài xế, Địa điểm, Danh sách xe.
