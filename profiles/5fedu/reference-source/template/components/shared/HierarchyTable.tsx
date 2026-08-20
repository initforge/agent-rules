import React, { memo } from 'react';
import { txt } from '@/lib/text';
import { Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnConfig } from '@/store/createGenericStore';
import { getColumnCellStyle } from '@/store/createGenericStore';

export interface HierarchyTableProps<T> {
  /** Dữ liệu đã flatten + đã paginate (một trang) */
  data: T[];
  /** Cột hiển thị (đã filter visible, sort order) */
  columns: ColumnConfig[];
  selectedIds: Set<string>;
  getId: (item: T) => string;
  /** Level/cấp (1 = root) để style hàng */
  getLevel: (item: T) => number;
  /** Render ô theo cột */
  renderCell: (item: T, col: ColumnConfig) => React.ReactNode;
  onToggleSelection: (id: string) => void;
  onToggleAllSelection: (ids: string[]) => void;
  /** Không truyền = ẩn nút tương ứng (phân quyền). Bỏ qua khi dùng `renderActions`. */
  onEdit?: (item: T) => void;
  onDelete?: (id: string) => void;
  onView?: (item: T) => void;
  /**
   * Cột thao tác tùy chỉnh (vd. Sửa + RowActionsOverflowMenu).
   * Khi có, không dùng nút Sửa/Xóa mặc định.
   */
  renderActions?: (item: T) => React.ReactNode;
  /** Label cột "Thao tác" */
  actionsColumnLabel?: string;
  /** Class cho container scroll */
  className?: string;
  /** Phụ kiện header cột (lọc/tìm/sắp xếp) — giống GenericTable */
  renderColumnHeaderAccessory?: (col: ColumnConfig) => React.ReactNode;
  /** Mặc định true — hàng không selectable sẽ ẩn checkbox và không click onView */
  isRowSelectable?: (item: T) => boolean;
  /** Trả về true để dòng này render full-width (colspan toàn bảng) như section header */
  isFullSpanRow?: (item: T) => boolean;
  /** Nội dung tuỳ biến cho full-span row (chỉ áp dụng khi `isFullSpanRow` trả về true) */
  renderFullSpanRow?: (item: T) => React.ReactNode;
}

/**
 * Bảng desktop hiển thị danh sách dạng cây: cột checkbox, các cột data (renderCell),
 * cột thao tác. Hàng root (level 1) có nền khác, click hàng = onView.
 */
