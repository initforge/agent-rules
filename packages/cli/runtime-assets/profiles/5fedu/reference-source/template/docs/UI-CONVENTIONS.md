# Quy ước giao diện (UI Conventions)

## Trang submenu (dashboard nhóm)

- **Tên nhóm module** (vd. "Nhân sự", "Bảo mật & cấu hình" trên Hệ thống) **luôn dùng màu primary** (`text-primary`).
- Áp dụng cho mọi trang submenu có danh sách nhóm + module (Hệ thống, và sau này Hành chính, Nhân sự, Marketing, Tài chính, Mua hàng, Kho vận khi đã có trang thật).
- Cách làm: dùng component **`ModuleDashboardLayout`** (`components/dashboard/ModuleDashboardLayout.tsx`), truyền `groups` với `groupTitle` và `items`. Component đã style `groupTitle` bằng `text-primary`.
- Trang placeholder submenu (chưa xây): tên nhóm cũng dùng primary qua **`ComingSoonLayout`** với prop `titlePrimary={true}` (vd. trong `SubmenuPlaceholder` hoặc `ModuleDashboardLayout`).

## Dialog và Drawer (kích thước thống nhất)

- **Nguồn constant:** `lib/dialog-sizes.ts`.
- **Dialog (modal giữa màn hình):** dùng `DIALOG_SIZE`:
  - `CONFIRM` (max-w-sm): xác nhận đơn giản (xóa, hủy thao tác).
  - `COMPACT` (max-w-md): lựa chọn nhanh (picker đơn giản).
  - `MEDIUM` (max-w-lg): nội dung vừa.
  - `LARGE` (max-w-2xl): import, export, upload (max-h 85vh).
  - `XL` (max-w-4xl): popup drill-down / preview bảng dữ liệu (tab Thống kê).
  - `WIDE` (max-w-6xl): preview rộng, nhiều cột.
- **Shell dialog dùng chung:** `AppDialog` (`components/shared/AppDialog.tsx`) — z-index `Z_INDEX_DATA_DIALOG_CLASS` (180), chiều cao `DIALOG_MAX_HEIGHT`.
- **Phân tầng overlay:** drawer mặc định (60) → data dialog (180) → drawer trên data dialog (190) → confirm modal (200). Drawer mở từ popup drill-down: `GenericDrawer` với `overlayTier="aboveDataDialog"`.
- **Drawer (slide từ phải):**
  - **Form và Detail dùng chung kích thước:** 48rem (768px). Dùng `DRAWER_WIDTH_FORM` / `DRAWER_WIDTH_DETAIL` hoặc `getDrawerWidthClass(0)`.
  - **Drawer chồng:** khi mở drawer trên một drawer đang mở (vd. Form mở từ Detail), drawer ở trên dùng **44rem** và z-index cao hơn. Truyền `stackLevel={1}` (hoặc cao hơn) cho `GenericDrawer`; width lấy từ `getDrawerWidthClass(stackLevel)`.
  - **Drawer rộng (form + panel phụ):** `DRAWER_WIDTH_WIDE` (82rem) — form phức tạp hai cột.
  - **Detail compact (nested):** `DRAWER_WIDTH_DETAIL_SMALL` (36rem) — detail mở từ drawer khác khi cần hẹp.
- **GenericDrawer:** prop `stackLevel` (mặc định 0). `stackLevel > 0` → width 44rem, z-index tăng theo level.

## Section trong Form và Detail

- **Tiêu đề section luôn màu primary.** Dùng component **`Section`** (hoặc **`FormSection`** / **`DetailSection`**) trong form và detail.
- **Mặc định:** `variant="primary"` (không cần truyền) → tiêu đề `text-primary`, border `border-primary/20`.
- **Ngoại lệ:** Chỉ dùng `variant="muted"` khi section thực sự phụ, ít cần nhấn mạnh (ít dùng).
- Áp dụng thống nhất cho mọi module (nhân viên, cấp bậc, chức vụ, v.v.) để giao diện đồng bộ.

