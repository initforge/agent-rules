/** A4 print layout — single source of truth for document exports. */

/** Page margins in mm: left 2cm, right/top/bottom 1.5cm */
export const PRINT_MARGIN_MM = {
  top: 15,
  right: 15,
  bottom: 15,
  left: 20,
} as const;

export const PRINT_PAGE_SIZE = 'A4' as const;

export const PRINT_LINE_HEIGHT = 1.45;

export const PRINT_FONT_BODY_PT = 10;
export const PRINT_FONT_TITLE_PT = 16;
export const PRINT_FONT_COMPANY_PT = 14;
export const PRINT_FONT_COMPANY_META_PT = 9;
export const PRINT_FONT_SECTION_HEADER_PT = 9;
export const PRINT_FONT_FOOTER_PT = 7;

export const PRINT_PRIMARY_HEX = '#3b82f6';

/** CSS padding matching print margins for on-screen preview */
export const PRINT_CONTENT_PADDING_CSS = '15mm 15mm 15mm 20mm';

/** jsPDF html() margin array: [top, right, bottom, left] */
export const PRINT_MARGIN_JSPDF: [number, number, number, number] = [
  PRINT_MARGIN_MM.top,
  PRINT_MARGIN_MM.right,
  PRINT_MARGIN_MM.bottom,
  PRINT_MARGIN_MM.left,
];
