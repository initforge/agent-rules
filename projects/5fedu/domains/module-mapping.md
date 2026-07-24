# Module mapping — UI → template

**Vai trò:** Chọn reference trước khi clone/audit. Template authority là code local đã verify theo workflow ở `ui-delivery.md`; URL repo chỉ là định danh, không thay thế code local hay một đường dẫn máy cố định.

Trước khi chọn reference, load surface khớp trong [`references/pattern-inventory.yaml`](references/pattern-inventory.yaml): đó là source canonical cho `shell_must`, behavior/state/motion/responsive và variable slots; file này chỉ map module → baseline và checklist.

## Reference theo behavior

| Surface/behavior | Module hoặc primitive tham chiếu | Dùng khi |
|---|---|---|
| CRUD list, form, detail, row actions, confirm danger | **Nhân viên** | Entity quản trị nội bộ và CRUD chuẩn |
| Hierarchy hai cấp, embedded child grid | **Phòng ban** | Quan hệ parent–child có thật |
| Entity theo parent | **Chức vụ** trong trục Phòng ban | Không được tách entity khỏi parent axis |
| Stats/report tab-view | **Thống kê Nhân viên** | Có KPI/chart/report riêng |
| Print/PDF/export | Helper/export đang sống của reference | Cần export dữ liệu thật; cột map đúng scope/data |
| Permission matrix | **Phân quyền** | Registry + quyền + trạng thái save |
| Single-record settings | **Thông tin công ty** | Một bản ghi cấu hình |

Các mapping nghiệp vụ dự án (Nostime retail/luxury, kho serial, NXT) chỉ lấy từ `archive/nostime/` hoặc spec dự án khi router yêu cầu; không nâng thành default 5fedu.

## Chain mapping và route

```text
spec → submenu → module → view → tab → route → breadcrumb registry → table/service
```

- Submenu dùng tiếng Việt; view có thể hybrid như `nhan-vien-form`; module key Supabase là slug không dấu.
- Mọi route product đã đăng ký phải cập nhật route host (`App.tsx`), sidebar, module registry, route guard và permission matrix cùng lúc.
- **Breadcrumb rule:** với mỗi route product mới, thêm **exact path** vào `getRouteConfig()` của `src/components/shared/Breadcrumbs.tsx`, dùng `label` tiếng Việt Unicode đầy đủ dấu và `parentPath` của phân hệ (ví dụ template `/he-thong/nhan-vien` có parent `/he-thong`). Sidebar không tự sinh breadcrumb; tuyệt đối không để product label rơi vào slug/capitalization fallback.

## Clone checklist (module mới)

- Load inventory entry theo surface, xác minh local template identity/snapshot, chọn reference và mở đầy đủ file graph nguồn.
- Ghi template source path + snapshot, copy map và variable map trong parity packet; copy structural graph trước, rồi rename/adapt variable slot/domain logic.
- Thêm shell cần thiết: module factory/page, list + toolbar, form drawer, detail drawer, row/bulk actions; thêm stats, hierarchy hoặc child grid khi surface/spec yêu cầu.
- Thêm core (type/schema/constants/select), hooks, service và store/utils theo **reference đã mở**. Không tạo generic monolith/config page để né feature structure.
- Nối full route chain ở trên, rồi verify theo `ui-delivery.md` và detail reference.
- Không có template source đúng hoặc identity còn mơ hồ: block parity slice và hỏi owner; không dựng theo trí nhớ.

## Audit checklist (module cũ hoặc user báo lệch)

- Chọn mapping, mở route template và route target, **đối chiếu** code/contract của surface khớp rồi audit mọi surface liên quan thay vì chỉ control bị báo lỗi.
- Diff/transplant shell fragment thiếu từ source thật; giữ business logic target trừ phần đã map thay thế.
- Kiểm tra list toolbar/filter/search/column/pagination/export; form + detail là cặp; row-click, permission action, danger confirmation, child grid, stats và cross-module sync khi có.
- Kiểm tra route chain nếu tên/vị trí/permission đổi; validate motion, accessibility, responsive và interaction evidence theo detail reference.
- Ghi `Template reference`, `Shell parity`, `Variable map`, `Pattern fidelity`, `Verification` và deviation được duyệt (nếu có). Không đoán field/column từ ảnh hoặc module lỗi.