## Trường bắt buộc trong form (Required fields)

- **Trường bắt buộc phải có dấu sao (*) bên cạnh label.** Component **Input** và **Textarea** (`components/ui/`) đã hỗ trợ prop **`required`**: khi `required={true}` sẽ render `<span className="text-red-500 ml-0.5">*</span>` cạnh label.
- **Quy ước:** Mọi form (drawer, dialog, page form) phải truyền **`required`** cho các trường bắt buộc (vd. tên, mã, nội dung câu hỏi). Validation vẫn dùng schema (zod, yup, v.v.); prop `required` chỉ dùng để hiển thị dấu sao, giúp người dùng nhận biết trường bắt buộc.
- **Áp dụng:** Tất cả module (thiết lập khóa học, nhân viên, hợp đồng, v.v.) dùng chung quy ước này.

## Design system (border radius, button, error)

- **Border radius:** Dùng 2–3 mức thống nhất.
  - `rounded-lg`: form control (input, select, textarea, combobox), nút thường, chip.
  - `rounded-xl`: card, panel, dropdown list, section.
  - `rounded-2xl`: modal, drawer, dialog, thẻ lớn (MainCard).
  - Tránh trộn `rounded-md` với `rounded-lg` cho cùng mục đích; ưu tiên `rounded-lg` cho form.
- **Button height:** Chuẩn theo size (Button component / toolbar).
  - `sm`: `h-8` (32px).
  - `default`: `h-10` (40px).
  - `lg`: theo thiết kế (vd. `h-11`). Toolbar và action trong form nên dùng sm hoặc default thống nhất.
- **Error message (form):** Luôn dùng `text-xs` cho thông báo lỗi dưới input/select/textarea (Input, Select, Textarea, Combobox). Không đổi sang `text-sm` để giữ đồng bộ và tiết kiệm không gian.

## Toolbar và Filter chip (màn mới)

- **Toolbar mới:** Luôn truyền `filters` bằng **FilterChipMultiSelect** hoặc **FilterChipSingleSelect** (từ `components/shared/`). Không tự viết dropdown multi-select riêng.
- **Quy chuẩn filter chip:** Mỗi dropdown có "Chọn tất cả" (trái) và nút "Xóa chọn" (phải); đã implement trong **MultiSelect** và **MobileFilterSheet**.
- **Mobile:** Truyền đủ **filterGroups** cho **GenericToolbar** để dùng **MobileFilterSheet** (mỗi nhóm filter có "Xóa chọn" theo nhóm).
- **Count và ẩn option rỗng (chuẩn chung):**
  - **Count thực tế:** Khi filter chip hiển thị count (số lượng), danh sách dùng để đếm phải là **danh sách người dùng được phép xem** (sau phân quyền). Toolbar nhận prop danh sách đó (vd. `employees`, `items`) và hook đếm (vd. `useFilterCounts`) đếm trên chính list đó.
  - **Chỉ hiện option có dữ liệu:** Option có `count === 0` (và không đang chọn) được ẩn. Util **`filterOptionsWithCount`** (`lib/filterOptionsWithCount.ts`) và prop **`hideZeroCount`** (mặc định `true`) trên **FilterChipMultiSelect** / **MobileFilterSheet** đảm bảo điều này; toolbar chỉ cần truyền `options` có field `count`, không cần lọc tay.
- **Ví dụ:** Xem `CapPhatThuHoiToolbar`, `nhan-vien-toolbar` (có count); các `*-toolbar.tsx` khác: `filters` = nhiều `<FilterChipMultiSelect />`, `filterGroups` = mảng `{ key, label, icon, options, value, onChange }` khớp với từng filter.

### Nút action listview (Thêm, Import, Export)

