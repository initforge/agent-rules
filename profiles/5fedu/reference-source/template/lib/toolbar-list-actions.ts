/**
 * Quy định kích thước nút action trên listview toolbar (Thêm, Import, Export).
 * Tham chiếu: features/he-thong/nhan-vien/components/nhan-vien-toolbar.tsx
 */

/** Nút icon-only (Import, Export): h-8, touch target 44px trên mobile */
export const TOOLBAR_LIST_ICON_BUTTON_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 p-0 items-center justify-center border-border text-muted-foreground hover:bg-muted';

/** Nút primary Thêm: h-8, shadow nhẹ */
export const TOOLBAR_LIST_ADD_BUTTON_CLASS =
  'bg-primary text-white hover:bg-primary/90 shadow-sm h-8 px-3';

/** Icon Lucide trong nút Import/Export */
export const TOOLBAR_LIST_ACTION_ICON_CLASS = 'w-4 h-4';

/** Icon Plus + khoảng cách label trong nút Thêm */
export const TOOLBAR_LIST_ADD_ICON_CLASS = 'w-4 h-4 mr-1.5';
