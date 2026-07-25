# Checklist xây dựng module mới

Dùng checklist này khi tạo một module mới để tránh sót bước và đảm bảo **cùng độ đầy đủ** với các module chuẩn trong template (Nhân viên, Phòng ban, Chức vụ, Phân quyền…).

---

## Phạm vi & mức “đầy đủ”

- **Baseline (bắt buộc để gọi là module CRUD chuẩn):** list có toolbar + bảng (desktop) / card (mobile), form drawer, detail drawer, **tìm kiếm + filter** (theo một trong hai pattern dưới), chọn dòng + xóa nhiều, import/export (nếu nghiệp vụ có), phân quyền nút theo resource, flow detail ↔ form, i18n/text, route + menu.
  - **Pattern A — chip trên toolbar:** ô search tổng + `FilterChip*` trên desktop + `filterGroups` trên mobile.
  - **Pattern B — lọc/tìm theo header cột** (như Nhân viên / Phòng ban): **không** dùng chip desktop cho các filter đã chuyển xuống header; **mặc định vẫn có ô search tổng** trên toolbar (`searchTerm` + `matchesSearchTerm` / `SEARCHABLE_KEYS`, **AND** với `columnSearch` và filter khác). Chỉ dùng **`hideSearch`** khi product ghi nhận bàn giao *chỉ* tìm theo cột — và phải có mục kiểm tra QA tương ứng. Luôn giữ **badge + Xóa tất cả** + `filterGroups` **mobile** cho parity.
- **Nâng cao (tùy nghiệp vụ — không bắt buộc cho mọi module):** tab Thống kê, bulk edit sheet, in/xuất PDF, preview profile… Chỉ làm khi product yêu cầu; **lọc/sắp theo cột** là baseline nếu module chọn Pattern B (xem mục **6.8**, **7.4**).

---

## 1. Cấu trúc thư mục & core

- [ ] Tạo thư mục `features/<nhóm>/<module>/` (vd: `features/hanh-chinh/du-an/`).
- [ ] **core/types.ts**: Định nghĩa type entity (id, các trường hiển thị, quan hệ); type cho filters nếu phức tạp.
- [ ] **core/schema.ts**: Zod schema cho form (`XxxFormValues`); rule khớp với message validation trong i18n.
- [ ] **core/constants.ts** (nếu cần): Options trạng thái, enum hiển thị, map value → label.
- [ ] **core/supabase-select.ts** (khuyến nghị khi dùng Supabase): Chuỗi `select` tập trung + join/embed để list/detail không thiếu cột enriched (`ten_phong_ban`, …) — tránh lệch field giữa service và UI.

### 1a. Folder layout

- [ ] **`pages/`** chỉ route shell — logic nghiệp vụ trong `features/<domain>/<entity>/`.
- [ ] **React hooks** cross-cutting ở `hooks/` (không để `lib/use-*.ts`).
- [ ] **Factories CRUD** ở `lib/factories/` (`createFeatureModule`, `createFlatListFeatureModule`, `createHierarchyFeatureModule`).
- [ ] Module có UI: `index.tsx` re-export + `<entity>.module.tsx` wiring factory.

### 1b. queries/ (TanStack Query)

- [ ] Khi cùng query dùng ≥2 nơi: `queries/<entity>.ts` export `queryOptions()` factory.
- [ ] Hook + prefetch dùng chung `queryOptions()` — xem `lib/supabase/query-config.ts`.

### 1c. field-meta

- [ ] `core/*-field-meta.ts` map `DataTypeId` — xem [`docs/data-types.md`](data-types.md).
- [ ] Form: `RhfDataField` + field-meta; Detail: `formatValueByDataType`.

### 1d. Factory wiring

- [ ] Chọn factory phù hợp:
  - **`createFeatureModule`** — list + stats + CRUD đầy đủ (Nhân viên).
  - **`createFlatListFeatureModule`** — list phẳng, không hierarchy.
  - **`createHierarchyFeatureModule`** — cây phòng ban / chức vụ (`HierarchyListShell`).
- [ ] Truyền đủ props: `queryKeys`, service hooks, toolbar, columns, permissions resource.