- **Component dùng chung:** `ListToolbarIconButton` (Import/Export) và `ListToolbarAddButton` (Thêm) từ `components/shared/ListToolbarActions.tsx`.
- **Constants:** `lib/toolbar-list-actions.ts` — class Tailwind chuẩn; không hardcode `h-9 w-9` hay icon responsive `w-5 sm:w-4` cho các nút này.
- **Spec:**

| Nút | Button | Icon | Label |
|-----|--------|------|-------|
| Import / Export | `h-8 w-8 p-0`, `variant="outline"`, touch 44px mobile | `w-4 h-4` (16px) | Tooltip |
| Thêm | `h-8 px-3`, primary, `shadow-sm` | `Plus` `w-4 h-4 mr-1.5` | `text-xs`, `BTN_ADD()` |

- **Tham chiếu:** `features/he-thong/nhan-vien/components/nhan-vien-toolbar.tsx`.

### Pattern B — lọc / tìm theo header cột

Module hierarchy hoặc list lớn (Nhân viên, Phòng ban, Chức vụ) có thể chuyển filter sang **header cột** thay vì chip desktop:

- Giữ **ô search tổng** trên toolbar (`searchTerm` + `matchesSearchTerm` / `SEARCHABLE_KEYS`) trừ khi product ghi nhận `hideSearch`.
- Filter theo cột lưu trong store (`columnSearch`); kết hợp **AND** với search tổng trong `filterFn`.
- Desktop: không hiển thị chip trùng filter đã có ở header; mobile vẫn dùng `filterGroups` + **MobileFilterSheet** cho parity.
- Badge **Xóa tất cả** reset `searchTerm`, `columnSearch`, sort, và filter sheet.
- Shared components: column header search/sort trong `components/shared/` (GenericTable accessories).
- Chi tiết QA: `docs/checklist-module.md` mục **6.8**, **7.4**.

## Pattern docs (companion)

- [Nhãn nút & toolbar actions](patterns-button-labels.md)
- [Hành động bảng dữ liệu](patterns-data-table-actions.md)
- [Data types & field-meta](data-types.md)

## Tab Thống kê — filter thời gian (DateRangePicker)

Áp dụng cho mọi tab **Thống kê** có filter chip khoảng thời gian (vd. Nhân viên). Tham chiếu: `lib/stats-date-range.ts`, `components/ui/DateRangePicker.tsx`, `features/he-thong/nhan-vien/`.

- **Mặc định:** preset `all` (`DEFAULT_STATS_DATE_PRESET_ID`) — **không lọc theo thời gian**, hiển thị toàn bộ dữ liệu. Chip hiển thị placeholder (`employee.stats.dateRangePlaceholder`), **không** gán sẵn "Tháng này".
- **Component:** dùng **`DateRangePicker`** với `presets` lấy từ `STANDARD_STATS_DATE_PRESET_IDS` + `custom`. Khi `preset === 'all'`: không truyền `displayLabel` (để trigger hiện placeholder).
- **Preset chuẩn** (thứ tự trong grid "Chọn nhanh"):
  1. Tất cả (`all`)
  2. Tuần này / Tuần trước
  3. 7 ngày qua
  4. Tháng này / Tháng trước
  5. 30 ngày qua
  6. Quý này / Quý trước
  7. 6 tháng qua
  8. Năm nay / **Năm trước**
  9. Tùy chọn (`custom`) — nhập Từ/Đến ngày
- **Logic lọc:** preset `all` → bỏ qua điều kiện "as-at" theo ngày vào làm; các preset khác → lọc headcount tại `dateRange.end`. Helper: `shouldApplyStatsAsAtFilter()`, `isAllStatsDateRange()`.
- **Xóa bộ lọc:** reset về `all` cùng với phòng ban / trạng thái; đếm filter active chỉ tính thời gian khi `preset !== 'all'`.
- **Chuỗi UI:** thêm key trong `features/<module>/text.ts` dưới `stats.preset.*` và `stats.dateRangePlaceholder`; không hardcode trong component.
- **Phân quyền:** non-admin vẫn clamp range tối đa 12 tháng (`clampDateRangeForRole`); preset `all` không bị clamp.

