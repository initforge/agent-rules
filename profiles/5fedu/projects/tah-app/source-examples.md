# Tah-app Source Examples

**Purpose:** Tah-app-specific source examples extracted from evidence.  
**Routing:** Load only when working on Tah-app.

## Module/view/tab map

| Submenu | Group | View/Module | Tabs |
|---|---|---|---|
| Hệ thống | Sơ đồ | Phòng ban | |
| Hệ thống | Sơ đồ | Chức vụ | |
| Hệ thống | Sơ đồ | Nhân viên | |
| Hệ thống | Thiết lập khác | Thông tin công ty | |
| Hệ thống | Thiết lập khác | Phân quyền | |
| Quản lý vận tải | Kế hoạch | Chuyến xe | List, List CT |
| Quản lý vận tải | Kế hoạch | Bảng lương | List |
| Quản lý vận tải | Kế hoạch | Thống kê chuyến | Date/driver/location/vehicle/labor/cost |
| Quản lý vận tải | Kế hoạch | Thống kê lương | Date/driver |
| Quản lý vận tải | Thiết lập | Tài xế | |
| Quản lý vận tải | Thiết lập | Địa điểm | |
| Quản lý vận tải | Thiết lập | Danh sách xe | |

## Transport tables (`vt_`)

| Table | Notes |
|---|---|
| `vt_tai_xe` | Merged into `var_nhan_vien` with `la_tai_xe` flag |
| `vt_xe` | Vehicle registry |
| `vt_dia_diem` | Locations with default labor cost |
| `vt_chuyen_xe` | Trip parent |
| `vt_chuyen_xe_ct` | Trip children (location details) |
| `vt_luong` | Monthly payroll per driver |