### 1e. Imports & lint

- [ ] Cross-folder: `@/lib/...`, `@/components/...`, `@/hooks/...` — không `../../lib` hay `../../*` trở lên.
- [ ] Trong feature entity: relative `./`, `../core/` OK.
- [ ] Supabase service: `import { getSupabase } from '@/lib/supabase/client'` (static, không `import()`).
- [ ] Trước PR: `npm run lint:ci` · skill `.cursor/skills/import-lint/SKILL.md`.

---

## 2. Store (Zustand)

- [ ] **store/useXxxStore.ts**: `createGenericStore<Filters>(initialFilters, DEFAULT_COLUMNS)`.
- [ ] **Filters**: Đủ key cho mọi filter trên toolbar (search không nằm trong filters object nhưng đồng bộ clear); nếu có lọc theo cột, struct rõ ràng (vd `columnSearch`).
- [ ] **DEFAULT_COLUMNS**: Mỗi cột: `id`, `label`, `visible`, `minWidth`, `order`; cột `actions` nếu dùng pattern Sửa + menu ⋮ — khớp `TABLE_ACTION_COLUMN_WIDTH` (~92px) trừ khi cố tình rộng hơn.
- [ ] **initialFilters**: Giá trị mặc định ổn định (mảng rỗng, không `undefined` lẫn lộn).

---

## 3. API / Service

- [ ] **services/xxx-service.ts**: getList, getById, create, update, delete (và deleteList nếu có xóa nhiều).
- [ ] **importXxx** (nếu có Import): Nhận `ImportBatchRow[]`, trả `ImportResult` (`created`, `failed[]`); dùng `runImportBatch()`; normalize kiểu (chuỗi trim, FK null/empty).
- [ ] **List** trả về đủ trường cho **ô tìm kiếm tổng** và **cột bảng**: enriched (`ten_*`), text hiển thị cho enum (`*_text` nếu dùng).
- [ ] Lỗi Supabase/API: throw hoặc return shape thống nhất để hook hiển thị toast + message (vd `notFound`, `hasChildren`).

---

## 4. Hooks (React Query)

- [ ] **hooks/use-xxx.ts**: Query list, detail by id, create, update, delete (và import nếu có).
- [ ] **Invalidate** sau mutation: đúng `queryKeys` (xem mục 14) — tránh refetch sai cache.
- [ ] **useImportXxx(onSuccess?)** (nếu có): invalidate, toast tổng hợp lỗi từng dòng nếu API trả về.

---

## 5. Trang chính (index)

### 5.1 State & drawer

- [ ] State: `showForm`, `editingItem`, `detailItem`, (bảng con) `detailChild`, `showChildForm`, `openedFormFromDetailId`.
- [ ] Form/Detail drawer: **lazy import** + `Suspense` + fallback spinner nếu chunk lớn (giảm bundle trang list).

### 5.2 Lọc & tìm kiếm

- [ ] **filterFn** (client): **`searchTerm`** luôn kết hợp qua `matchesSearchTerm(item, searchTerm, SEARCHABLE_KEYS)` (`lib/searchUtils`) trừ khi module **không** có ô search tổng (đã ghi nhận). **Pattern B:** **AND** thêm **`columnSearch`** + helpers — không thay thế hoàn toàn ô tìm tổng trừ khi `hideSearch` có chủ đích.
- [ ] Filter theo chip (status, phòng ban, …): kết hợp AND với search; `activeFilterCount` khớp logic **Xóa tất cả bộ lọc**. **Pattern B:** filter “chip-level” chuyển sang header/mobile sheet — vẫn AND đúng trong `filterFn`.

### 5.3 CRUD & chọn nhiều

- [ ] **handleEdit**: Từ detail → set `openedFormFromDetailId` để **Hủy** mở lại detail.
- [ ] **handleCloseForm**: Nếu có `openedFormFromDetailId` → refresh detail + clear flag.
- [ ] **handleDeleteMany** onSuccess: Xóa cả bản ghi đang mở trong detail → `detailItem` / `detailChild` = null.
- [ ] Export: `exportData` useMemo (cột + header đúng ngôn ngữ), `handleExport` → `exportToExcel` (hoặc helper thống nhất).
- [ ] Import: `showImport`, `importColumns` (key/label/required), `importLookupSheets` / `useImportLookupSheets`, `ImportDialog`, wire toolbar.