## Bảng trong tab Thống kê (stats table)

Áp dụng cho bảng số liệu tổng hợp trong tab **Thống kê** (vd. theo phòng ban, theo trạng thái).

- **Giao diện:** đồng bộ listview (`GenericTable` desktop) — `bg-muted` thead, `even:bg-muted/15`, `hover:bg-accent`, `tabular-nums`, không checkbox/cột Thao tác CRUD.
- **Viewport:** tối đa **10 dòng body** hiển thị; nhiều hơn cuộn dọc trong vùng bảng. Constants: `lib/stats-table.ts` (`STATS_TABLE_MAX_BODY_ROWS`, `getStatsTableScrollMaxHeightCss()`).
- **Phân trang:** `TablePaginationFooter`, page size mặc định **10** (`STATS_TABLE_DEFAULT_PAGE_SIZE`); options `[10, 20, 30, 50]`. Khi user tăng page size > 10 → scroll dọc trong viewport.
- **Sticky:** thead + cột label đầu khi cuộn ngang/dọc.
- **Component:**
  - Bảng đa cột (≥3 cột, sort/drill-down): **`StatsDataGrid`** (`components/shared/stats/StatsDataGrid.tsx`)
  - Bảng 2 cột (label + value): **`StatsTableCard`** (cùng constant scroll + pagination)
- **Export:** Excel/PDF export **toàn bộ dataset**, không slice theo trang hiện tại.
- **Drill-down:** click row → chuyển tab Danh sách với filter (vd. `onDrillDownDept`).
- Tham chiếu: `features/he-thong/nhan-vien/components/nhan-vien-stats.tsx`.

## Drill-down tab Thống kê

- **Không** chuyển sang tab Danh sách khi click biểu đồ / bảng tổng hợp. Mở **`StatsDrillDownDialog`** (`components/shared/stats/StatsDrillDownDialog.tsx`) bọc `AppDialog` + `StatsDataGrid` (`embedded`).
- Kích thước mặc định: `DIALOG_SIZE.XL`; nhiều cột: `WIDE`.
- Dữ liệu lọc client-side từ dataset stats đã filter (date/dept/status toolbar).
- Click dòng trong popup → mở drawer Chi tiết (`onViewItem` từ `createFeatureModule` / `buildStatsProps`); popup **giữ mở** phía sau; drawer dùng `overlayTier="aboveDataDialog"`.
- Factory: `buildStatsProps` nhận thêm `onViewItem`; không truyền `onTabChange('list')` trong drill-down.
- Tham chiếu: `features/he-thong/nhan-vien/components/nhan-vien-stats.tsx`, `lib/factories/create-feature-module.tsx`.

## Bảng con trong Detail (sub-table)

Áp dụng cho danh sách con nhúng trong drawer Detail (vd. phòng ban con, phiên bản tài liệu).

- **Số dòng hiển thị:** tối đa **5 dòng body**; từ dòng thứ 6 cuộn dọc (`overflow-y-auto`, `custom-scrollbar`).
- **Constant:** `lib/detail-sub-table.ts` — `DETAIL_SUB_TABLE_MAX_BODY_ROWS`, `DETAIL_SUB_TABLE_SCROLL_MAX_HEIGHT`.
- **Component ưu tiên:** `EmbeddedChildDataGrid` (mặc định 5 dòng), `GenericSubTableSection` (`maxTableHeight` mặc định theo constant).
- Không để bảng con kéo dài vô hạn trong detail.

## Last-view flow (List ↔ Detail ↔ Form)

Sau **Hủy** hoặc **Lưu** form, quay về màn hình đã mở form.

