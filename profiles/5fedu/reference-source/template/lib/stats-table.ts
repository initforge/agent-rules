/**
 * Quy chuẩn bảng trong tab Thống kê — xem docs/UI-CONVENTIONS.md § Bảng trong tab Thống kê.
 */

/** Số dòng body tối đa hiển thị trong viewport trước khi cuộn dọc. */
export const STATS_TABLE_MAX_BODY_ROWS = 10;

/** Chiều cao ước lượng một dòng body (px) — khớp GenericTable density default. */
export const STATS_TABLE_ROW_PX = 38;

/** Chiều cao ước lượng hàng thead (px). */
export const STATS_TABLE_HEAD_PX = 40;

/** Page size mặc định — khớp viewport 10 dòng. */
export const STATS_TABLE_DEFAULT_PAGE_SIZE = 10;

/** Lựa chọn page size cho bảng thống kê. */
export const STATS_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;

/** Từ số dòng này trở lên trên một trang, bật ảo hóa tbody. */
export const STATS_TABLE_VIRTUAL_THRESHOLD = 100;

const STATS_TABLE_HEAD_ROW_REM = 2.75;
const STATS_TABLE_BODY_ROW_REM = 2.35;

/** `max-height` CSS cho vùng `overflow-auto` bọc `<table>`. */
export function getStatsTableScrollMaxHeightCss(
  maxBodyRows: number = STATS_TABLE_MAX_BODY_ROWS,
): string {
  return `min(70vh, calc(${STATS_TABLE_HEAD_ROW_REM}rem + ${maxBodyRows} * ${STATS_TABLE_BODY_ROW_REM}rem))`;
}

/** max-height theo px (thead + N dòng body). */
export function getStatsTableScrollMaxHeightPx(
  maxBodyRows: number = STATS_TABLE_MAX_BODY_ROWS,
): string {
  return `min(70vh, calc(${STATS_TABLE_HEAD_PX}px + ${maxBodyRows} * ${STATS_TABLE_ROW_PX}px))`;
}
