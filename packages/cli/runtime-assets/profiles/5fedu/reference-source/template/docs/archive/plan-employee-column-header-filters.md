# Kế hoạch: Lọc theo header cột (desktop) — module Nhân viên

## Mục tiêu

- **Desktop (≥ `md` hoặc vùng bảng desktop)**: Bỏ filter chip trên toolbar; thêm nút lọc nhỏ trên **header** các cột tương ứng (kiểu Excel). Bấm mở popover/dropdown lọc, dùng **cùng state** `EmployeeFilters` hiện tại.
- **Mobile**: **Không đổi** — vẫn nút Filter + `MobileFilterSheet` + hành vi toolbar như hiện tại.

## Phạm vi cột lọc (giai đoạn 1)

Chỉ gắn lọc cho các trường **đã có trong store** và đang dùng chip desktop:

| Cột UI (`col.id`) | Khóa filter (`EmployeeFilters`) | Kiểu UI |
|-------------------|----------------------------------|---------|
| `ten_phong_ban`   | `phong_ban_id`                  | Multi-select (danh sách phòng ban) |
| `ten_chuc_vu`     | `position` (`chuc_vu_id`)       | Multi-select (danh sách chức vụ)   |
| `trang_thai`      | `trang_thai`                    | Multi-select (trạng thái)          |

**Lưu ý**: `EmployeeFilters` còn có `gender` nhưng toolbar chip hiện không expose; giai đoạn sau có thể thêm header filter cho cột `gioi_tinh` nếu cần.

Các cột khác **không** bắt buộc có filter ở giai đoạn 1 (tránh scope quá lớn). Có thể mở rộng sau (text search theo cột, date range, …).

## Rào cản kỹ thuật hiện tại

Trong `GenericToolbar`, `hasFilters` đang là:

`filters && filterGroups && filterGroups.length > 0`

Nếu bỏ hẳn `filters` (chip desktop) mà không sửa logic, **nút Filter mobile** có thể **mất** vì `hasFilters` thành false.

**Việc cần làm**: Tách điều kiện, ví dụ:

- `hasMobileFilterSheet = !!(filterGroups?.length)` — điều khiển nút Filter + `MobileFilterSheet`.
- Desktop: chỉ render khối chip/inline filters khi `filters != null` **và** không bật cờ ẩn desktop (hoặc tách prop `desktopFilters?: React.ReactNode`).

## Thay đổi file (dự kiến)

1. **`components/shared/GenericToolbar.tsx`**  
   - Tách logic `hasFilters` thành mobile vs desktop.  
   - Prop mới (một trong các cách):  
     - `desktopFilters?: React.ReactNode | null` — `null` = không vẽ chip/filter hàng desktop; **vẫn** truyền `filterGroups` cho mobile.  
     - Hoặc `hideDesktopFilters?: boolean` khi vẫn truyền `filters` (kém rõ ràng hơn).  
   - Đảm bảo `activeFilterCount` / `onClearAllFilters` vẫn hoạt động trên cả hai nền tảng.

2. **`features/he-thong/nhan-vien/components/nhan-vien-toolbar.tsx`**  
   - Desktop: không truyền chip (dùng API mới ở trên).  
   - Mobile: giữ nguyên `filterGroups` + `mobileActions`; không đổi copy/flow.

3. **`components/shared/GenericTable.tsx`**  
   - Prop tùy chọn cho **chỉ vùng desktop table** (đã `hidden md:block`):  
     - Ví dụ: `renderHeaderAccessory?: (ctx: { colId: string; column: ColumnConfig }) => React.ReactNode`  
     - Hoặc `columnHeaderFilters?: Partial<Record<string, React.ReactNode>>` chỉ cho module nhân viên.  
   - Header hiện gộp sort (click cả ô) + resize — cần **ngăn event**: click icon filter `stopPropagation()` để không sort; hoặc tách vùng label (sort) / vùng icon (filter).  
   - Accessibility: `aria-label` cho nút lọc, `aria-expanded` khi mở popover.

4. **Component mới (gợi ý)**  
   - `features/he-thong/nhan-vien/components/EmployeeColumnHeaderFilter.tsx` (hoặc dưới `components/shared/` nếu tái sử dụng sau):  
     - Nút icon nhỏ (`Filter` / `ListFilter` từ lucide).  
     - Popover (dùng Radix/shadcn nếu có) chứa nội dung tương đương logic `FilterChipMultiSelect` (multi + “Chọn tất cả” / “Xóa chọn” nếu đã là chuẩn dự án).  
     - Trạng thái active (dot/badge) khi filter cột đó có giá trị.

5. **`features/he-thong/nhan-vien/components/nhan-vien-table.tsx`**  
   - Truyền `renderHeaderAccessory` (hoặc map) vào `GenericTable` chỉ cho `ten_phong_ban`, `ten_chuc_vu`, `trang_thai`.  
   - Cần **departments / positions / status options** + `useEmployeeStore` — có thể nhận qua props từ `index.tsx` hoặc gọi hook trong table (chú ý không phá SSR nếu sau này có).

6. **`features/he-thong/nhan-vien/index.tsx`** (nếu cần)  
   - Lift data `departments` / `positions` xuống table nếu hiện chỉ có ở toolbar — hoặc dùng chung hook trong table như toolbar.

7. **Tests / thủ công**  
   - Desktop: lọc từ header, xóa bộ lọc, đồng bộ với `activeFilterCount` trên toolbar.  
   - Mobile: mở sheet filter, không regression.  
   - Sort: click label vẫn sort; click icon không sort.

## Thứ tự triển khai đề xuất

1. Sửa `GenericToolbar` (tách mobile vs desktop filters) — **bắt buộc trước** khi gỡ chip desktop.  
2. Thêm API header phụ trên `GenericTable` + xử lý stopPropagation.  
3. Implement `EmployeeColumnHeaderFilter` + nối 3 cột trong `EmployeeTable`.  
4. Cập nhật `EmployeeToolbar`: bỏ chip desktop, giữ mobile.  
5. Kiểm tra `use-filter-counts`, `activeFilterCount`, `handleClearAllFilters`.

## Rủi ro / lưu ý

- **Nhiều cột**: Chỉ 3 cột có icon — không làm header quá tải.  
- **Sticky header + sticky cột**: z-index popover phải cao hơn header (`z-[41]` như column menu hiện có).  
- **Resize cột**: Handle resize vẫn ở cạnh phải `th`; icon filter nên đặt trái handle hoặc trong flex không overlap.

## Mở rộng sau (ngoài phạm vi giai đoạn 1)

- Filter cho `gioi_tinh`, `gender` trong store.  
- Lọc text / date theo từng cột (cần mở rộng `EmployeeFilters` + `filterFn`).  
- Áp dụng pattern tương tự Phòng ban / Chức vụ sau khi ổn định module Nhân viên.
