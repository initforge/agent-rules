# Pattern: thao tác trên bảng và placement detail

## Bảng (list)

- **Khuyến nghị**: một nút **Sửa** (hoặc hành động chính) + menu **⋮** cho các thao tác phụ / nguy hiểm (xóa, đổi trạng thái, …).
- **Primitives**: `components/shared/row-actions` — `TableRowIconButton`, `RowActionsOverflowMenu`, `useRowMenuOpenState`, `DataTableRowActions`.
- **Chiều rộng cột**: `GenericTable` dùng ~92px cho cột actions mặc định; nếu cần nhiều icon luôn hiện, tăng `minWidth` cột trong `DEFAULT_COLUMNS` của store.

## Detail — placement

Định nghĩa type và helper: `lib/detail-action-placement.ts`.

| `DetailActionPlacement` | Vùng UI |
|-------------------------|---------|
| `prominent` | Thanh hành động chính — `DetailToolbar` |
| `inline` | Bên phải giá trị trường — `DetailField` prop `trailing` |

`partitionDetailActions(actions)` trả về `prominent[]` và `inlineByFieldKey` để feature map vào layout.

## i18n

- `common.moreRowActions`: nhãn nút ⋮ (thay cho copy riêng từng module khi dùng `DataTableRowActions`).