### 5.4 Xác nhận xóa

- [ ] Xóa một / xóa nhiều: dùng `useConfirmStore` + copy từ `txt()` (`deleteTitle`, `deleteMessage`, `bulkDeleteTitle`, `bulkDeleteMessage`).

---

## 6. Toolbar (GenericToolbar + module toolbar)

Toolbar là **một hàng điều khiển** phía trên list; bắt buộc đủ **chức năng** sau (ẩn nút theo quyền, không ẩn cả khối nếu không cần).

### 6.1 Luôn có (desktop + mobile)

- [ ] **Ô tìm kiếm tổng trên toolbar**: `searchTerm` + `onSearchChange` + **`hideSearch` không bật** (hoặc `hideSearch={false}`) — trừ khi có quyết định rõ (xem **6.8**). Placeholder: `txt('common.searchPlaceholder')` trừ khi module cần gợi ý đặc thù.
- [ ] **`filterFn` / `useListWithFilter`**: luôn áp **`searchTerm`** qua `matchesSearchTerm` (hoặc tương đương) với **`*_SEARCHABLE_KEYS`** đủ cột + FK/enriched — **không** để tham số `term` bị bỏ qua (`_term`) khi ô search còn hiển thị.
- [ ] **Badge số bộ lọc đang bật** (`activeFilterCount`) + **Xóa tất cả** (`onClearAllFilters`) — reset cả search + mọi filter + (nếu có) column search.
- [ ] **Column manager**: `columns`, `onToggleColumn`, `onReorderColumns`, `onResetColumns` — đồng bộ store.

### 6.2 Filter UI

- [ ] **Desktop**: `filters` render `FilterChipMultiSelect` / single tùy nghiệp vụ — mỗi chip đồng bộ `filters` trong store.
- [ ] **Mobile**: `filterGroups` cho `MobileFilterSheet` (cùng options với desktop); label + icon từng nhóm.

### 6.8 Pattern “lọc ở header cột” (không chip desktop)

Áp dụng khi product/module chuyển filter chính sang **header** (`renderColumnHeaderAccessory` trên `GenericTable` / `HierarchyTable`).

- [ ] Store có **`columnSearch`** (và/hoặc filter đặc thù từng cột) + **sort** client/server thống nhất với `compareXxx` / service.
- [ ] **`filterFn`**: kết hợp `columnSearch` **AND** các filter còn lại; tránh lọc trùng (vd cột đã là MultiSelect trong header thì **không** áp thêm text search cùng key — xem util `*_column-search.ts` mẫu).
- [ ] Toolbar: **`filters={[]}`** hoặc không render chip cho những gì đã chuyển xuống header. **`hideSearch`**: *mặc định không dùng* — nếu bật, ghi chú trong spec module + bổ sung hàng kiểm tra **§17** (ô search ẩn có chủ đích).
- [ ] **`activeFilterCount`** + **`onClearAllFilters`**: đếm và reset **cả** `columnSearch`, sort, và filter mobile (trạng thái, cây gốc, …).
- [ ] **Mobile**: vẫn có **`filterGroups`** (hoặc sheet tương đương) để người dùng lọc khi không có header desktop.
- [ ] Empty state: phân biệt **không có dữ liệu** vs **không có kết quả sau lọc** (`common.noData` / `common.noResults`).

### 6.3 Khi có hàng được chọn (`selectedCount > 0`)

- [ ] Thanh bulk: **Bỏ chọn**, **Xóa** (nếu `canDelete`), đổi trạng thái hàng loạt (nếu nghiệp vụ có) — `bulkActions` / `onDeleteMany` / `onStatusChangeMany`.
- [ ] Mobile: `MobileActionsSheet` cho import/export/xóa nếu không đủ chỗ trên hàng chính.

### 6.4 Nút chính (theo quyền)

