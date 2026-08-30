/**
 * Quy chuẩn bảng con trong drawer Detail — xem docs/UI-CONVENTIONS.md § Bảng con trong Detail.
 */

/** Số dòng body tối đa hiển thị trước khi cuộn dọc. */
export const DETAIL_SUB_TABLE_MAX_BODY_ROWS = 5;

/** Chiều cao ước lượng một dòng body (px). */
export const DETAIL_SUB_TABLE_ROW_PX = 44;

/** Chiều cao ước lượng hàng thead (px). */
export const DETAIL_SUB_TABLE_HEAD_PX = 40;

/** max-height vùng scroll: thead + N dòng body. */
export const DETAIL_SUB_TABLE_SCROLL_MAX_HEIGHT = `calc(${DETAIL_SUB_TABLE_HEAD_PX}px + ${DETAIL_SUB_TABLE_MAX_BODY_ROWS} * ${DETAIL_SUB_TABLE_ROW_PX}px)`;