| Mở form từ | Sau đóng form |
|------------|----------------|
| List (Thêm, sửa từ bảng) | Quay **List** — đóng detail |
| Detail (Sửa, Thêm con, …) | Quay **Detail** — refresh bản ghi |

- **Type:** `FormViewOrigin` — `lib/last-view-flow.ts`.
- **Factory:** `onEdit(item, 'list')` từ bảng; `onEdit(item, 'detail')` từ drawer detail.
- Module `usePageHandlers` + `trackFormOrigin: true` tuân cùng quy tắc.

## In tài liệu A4 (hồ sơ, phiếu)

Áp dụng cho trang preview in (vd. `/ho-so-nhan-vien/:id`). Tham chiếu: `lib/print-document/`, `features/he-thong/nhan-vien/utils/employee-profile-document.ts`.

- **Lề chuẩn:** trái **2cm** (20mm), phải/trên/dưới **1.5cm** (15mm). Hằng số: `PRINT_MARGIN_MM` trong `lib/print-document/constants.ts`.
- **Khổ giấy:** A4 (`210mm × 297mm`). Preview màn hình: `max-w-[210mm]`, padding nội dung `pt-[15mm] pr-[15mm] pb-[15mm] pl-[20mm]`.
- **Font:** `--font-sans` / `getFontStack()` — hỗ trợ tiếng Việt có dấu. Body **10pt**, `line-height: 1.45`.
- **Phân trang:** `page-break-inside: avoid` trên từng bảng section (`.epdoc-section`) và footer chữ ký (`.epdoc-sign-footer`).
- **Footer chữ ký chuẩn (4 cột):** Người lập · Người kiểm tra · Người liên quan · Phê duyệt — mỗi ô có tiêu đề in hoa, khoảng ký ~50mm, dòng `(Ký, ghi rõ họ tên)`.
- **Đồng bộ kênh xuất:** Preview = In trình duyệt = Tải PDF = Tải Word (.doc). PDF render WYSIWYG từ DOM preview (`jsPDF.html`). Excel là export dữ liệu thô (ngoại lệ).
- **Toolbar preview:** Chiều cao gọn — `py-1.5`, nút `h-8 text-xs`, icon 14px.

## Import dữ liệu (ImportDialog + lib/import)

Áp dụng cho mọi module có nút Import trên toolbar. Tham chiếu: `components/shared/ImportDialog.tsx`, `lib/import/`.

### Luồng dialog (4 bước)

1. **Upload** — một file `.xlsx` / `.xls` / `.csv`; ưu tiên đọc sheet `Du_lieu` nếu có.
2. **Mapping** — map cột file ↔ cột hệ thống (`ImportColumn`: `key`, `label`, `required?`).
3. **Importing (batch)** — xử lý theo lô, hiển thị tiến trình `done/total`.
4. **Result** — tổng hợp `created` + lỗi; nút **Tải file lỗi (.xlsx)** khi có dòng thất bại.

Dialog: `DIALOG_SIZE.LARGE` (max-w-2xl, max-h 85vh).

### Template (.xlsx)

Dùng `buildImportTemplate()` — **không** tự tạo template một sheet.

| Sheet | Nội dung |
|-------|----------|
| `Du_lieu` | Header cột import (cột bắt buộc có `*`); dòng 2 gợi ý (có thể xóa); nhập từ dòng 3 |
| `Huong_dan` | Hướng dẫn + danh sách cột bắt buộc + sheet tra cứu |
| Lookup sheets | Bảng tham chiếu FK/enum (mã + tên; thêm `id` nếu import theo id) |

Module khai báo `importLookupSheets` (factory) hoặc `useImportLookupSheets` (master data tách khỏi list). Dùng `createTrangThaiLookupSheet()` cho cột trạng thái Active/Inactive.

### Service import