export function HierarchyTable<T>({
  data,
  columns,
  selectedIds,
  getId,
  getLevel,
  renderCell,
  onToggleSelection,
  onToggleAllSelection,
  onEdit,
  onDelete,
  onView,
  renderActions,
  actionsColumnLabel,
  className,
  renderColumnHeaderAccessory,
  isRowSelectable,
  isFullSpanRow,
  renderFullSpanRow,
}: HierarchyTableProps<T>) {
  const selectableOnPage = data.filter((item) => !isRowSelectable || isRowSelectable(item));
  const selectablePageIds = selectableOnPage.map(getId);
  const isAllSelected =
    selectablePageIds.length > 0 && selectablePageIds.every((id) => selectedIds.has(id));
  const isIndeterminate =
    selectablePageIds.some((id) => selectedIds.has(id)) && !isAllSelected;
  const actionsLabel = actionsColumnLabel ?? txt('common.actions');
  const showActionsCol = Boolean(renderActions || onEdit || onDelete);
  const actionsColWidthClass = renderActions ? 'w-[92px] min-w-[92px]' : 'w-20 min-w-[80px]';

  return (
    <div
      className={cn(
        'flex-1 min-h-0 overflow-auto custom-scrollbar',
        className
      )}
      style={{ overscrollBehavior: 'contain' }}
    >
      <table className="w-full text-sm text-left border-separate border-spacing-0">
        <thead className="sticky top-0 z-[2]">
          <tr className="bg-muted border-b border-border align-middle">
            <th
              className="sticky left-0 z-[3] w-11 px-3 py-1.5 bg-muted border-b border-r border-border text-center"
              style={{ minWidth: 44, maxWidth: 44 }}
            >
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(el) => el && (el.indeterminate = isIndeterminate)}
                onChange={() => onToggleAllSelection(selectablePageIds)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 rounded border-border text-primary accent-primary"
                aria-label={txt('common.selectAll')}
              />
            </th>
            {columns.map((col) => {
              const accessory = renderColumnHeaderAccessory?.(col);
              return (
                <th
                  key={col.id}
                  className="px-4 py-1.5 text-left text-xs font-semibold text-muted-foreground border-b border-border whitespace-nowrap min-w-0"
                  style={getColumnCellStyle(col)}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('[data-column-header-accessory]')) {
                      e.stopPropagation();
                    }
                  }}
                >
                  <div className="flex min-w-0 items-center justify-between gap-1">
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <span className="truncate">{col.label}</span>
                    </div>
                    {accessory ? (
                      <div className="shrink-0" data-column-header-accessory>
                        {accessory}
                      </div>
                    ) : null}
                  </div>
                </th>
              );
            })}
            {showActionsCol && (
            <th
              className={cn(
                'sticky right-0 z-[3] px-3 py-1.5 bg-muted border-b border-l border-border text-center text-xs font-semibold text-muted-foreground',
                actionsColWidthClass,
              )}
            >
              {actionsLabel}
            </th>
            )}
          </tr>
        </thead>
        <tbody className="[&>tr>td]:border-b [&>tr>td]:border-border">
          {data.map((item) => {
            const id = getId(item);
            const level = getLevel(item);
            const isRoot = level === 1;
            const isSelected = selectedIds.has(id);
            const selectable = !isRowSelectable || isRowSelectable(item);
            const fullSpan = isFullSpanRow?.(item) ?? false;
            if (fullSpan && renderFullSpanRow) {
              const fullSpanActions = showActionsCol ? renderActions?.(item) : null;
              return (
                <tr key={id} className="bg-muted/60">
                  <td
                    className="sticky left-0 z-[1] w-11 px-3 py-1.5 text-center border-r border-b border-border bg-muted/60"
                    style={{ minWidth: 44, maxWidth: 44 }}
                  />
                  <td
                    colSpan={columns.length}
                    className="p-0 border-b border-border bg-muted/60"
                  >
                    <div className="sticky left-0 z-[1] w-fit max-w-full">
                      {renderFullSpanRow(item)}
                    </div>
                  </td>
                  {showActionsCol && (
                    <td
                      className={cn(
                        'sticky right-0 z-[1] px-2 py-1.5 border-l border-b border-border text-center bg-muted/60',
                        actionsColWidthClass,
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {fullSpanActions}
                    </td>
                  )}
                </tr>
              );
            }
            return (
              <tr
                key={id}
                role={selectable ? 'button' : undefined}
                tabIndex={selectable ? 0 : undefined}
                onClick={() => selectable && onView?.(item)}
                onKeyDown={(e) => selectable && e.key === 'Enter' && onView?.(item)}
                className={cn(
                  'group align-middle transition-colors',
                  selectable ? 'hover:bg-muted/80 cursor-pointer' : 'cursor-default',
                  isRoot ? 'bg-muted/40' : 'bg-card',
                  isSelected && 'bg-primary/5'
                )}
              >
                <td
                  className={cn(
                    'sticky left-0 z-[1] w-11 px-3 py-3 text-center border-r border-border transition-colors',
                    isRoot ? 'bg-muted/40' : 'bg-card',
                    isSelected && 'bg-primary/5',
                    selectable && 'group-hover:bg-muted/80'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {selectable ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelection(id)}
                      className="w-4 h-4 rounded border-border text-primary accent-primary"
                      aria-label={txt('common.select')}
                    />
                  ) : null}
                </td>
                {columns.map((col) => renderCell(item, col))}
                {showActionsCol && (
                <td
                  className={cn(
                    'sticky right-0 z-[1] px-2 py-1.5 border-l border-border text-center transition-colors',
                    actionsColWidthClass,
                    isRoot ? 'bg-muted/40' : 'bg-card',
                    isSelected && 'bg-primary/5',
                    'group-hover:bg-muted/80'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderActions ? (
                    renderActions(item)
                  ) : (
                    <div className="flex items-center justify-center gap-0.5">
                      {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-md transition-colors active:scale-95"
                        title={txt('common.edit')}
                      >
                        <Edit size={15} />
                      </button>
                      )}
                      {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition-colors active:scale-95"
                        title={txt('common.delete')}
                      >
                        <Trash2 size={15} />
                      </button>
                      )}
                    </div>
                  )}
                </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(HierarchyTable) as typeof HierarchyTable;