- [ ] **Thêm / Import / Export:** dùng `ListToolbarAddButton` / `ListToolbarIconButton` (`components/shared/ListToolbarActions.tsx`); không hardcode kích thước nút/icon — xem `lib/toolbar-list-actions.ts` và `docs/UI-CONVENTIONS.md` (Nút action listview).
- [ ] **Thêm**: `onAdd` + `BTN_ADD()` / icon Plus; ẩn khi `!canCreate`.
- [ ] **Export**: ẩn khi `!canExport`.
- [ ] **Import**: ẩn khi `!canImport`.
- [ ] **Back** (`showBack`): khi module là trang con; `onBack` tùy chọn — mặc định dùng breadcrumb/parent path.

### 6.5 Tùy chọn

- [ ] **`desktopStartSlot`**: TabGroup (vd List | Thống kê) chỉ desktop — khớp pattern Nhân viên nếu có tab.
- [ ] **`searchTrailing`**: Phụ kiện nhỏ cạnh ô search (vd combobox nhanh).

### 6.6 Quyền

- [ ] Trong component toolbar: `useResourcePermissions('<resource>')` — chỉ render nút khi đúng `can*` (xem mục 13).

### 6.7 Nhãn nút (chuẩn ngắn)

- [ ] Toolbar **Thêm**: `txt('common.addNew')` hoặc `BTN_ADD()` — nội dung **Thêm** (không “Thêm mới” trên nút trừ khi product bắt buộc).
- [ ] Form drawer: `FormDrawerFooter` mặc định — **Lưu** / **Thêm** / **Hủy** qua `lib/button-labels.ts` + `common.*` trong `lib/text/ui.ts`; ưu tiên **`compact` + `footerCompact`**; **không** nhân bản `form.save` / `form.create` trong `text.ts` nếu chỉ trùng nghĩa.
- [ ] Chi tiết drawer: `BTN_CLOSE`, `BTN_EDIT`, `BTN_DELETE` (thứ tự xem `lib/button-labels.ts`).
- [ ] Quy tắc đầy đủ: [patterns-button-labels.md](./patterns-button-labels.md).

---

## 7. Bảng danh sách & mobile card

### 7.1 GenericTable (desktop)

- [ ] **Cột dữ liệu** khớp `DEFAULT_COLUMNS` (thứ tự + visibility); `renderCell(colId, item)` — badge trạng thái, format ngày/số qua helper chung (`lib/fmt`, v.v.).
- [ ] **Checkbox**: chọn dòng + chọn tất cả trang; `selectedIds` từ store.
- [ ] **Sort**: `sort` + `onSort` nếu module hỗ trợ — hoặc sort chỉ qua header phụ (khi `hideSortOnColumnLabel`).
- [ ] **Phân trang**: `page`, `pageSize`, `onPageChange`, `onPageSizeChange`; footer đếm bản ghi (copy chuẩn từ module mẫu).
- [ ] **Loading**: `isLoading` → spinner + `loadingText` từ `txt()`.
- [ ] **Empty**: `emptyTitle`, `emptyDescription`, optional `emptyAction` (vd nút Thêm).
- [ ] **Sticky**: cột trái (checkbox + cột đầu) / cột phải (actions) theo `stickyLeftCount` và minWidth.
- [ ] **Virtual scroll**: bật mặc định khi dữ liệu lớn — giữ behavior như module mẫu.
- [ ] **Summary row** (nếu có): `renderSummaryRow` — optional.

### 7.2 Mobile: `renderMobileCard`

- [ ] Một card = một bản ghi: hiển thị các trường chính + tap mở detail; checkbox chọn; actions (Sửa / menu) nhất quán desktop.
- [ ] Không để mất **chức năng** so với desktop (xem được, sửa, xóa — theo quyền).

### 7.3 Cột Thao tác

- [ ] Pattern khuyến nghị: **một nút Sửa** + **`RowActionsOverflowMenu`** (`components/shared/row-actions`) — thêm quyền `aria-label`, tooltip.
- [ ] `minWidth` cột `actions` đủ cho icon; không để vỡ layout khi tên dài (truncate ở cột text).

