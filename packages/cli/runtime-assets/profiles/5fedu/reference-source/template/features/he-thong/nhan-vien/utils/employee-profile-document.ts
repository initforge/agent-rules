/**
 * Single HTML builder for employee profile — preview, print, PDF, Word.
 */
import type { Employee } from '../core/types';
import { formatDateTime, getFontStack } from '@/lib/utils';
import { txt } from '@/lib/text';
import { useUIStore } from '@/store/useStore';
import { buildSignatureFooterHTML } from '@/lib/print-document/signature-footer';
import { buildPrintDocumentCSS, PRINT_DEFAULT_FONT_STACK } from '@/lib/print-document/print-styles';
import {
  buildEmployeeProfileSections,
  type EmployeePdfSection,
} from './print-employee-pdf';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCompanyHeaderHTML(fontStack: string): string {
  const info = useUIStore.getState().companyInfo;
  const logoHtml = info.appLogo
    ? `<img src="${escapeHtml(info.appLogo)}" alt="Logo" class="epdoc-header-logo" style="width:64px;height:64px;object-fit:contain;flex-shrink:0" />`
    : '';
  const addr = info.address ? `${txt('company.address')}: ${escapeHtml(info.address)}` : '';
  const contact: string[] = [];
  if (info.email) contact.push(`${txt('company.email')}: ${escapeHtml(info.email)}`);
  if (info.phone) contact.push(`${txt('company.phone')}: ${escapeHtml(info.phone)}`);
  const contactLine = contact.join(' · ');

  return `<div class="epdoc-header" style="display:flex;align-items:flex-start;gap:16px;padding-bottom:16px;margin-bottom:16px;border-bottom:2px solid #333;font-family:${fontStack}">
  ${logoHtml}
  <div style="flex:1;min-width:0">
    <div class="epdoc-company-name" style="font-size:14pt;font-weight:bold;color:#111;text-transform:uppercase">${escapeHtml(info.companyName)}</div>
    ${addr ? `<p class="epdoc-company-meta" style="font-size:9pt;color:#444;margin:2px 0 0 0">${addr}</p>` : ''}
    ${contactLine ? `<p class="epdoc-company-meta" style="font-size:9pt;color:#444;margin:2px 0 0 0">${contactLine}</p>` : ''}
  </div>
</div>`;
}

function buildSectionTableHTML(section: EmployeePdfSection, fontStack: string): string {
  const rows = section.rows
    .map(
      (row) =>
        `<tr>
  <td class="epdoc-section-label" style="padding:4px 6px;border:1px solid #ddd;font-weight:600;width:40%;color:#444;background:rgba(249,250,251,0.8);font-family:${fontStack}">${escapeHtml(row.label)}</td>
  <td style="padding:4px 6px;border:1px solid #ddd;font-family:${fontStack}">${escapeHtml(row.value)}</td>
</tr>`
    )
    .join('');

  return `<table class="epdoc-section" style="width:100%;border-collapse:collapse;margin-top:12px;page-break-inside:avoid;font-family:${fontStack};font-size:10pt">
  <thead><tr><th colspan="2" style="background:#3b82f6;color:#fff;padding:6px;text-align:left;font-size:9pt">${escapeHtml(section.title)}</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function getSignatureLabels() {
  return {
    preparer: txt('employee.pdf.signPreparer'),
    reviewer: txt('employee.pdf.signReviewer'),
    related: txt('employee.pdf.signRelated'),
    approver: txt('employee.pdf.signApprover'),
    hint: txt('employee.pdf.signHint'),
  };
}

function resolveFontStack(): string {
  return typeof document !== 'undefined' ? getFontStack() : PRINT_DEFAULT_FONT_STACK;
}

/** Body HTML for preview parity (no outer html/head) */
export function buildEmployeeProfileDocumentHTML(emp: Employee): string {
  const resolvedFont = resolveFontStack();

  const sections = buildEmployeeProfileSections(emp);
  const title = txt('employee.pdf.title');
  const subtitle = `ID ${emp.id}  ·  ${emp.ho_ten}`;
  const printedAt = formatDateTime(new Date());
  const tablesHtml = sections.map((s) => buildSectionTableHTML(s, resolvedFont)).join('');
  const signFooter = buildSignatureFooterHTML(getSignatureLabels());

  return `<div class="epdoc-root" style="font-family:${resolvedFont};font-size:10pt;line-height:1.45;color:#222">
${buildCompanyHeaderHTML(resolvedFont)}
<h1 class="epdoc-title" style="font-size:16pt;text-align:center;margin:0 0 4px;font-family:${resolvedFont}">${escapeHtml(title)}</h1>
<p class="epdoc-subtitle" style="font-size:10pt;color:#555;text-align:center;margin:0 0 12px;font-family:${resolvedFont}">${escapeHtml(subtitle)}</p>
<hr class="epdoc-divider" style="border:0;border-top:1px solid #ccc;margin:12px 0">
${tablesHtml}
${signFooter}
<p class="epdoc-printed-at" style="font-size:7pt;color:#888;margin-top:20px;font-family:${resolvedFont}">${escapeHtml(txt('employee.pdf.printedAt'))} ${escapeHtml(printedAt)}</p>
</div>`;
}

/** Full HTML document for Word export */
export function buildEmployeeProfileFullHTML(emp: Employee): string {
  const fontStack = resolveFontStack();
  const body = buildEmployeeProfileDocumentHTML(emp);
  const styles = buildPrintDocumentCSS({ fontStack, includePage: true });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${styles}</style></head><body>${body}</body></html>`;
}
