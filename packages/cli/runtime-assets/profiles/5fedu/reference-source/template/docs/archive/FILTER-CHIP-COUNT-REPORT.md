# Báo cáo Count Filter Chip theo module

Cập nhật: sau khi bổ sung count cho toàn bộ module còn thiếu.

## Module / Toolbar **đã có count** (options có `count`, ẩn option count = 0 nếu `hideZeroCount`)

| Module | Toolbar / Vị trí | Nguồn count |
|--------|-------------------|-------------|
| **Tài liệu** | TaiLieuToolbar | `useTaiLieuFilterCounts(items, filters)` — huong, id_phong_ban, id_loai, id_trang_thai |
| **Điểm cộng trừ** | DiemCongTruToolbar | `useDiemCongTruFilterCounts(items, filters)` — type (loai) |
| **Mẫu công việc** | MauCongViecToolbar | items → statusCounts, uuTienCounts (exclude-self) |
| **Thiết lập công lương – Nhóm phiếu** | PayrollFormGroupToolbar (group-toolbar) | items → statusCounts, typeCounts (loai_phieu) |
| **Thiết lập công lương – Nhóm điểm** | PayrollPointGroupToolbar (point-group-toolbar) | items → statusCounts, typeCounts (loai) |
| **Thiết lập công lương – IP WiFi** | PayrollWifiIpToolbar (ip-toolbar) | items → statusCounts, branchCounts (id_chi_nhanh) |
| **Phiếu hành chính – Hạn mức** | AdminFormQuotaToolbar (quota-toolbar) | items (rows) → typeCounts (loai_phieu) |
| **Bảng lương – Danh sách** | BangLuongManagedToolbar | items (managedRecords) → phongCounts (id_phong_ban) |
| **Chấm điểm KPI – Của tôi** | ChamDiemKpiMyToolbar | items (myRecords) → danhGiaCounts (exclude yearMonth) |
| **Chấm điểm KPI – Tôi quản lý** | ChamDiemKpiManagedToolbar | items (managedRecords) → phongCounts, nhomCounts, danhGiaCounts (exclude-self) |
| **Tổng hợp chấm công – Nhân viên** | EmployeeAttendanceToolbar | items (rows) → deptCounts, branchCounts |
| **Tổng hợp chấm công – Realtime** | realtime-tab (filter inline) | rows → statusCounts, deptCounts, branchCounts (exclude-self) |
| **Chấm công – Lịch sử** | AttendanceHistoryToolbar | items (logs) → statusCounts (late/on_time/missing), branchCounts |
| **Sao lưu** | features/he-thong/sao-luu/index.tsx | SYSTEM_COLLECTIONS → nhomCounts (nhom_du_lieu) |
| **Cấp phát / Thu hồi tài sản** | CapPhatThuHoiToolbar | useCapPhatThuHoiFilterCounts — loai_phieu, id_noi_luu_truoc, id_nguoi_thuc_hien |
| **Danh sách tài sản** | DanhSachTaiSanToolbar, CuaToiTab | useDanhSachTaiSanFilterCounts — status, id_nhom, id_noi_luu, id_trang_thai |
| **Công việc** | CongViecToolbar (scope tab) | useCongViecFilterCounts — id_du_an, trang_thai, uu_tien, nguoi_thuc_hien |
| **Dự án** | DuAnToolbar | useDuAnFilterCounts — status, id_phong_ban, nam_bat_dau |
| **Phiếu hành chính (Managed / Của tôi)** | AdminFormToolbar | useAdminFormFilterCounts — status, type, shift |
| **Phòng ban** | PhongBanToolbar | useHierarchyRootFilter + statusOptions count |
| **Chức vụ** | ChucVuToolbar | items → statusOptions count |
| **Thiết lập tài sản** | NhomTaiSanToolbar, TrangThaiToolbar, NoiLuuToolbar | items → count status (NoiLuu + id_chi_nhanh) |
| **Chi nhánh** | ChiNhanhToolbar | items → statusOptions count |
| **Cấp bậc** | CapBacToolbar | items → statusOptions count |
| **Thiết bị đăng nhập** | ThietBiDangNhapToolbar | count theo devices |
| **Thiết lập tài liệu** | TrangThaiTaiLieuToolbar, LoaiTaiLieuToolbar | items → count status |
| **Nhân viên** | NhanVienToolbar | useFilterCounts (visible list) — ẩn option count = 0 |

---

## Module / Toolbar **chưa có count** (có FilterChipMultiSelect nhưng options chưa gắn count)

| Module | Toolbar / Vị trí | Ghi chú |
|--------|-------------------|--------|
| **Bảng lương – Của tôi** | BangLuongMyToolbar | Chỉ có yearMonth input, không có chip multi — bỏ qua. |
| **Báo cáo** | BaoCaoToolbarFilters / useBaoCaoFilterGroups | id_du_an, id_phong_ban, nguoi_ids — trang báo cáo không có list “items” (chỉ date range + filter cho chart/summary). Nếu sau này có list task/công việc trong khoảng thì truyền items và thêm hook đếm. |
| **Thống kê (tab)** | ThongKeTab (Cấp phát thu hồi, Danh sách tài sản, Bảng lương, Chấm điểm KPI) | Filter chip trong tab — nếu có list dữ liệu thống kê thì truyền items và gắn count tương tự. |

---

## Cách bổ sung count cho module còn thiếu

1. **Xác định list “visible”** tương ứng với màn/tab (sau phân quyền/scope).
2. **Toolbar:** thêm prop `items?: T[]`, gọi hook đếm (hoặc `useMemo` đếm từ `items` với chiến lược **exclude-self**).
3. **Options:** gắn `count: counts[key] ?? 0` (hoặc tương đương) cho từng option.
4. **Parent:** truyền list vào toolbar: `items={list}` / `items={scopeList}`.
5. **FilterChipMultiSelect** và **MobileFilterSheet** đã dùng `filterOptionsWithCount` → tự ẩn option count = 0 (trừ option đang chọn).

File chuẩn chung: `lib/filterOptionsWithCount.ts`, `docs/UI-CONVENTIONS.md`, `.cursor/rules/toolbar-filter-chip.mdc`.
