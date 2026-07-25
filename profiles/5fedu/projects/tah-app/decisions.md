# Tah-app Decisions

**Scope:** Tah-app only. Generic 5fedu decisions → `organization/` or `domains/`.

## Quyết định đã chốt

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Transport modules (vận tải) | DA_CHOT | Tài xế, địa điểm, xe, chuyến xe, bảng lương |
| Module mapping from transport sheet | DA_CHOT | Sidebar: Quản lý vận tải -> Hệ thống -> Thông tin bản quyền |
| Driver as employee role (`la_tai_xe` flag) | DA_CHOT | Not separate table |
| Trip approval = parent-level lock | DA_CHOT | Approved trips lock children |
| Payroll = hand-enter + print slip | DA_CHOT | No auto-timekeeping |
| Stats tab for trips | DA_CHOT | Filter by date/driver/location/vehicle |

## Open questions

- `vt_` prefix vs other prefix convention?
- Schema drift tracking procedure?