### 7.4 Lọc / sort theo header cột (bắt buộc nếu module dùng Pattern B)

- [ ] Bảng hỗ trợ **`renderColumnHeaderAccessory`** (đã có trên `GenericTable`, `HierarchyTable`).
- [ ] Mỗi cột cần lọc: accessory = sort menu + ô tìm / MultiSelect (reuse `EmployeeColumnHeaderSearch`, `EmployeeColumnHeaderFilter`, … hoặc tách shared sau).
- [ ] **`columnSearch`** (và logic đếm active) đồng bộ với toolbar **Xóa tất cả** và export (dữ liệu xuất = dữ liệu đã lọc **giống** list).
- [ ] Sort sau filter (hoặc server sort): thứ tự rõ ràng trong `index`/hook — tránh sort trên full list rồi mới filter (sai kết quả).

---

## 8. Form (drawer) — quy tắc UI & validation

### 8.1 Vỏ

- [ ] **GenericDrawer** (hoặc FormDrawer thống nhất): `title` + icon; `onClose` gọi parent `handleCloseForm`.
- [ ] **Footer**: **FormDrawerFooter** — `formId`, Hủy, Lưu / **Tạo** khi thêm mới (`createLabel` + icon); `isLoading` khi mutation pending; `compact` nếu module dùng.

### 8.2 React Hook Form + Zod

- [ ] `useForm` với `zodResolver(schema)`; type `Resolver<XxxFormValues>`.
- [ ] `defaultValues` / `reset` khi `initialData` hoặc thêm mới — đồng bộ với schema (chuỗi rỗng vs null theo quy ước service).

### 8.3 Bố cục

- [ ] **FormSection** (tiêu đề nhóm) + **FormGrid** (`cols={1|2|3}`): mobile 1 cột, sm+ nhiều cột.
- [ ] Trường đặc thù: **Controller** cho select/combobox/switch.

### 8.4 Trường bắt buộc & lỗi

- [ ] Trường **bắt buộc** trong schema → trên UI component (`Input`, v.v.) set **`required`** → hiển thị **dấu \* màu đỏ** (`text-destructive`, `aria-hidden` trên sao) — xem `components/ui/Input.tsx`.
- [ ] Hiển thị `errors.<field>.message` dưới control; `aria-invalid`, `aria-describedby` tới dòng lỗi (đã hỗ trợ ở Input).
- [ ] Nút submit: `disabled` hoặc loading khi đang gửi; tránh double submit.

### 8.5 Sanitize trước khi gửi

- [ ] Trim chuỗi, chuẩn hóa null/empty FK giống module mẫu (tránh gửi `""` khi DB cần `null`).

---

## 9. Detail (drawer)

### 9.1 Thứ tự block (từ trên xuống)

- [ ] **Summary card** (trên **DetailToolbar**): bố cục **chuẩn template** — **hàng 1:** icon + **title + badge trạng thái** cùng hàng (flex, badge không “lơ lửng”); **hàng 2:** mã / mã số (`subtitle` hoặc `DetailField` tương đương); meta (ngày, cấp, …) tiếp theo nếu có. Tham chiếu trực quan: module **Chức vụ** (`chuc-vu-detail`).
- [ ] **DetailToolbar**: hành động “nổi bật” (đổi trạng thái, thêm bản ghi con, …) — chỉ hiện khi `canEdit` / đúng nghiệp vụ.
- [ ] **DetailSection** + **DetailField**: nhóm “Thông tin chung”, “Liên hệ”, … — mỗi field một label + value.
- [ ] **DetailSystemSection** (`components/shared/DetailSystemSection.tsx`): section hệ thống **luôn cuối** drawer (tg tạo, cập nhật, người tạo nếu có); không đặt bảng con phía sau.

### 9.2 Chi tiết hiển thị

- [ ] Giá trị rỗng: **DetailField** dùng `emptyText` mặc định (“Chưa cập nhật”) hoặc override — thống nhất module.
- [ ] Enum/ID: hiển thị **nhãn người đọc**, không raw id (dùng data enriched hoặc map constants).

### 9.3 Hành động inline

