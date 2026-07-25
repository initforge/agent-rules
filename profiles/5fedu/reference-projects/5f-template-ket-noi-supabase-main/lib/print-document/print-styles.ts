import { buildSansStackCss } from '@/lib/theme/fonts';
import {
  PRINT_CONTENT_PADDING_CSS,
  PRINT_FONT_BODY_PT,
  PRINT_FONT_COMPANY_META_PT,
  PRINT_FONT_COMPANY_PT,
  PRINT_FONT_FOOTER_PT,
  PRINT_FONT_SECTION_HEADER_PT,
  PRINT_FONT_TITLE_PT,
  PRINT_LINE_HEIGHT,
  PRINT_MARGIN_MM,
  PRINT_PRIMARY_HEX,
} from './constants';

/** Default font stack when document is built outside browser (Word export). */
export const PRINT_DEFAULT_FONT_STACK = buildSansStackCss('Inter');

export interface PrintStylesOptions {
  /** Font stack CSS value; defaults to Inter stack for offline HTML */
  fontStack?: string;
  /** Include @page rules (for print / Word) */
  includePage?: boolean;
}

/**
 * Shared CSS for employee profile and other A4 documents.
 * Used in Word export `<head>` and injected on preview page.
 */
export function buildPrintDocumentCSS(options: PrintStylesOptions = {}): string {
  const fontStack = options.fontStack ?? PRINT_DEFAULT_FONT_STACK;
  const pageRule = options.includePage
    ? `@page {
  size: A4;
  margin: ${PRINT_MARGIN_MM.top}mm ${PRINT_MARGIN_MM.right}mm ${PRINT_MARGIN_MM.bottom}mm ${PRINT_MARGIN_MM.left}mm;
}
`
    : '';

  return `${pageRule}.employee-profile-preview-content,
.epdoc-root {
  font-family: ${fontStack};
  font-size: ${PRINT_FONT_BODY_PT}pt;
  line-height: ${PRINT_LINE_HEIGHT};
  color: #222;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.epdoc-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 2px solid #333;
}
.epdoc-header-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  flex-shrink: 0;
}
.epdoc-company-name {
  font-size: ${PRINT_FONT_COMPANY_PT}pt;
  font-weight: 700;
  color: #111;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin: 0;
}
.epdoc-company-meta {
  font-size: ${PRINT_FONT_COMPANY_META_PT}pt;
  color: #444;
  margin: 2px 0 0 0;
}
.epdoc-title {
  font-size: ${PRINT_FONT_TITLE_PT}pt;
  font-weight: 700;
  text-align: center;
  margin: 0 0 4px 0;
}
.epdoc-subtitle {
  font-size: ${PRINT_FONT_BODY_PT}pt;
  color: #555;
  text-align: center;
  margin: 0 0 12px 0;
}
.epdoc-divider {
  border: 0;
  border-top: 1px solid #ccc;
  margin: 12px 0;
}
.epdoc-section {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  page-break-inside: avoid;
}
.epdoc-section th {
  background: ${PRINT_PRIMARY_HEX};
  color: #fff;
  padding: 6px;
  text-align: left;
  font-size: ${PRINT_FONT_SECTION_HEADER_PT}pt;
  font-weight: 700;
}
.epdoc-section td {
  border: 1px solid #ddd;
  padding: 4px 6px;
  vertical-align: top;
}
.epdoc-section-label {
  width: 40%;
  font-weight: 600;
  color: #444;
  background: rgba(249, 250, 251, 0.8);
}
.epdoc-printed-at {
  font-size: ${PRINT_FONT_FOOTER_PT}pt;
  color: #888;
  margin-top: 20px;
}
.epdoc-sign-footer {
  display: flex;
  gap: 12px;
  margin-top: 24pt;
  page-break-inside: avoid;
}
.epdoc-sign-box {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 9pt;
  line-height: ${PRINT_LINE_HEIGHT};
}
.epdoc-sign-box-title {
  font-weight: 700;
  margin: 0;
  text-transform: uppercase;
}
.epdoc-sign-box-hint {
  font-size: 8pt;
  color: #555;
  margin: 2px 0 0 0;
}
.epdoc-sign-space {
  height: 50mm;
}
@media print {
  .employee-profile-preview-content {
    padding: 0 !important;
    width: 210mm;
    box-shadow: none !important;
  }
}`;
}

/** Screen-only padding on preview (mirrors @page content area inside 210mm sheet) */
export const PRINT_PREVIEW_PADDING_CLASS =
  'pt-[15mm] pr-[15mm] pb-[15mm] pl-[20mm]';

export function getPrintContentPaddingStyle(): string {
  return PRINT_CONTENT_PADDING_CSS;
}
