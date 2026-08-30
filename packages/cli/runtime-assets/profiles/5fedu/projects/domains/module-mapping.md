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

## Reproducible template reference (source-lock)

Mọi parity mapping phải dùng source-lock để pin exact template revision:

- File `source-lock.json` (project → harness) ghi exact repository URL + full 40-char commit SHA + integrity hash + module index + verification state.
- Module inventory tại `references/module-inventory.yaml` index modules + dependencies.
- Agent resolve source lock → `automation/14-materialize-template-source.ps1` → materialize pinned revision.
- Chỉ materialize module cần + dependencies, không load toàn bộ template.
- Materialize thất bại → dừng parity claims.
- Xem `source-lock-guide.md` cho flow chi tiết.

Parity packet `source.lock.yaml` có thể reference source-lock.json qua trường `source_lock_ref` hoặc độc lập ghi workspace identity + snapshot.

## Parity packet (bắt buộc, hard gate)

Trước mọi clone/audit, planner phải tạo **parity packet** tại `parity/<module>/`. Packet là nguồn mapping duy nhất có thẩm quyền cho worker; không có packet → không implement.

Cấu trúc packet:

| File | Vai trò |
|---|---|
| `source.lock.yaml` | Template identity + snapshot (Git commit/hash). Có thể ref source-lock.json qua trường `source_lock_ref` |
| `target.yaml` | Module key, surfaces, target paths, schema source |
| `structural-map.yaml` | Source → target: create/adapt/reuse, nesting, routes, state, data contracts, event flows |
| `visual-contract.yaml` | shell_must invariants, variable slot values, alignment, responsive breakpoints |
| `behavior-contract.yaml` | behavior_must, states, motion, accessibility, interaction flows |
| `architecture-adaptation.yaml` | preserve/adapt/must_not_copy, target equivalents, accepted deviations |
| `deviations.yaml` | Approved deviations (theo custom_deviation_contract của inventory) |
| `proof.yaml` | Verification evidence, cross-reference packet integrity |

Schema xác thực tại `profiles/5fedu/skills/5fedu-module-parity/references/schemas/*.schema.yaml`.
Packet phải validate trước khi giao worker bằng
`references/validate-parity-packet.py`. Xem workflow chi tiết tại
`references/workflow/planning-workflow.md` và example tại
`references/examples/nhap-hang/` của skill đã load.

### Clone checklist (module mới)

- Resolve source-lock.json → materialize pinned revision → verify integrity.
- Load inventory entry theo surface, xác minh local template identity/snapshot, chọn reference và mở đầy đủ file graph nguồn.
- **[Mới] Tạo parity packet** tại `parity/<module>/` — không implement trước khi packet hoàn tất.
- Ghi template source path + snapshot (source.lock.yaml + source_lock_ref to source-lock.json), copy map (structural-map.yaml) và variable map (visual-contract.yaml) trong parity packet; copy structural graph trước, rồi rename/adapt variable slot/domain logic.
- Thêm shell cần thiết: module factory/page, list + toolbar, form drawer, detail drawer, row/bulk actions; thêm stats, hierarchy hoặc child grid khi surface/spec yêu cầu.
- Thêm core (type/schema/constants/select), hooks, service và store/utils theo **reference đã mở**. Không tạo generic monolith/config page để né feature structure.
- Nối full route chain ở trên, rồi verify theo `ui-delivery.md` và detail reference.
- Worker chỉ implement sau khi nhận packet hoàn chỉnh theo
  `references/contracts/no-vision-worker-contract.md` của skill đã load.
- Không có template source đúng hoặc identity còn mơ hồ: block parity slice và hỏi owner; không dựng theo trí nhớ.

## Audit checklist (module cũ hoặc user báo lệch)

- Chọn mapping, mở route template và route target, **đối chiếu** code/contract của surface khớp rồi audit mọi surface liên quan thay vì chỉ control bị báo lỗi.
- **[Mới] Cập nhật parity packet** tại `parity/<module>/` — diff source với target, transplant shell fragment thiếu; cập nhật structural-map.yaml, visual-contract.yaml, behavior-contract.yaml, proof.yaml.
- Diff/transplant shell fragment thiếu từ source thật; giữ business logic target trừ phần đã map thay thế.
- Kiểm tra list toolbar/filter/search/column/pagination/export; form + detail là cặp; row-click, permission action, danger confirmation, child grid, stats và cross-module sync khi có.
- Kiểm tra route chain nếu tên/vị trí/permission đổi; validate motion, accessibility, responsive và interaction evidence theo detail reference.
- Ghi `Template reference` (source.lock.yaml), `Shell parity` (structural-map.yaml + visual-contract.yaml), `Variable map` (visual-contract.yaml variables), `Pattern fidelity` (behavior-contract.yaml), `Verification` (proof.yaml) và deviation được duyệt (deviations.yaml). Không đoán field/column từ ảnh hoặc module lỗi.