- [ ] **DetailField** `trailing`: nút nhỏ cạnh giá trị (sao chép, sửa nhanh) — phân bổ qua `partitionDetailActions` + `lib/detail-action-placement.ts` (`prominent` vs `inline`).

### 9.4 Footer detail

- [ ] **Đóng** | **Sửa** (`canEdit`) | **Xóa** (`canDelete`); ẩn đúng quyền.

### 9.5 Bảng con (nếu có)

- [ ] **Ưu tiên `EmbeddedChildDataGrid`** (`components/shared/EmbeddedChildDataGrid.tsx`): cột + `renderCell` + **hàng đủ actions** — pattern **`XxxTableRowActions`** (compact) + `RowActionsOverflowMenu`, **không** dàn nút icon raw trên từng dòng trừ khi product bắt buộc.
- [ ] **Tối đa 5 dòng body** hiển thị; cuộn dọc nếu nhiều hơn — constant `lib/detail-sub-table.ts` (`DETAIL_SUB_TABLE_MAX_BODY_ROWS`).
- [ ] Tránh “double card”: dùng `containerClassName` (vd `border-0 shadow-none`) khi grid nằm trong **DetailSection** đã có viền.
- [ ] Card section: tiêu đề + **EmptyState** + bảng; click dòng → mở detail con hoặc drawer con.
- [ ] Xóa con: `onChildDeleted?.(id)` để parent đóng drawer con nếu đang xem đúng id.

---

## 10. Flow chi tiết (last-view)

- [ ] **List → Sửa/Thêm → Hủy/Lưu**: Quay **List** (`FormViewOrigin = 'list'` — `lib/last-view-flow.ts`).
- [ ] **Detail → Sửa/Thêm con → Hủy/Lưu**: Quay **Detail** (`FormViewOrigin = 'detail'`); factory truyền `onEdit(item, 'list'|'detail')` đúng nguồn.
- [ ] **Detail → Sửa → Lưu**: Invalidate + refresh bản ghi detail (`syncDetailOnFormClose` / cache).
- [ ] **Xóa con trong detail**: Đồng bộ đóng drawer con (mục 9.5).
- [ ] **Xóa nhiều**: Nếu id đang xem ∈ danh sách xóa → clear detail.

---

## 11. i18n & text

- [ ] Chuỗi UI: ưu tiên **`features/<module>/text.ts`** export object + `txt()` (`lib/text`) — hoặc key trong `locales` tùy chuẩn dự án; thống nhất một kiểu trong module.
- [ ] Tối thiểu cần key: loading, empty, emptyHint, delete/bulk delete, toast CRUD/import, form title/label/placeholder/save/create, tên cột (export + column manager), detail section, validation messages, toolbar (export/import/filter).
- [ ] Ô tìm kiếm list: dùng `common.searchPlaceholder` nếu không có gợi ý đặc thù.

---

## 12. Route & menu

- [ ] Đăng ký route trong router (path, `element`, lazy nếu khối lớn).
- [ ] Sidebar/menu: icon, label, **đúng `moduleId`** để khớp phân quyền và (nếu có) trang hướng dẫn.

---

## 13. Phân quyền (client UX + RLS)

Chi tiết: [`docs/patterns-permissions.md`](patterns-permissions.md) · rule `.cursor/rules/08-permissions.mdc`.

- [ ] Thêm **`AppResource`** + **`APP_RESOURCE_TO_MODULE`** trong `lib/permissions.ts`.
- [ ] Đăng ký module trong ma trận phân quyền + RLS `has_module_permission`.
- [ ] Toolbar: `useResourcePermissions(resource)`; row/detail có `nguoi_tao`: **`useCanOnRecord`**.
- [ ] Form: chặn save theo create / edit record; service set **`nguoi_tao`** khi create/import.
- [ ] Nav: entry trong `lib/module-nav-config.ts`; route bọc **`ModulePermissionRoute`**; sidebar giữ Bản quyền.
- [ ] **Ghi nhớ**: `can()` chỉ UX; **RLS** phải khớp (cap_bac=1, nguoi_tao, matrix tokens).

---

## 14. Query keys & Supabase