- Hàm `importXxx(rows: ImportBatchRow[], options?)` trả `ImportResult` (`created`, `failed[]`).
- Dùng `runImportBatch()` — concurrency mặc định **5**; lỗi từng dòng `throw` trong `processRow`, không dừng cả batch.
- Hook mutation: `mutationFn: ({ rows, onProgress }) => importXxx(rows, { onProgress })`; invalidate cache; toast ngắn khi `created > 0` — **không** toast chi tiết từng dòng (dialog + file lỗi đảm nhiệm).

### File lỗi

`buildErrorWorkbook()` — cột `Dong` | các cột import | `Loi`. Tên file: `{templateFileName}_Loi_{timestamp}.xlsx`. Người dùng sửa và import lại chỉ các dòng lỗi.

## Tải ảnh / Media upload

Nguồn chuẩn: `lib/media/` (provider `local` hoặc `cloudinary`). Chi tiết env: `.env.example`.

### Component

| Loại | Component | Ghi chú |
|------|-----------|---------|
| Ảnh đơn (avatar, logo, chữ ký) | **`SingleImageInput`** | Không tự viết `FileReader` trong feature |
| Nhiều ảnh | **`MultiImageInput`** / data type `multi_image` | `allowUrlInput`, `uploadContext` giống `SingleImageInput` |
| File đính kèm (không phải ảnh UI) | **`FileInput`** | |

### Lưu trữ

- **Production:** URL HTTPS qua **Cloudinary** (`VITE_MEDIA_PROVIDER=cloudinary` + cloud name + unsigned upload preset).
- **Dev/mock:** `VITE_MEDIA_PROVIDER=local` (mặc định) — base64 data URL, không cần Cloudinary.
- **Không** embed base64 lớn vào Postgres khi Cloudinary đã bật.
- **Không** đặt Cloudinary API secret trong Vite client.

### Quy ước theo ngữ cảnh

| Ngữ cảnh | `SingleImageInput` | Cloudinary folder |
|----------|-------------------|-------------------|
| Logo công ty | `shape="rounded"`, `allowUrlInput={true}`, `maxSizeMB={2}` | `5f/company/logo` |
| Avatar nhân viên | `shape="circle"`, `maxSizeMB={2}` | `5f/employees/avatars` |

- Định dạng: PNG, JPG, WebP; giới hạn dung lượng qua `maxSizeMB` (mặc định 2MB).
- Dán URL ảnh: prop `allowUrlInput` — validate `http(s)://`, thử load preview trước khi lưu.
- Transform CDN: `getOptimizedImageUrl()` trong `lib/media/image-url.ts` khi URL là Cloudinary.

### Hook / service

- Upload file: `uploadImage()` hoặc `useImageUpload()` từ `@/lib/media`.
- UI gọi hook qua `SingleImageInput` — feature không gọi Cloudinary API trực tiếp.

## Tóm tắt

| Ngữ cảnh | Thành phần | Màu chữ |
|----------|------------|---------|
| Trang submenu (dashboard thật) | Tiêu đề nhóm (groupTitle) | `text-primary` |
| Trang placeholder submenu | Tiêu đề (tên nhóm) | `text-primary` (titlePrimary) |
| Form / Detail | Tiêu đề section (Section / FormSection / DetailSection) | `text-primary` (mặc định, variant='primary') |

| Mục đích | Loại | Kích thước / Ghi chú |
|----------|------|----------------------|
| Xác nhận (confirm, xóa) | Dialog | DIALOG_SIZE.CONFIRM (max-w-sm) |
| Import / Export (rộng, cao) | Dialog | DIALOG_SIZE.LARGE (max-w-2xl, max-h 85vh) |
| Drill-down / preview bảng (Thống kê) | Dialog | DIALOG_SIZE.XL (max-w-4xl) hoặc WIDE (max-w-6xl) |
| Form drawer | Drawer | 48rem (chung với Detail) |
| Detail drawer | Drawer | 48rem (chung với Form) |
| Drawer chồng (mở từ drawer khác) | Drawer | 44rem, stackLevel ≥ 1 |