- [ ] Thêm nhánh trong **`lib/query-keys.ts`** (`all`, `list` nếu có tham số, `detail(id)`…) — mutation invalidate đúng key.
- [ ] List query dùng **cùng params** giữa hook và constant (tránh cache trùng tên khác param).

### 14b. Supabase egress

- [ ] Xem [`docs/supabase-egress.md`](supabase-egress.md): `select` chỉ cột cần, `returningSelect` sau mutation, tránh fetch full row không dùng.
- [ ] List lớn: server pagination + narrow invalidation.

### 14c. Server pagination & invalidate prefix

- [ ] Đăng ký `pagePrefix` trong `lib/query-keys.ts`; invalidate bằng prefix — **không** gọi factory function làm queryKey.
- [ ] Sau create/update/delete: patch cache → invalidate count/page prefix → tránh `invalidate all` trừ bulk/import.

---

## 15. Tính năng tùy chọn (parity “Nhân viên đầy đủ”)

Chỉ triển khai khi spec yêu cầu; mỗi mục có thể thành phase sau.

- [ ] Tab **Danh sách | Thống kê** + component stats riêng.
- [ ] **Lọc/sắp xếp theo cột** (header accessory + state trong store).
- [ ] **Bulk edit** (sheet) cho vài field hàng loạt.
- [ ] **In / PDF / export profile** từ detail.
- [ ] **Preview** route riêng (vd profile) — lazy load.

---

## 16. Trang hướng dẫn (nội dung người dùng)

- [ ] Theo **`docs/GUIDE-CONTENT.md`**: thêm key `guide.modules.<submenu>_<moduleSlug>.*` trong `locales/guide.json` (intro, overview, permissions, workflow, quickStart, glossary, faq, contact) — tránh fallback “đang cập nhật”. *Template phase 1: deferred.*

---

## 17. Kiểm tra cuối (QA)

- [ ] Tìm kiếm: thử từng từ khóa trên mọi cột/enriched đã khai báo trong `SEARCHABLE_KEYS` **hoặc** (Pattern B) từng ô **header column search** + sort từng cột.
- [ ] **Pattern A:** Từng filter chip + **Xóa tất cả** + đếm `activeFilterCount` đúng. **Pattern B:** không chip desktop nhưng **Xóa tất cả** vẫn xóa hết `columnSearch` + filter sheet + sort + **`searchTerm`**; đếm badge đúng.
- [ ] **Ô search tổng:** trên desktop (và breakpoint hỗ trợ) thấy ô search trên toolbar khi `hideSearch` không bật; gõ từ khóa → list lọc đúng (đồng bộ code `filterFn`).
- [ ] Mobile: mở **filter sheet**, đổi filter — kết quả khớp desktop (cùng store).
- [ ] Thêm / Sửa / Xóa một / Xóa nhiều; toast đúng; list refresh.
- [ ] Detail → Sửa → Hủy → detail cũ; Detail → Sửa → Lưu → detail mới.
- [ ] Detail có bảng con: xóa dòng đang mở detail → drawer con đóng.
- [ ] Export: đúng cột, tên file, encoding; Import: template có sheet `Du_lieu` + lookup; batch + tiến trình; partial success; tải file lỗi `.xlsx`; import bù dòng lỗi.
- [ ] Form: mọi trường required có `*` đỏ + validation hiển thị khi submit sai.
- [ ] Mobile: thao tác chính tương đương desktop (không “mất” nút).
- [ ] Quyền: user không có quyền không thấy nút tương ứng (smoke test `can*`).

---

## 18. Prefetch master data

- [ ] Prefetch `queryOptions()` on mount cho master data dùng trong form (phòng ban, chức vụ, …) — pattern `features/he-thong/nhan-vien/`.

---

## 19. Test tối thiểu

- [ ] `core/schema.test.ts` — validation edge cases.
- [ ] Service test khi logic phức tạp (normalize, FK, hierarchy rules).
- [ ] Không bắt buộc test mọi component UI.

---

*File này tham chiếu chuẩn từ các module: Nhân viên, Phòng ban, Chức vụ, Phân quyền. Cập nhật khi có quy ước UI/API mới.*
