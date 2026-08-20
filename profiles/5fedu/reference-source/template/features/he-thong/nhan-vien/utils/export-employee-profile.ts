/**
 * Xuất hồ sơ nhân viên ra Doc, Excel.
 * PDF dùng print-employee-pdf.ts (WYSIWYG từ DOM preview).
 */
import type { Employee } from '../core/types';
import { getTodayISODate } from '@/lib/utils';
import { txt } from '@/lib/text';
import { useUIStore } from '@/store/useStore';
import { buildEmployeeProfileSections } from './print-employee-pdf';
import { buildEmployeeProfileFullHTML } from './employee-profile-document';

function safeFileName(name: string): string {
  return name.replace(/\s+/g, '_').replace(/[<>:"/\\|?*]/g, '');
}

export type EmployeeProfileExportFormat = 'pdf' | 'excel' | 'doc';

/** Xuất hồ sơ ra Excel (có header công ty + các section) */
export async function exportEmployeeProfileExcel(emp: Employee): Promise<void> {
  const XLSX = await import('xlsx');
  const info = useUIStore.getState().companyInfo;
  const sections = buildEmployeeProfileSections(emp);

  const rows: (string | number)[][] = [
    [info.companyName],
    ...(info.address ? [[txt('company.address'), info.address]] : []),
    ...(info.email ? [[txt('company.email'), info.email]] : []),
    ...(info.phone ? [[txt('company.phone'), info.phone]] : []),
    [],
    [txt('employee.pdf.title')],
    ['ID', emp.id],
    [txt('employee.detail.fullName'), emp.ho_ten],
    [],
  ];

  for (const section of sections) {
    rows.push([section.title]);
    for (const row of section.rows) {
      rows.push([row.label, row.value]);
    }
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ho so');
  XLSX.writeFile(wb, `Ho_so_${safeFileName(emp.ho_ten)}_${emp.id}_${getTodayISODate()}.xlsx`);
}

/** Xuất hồ sơ ra Doc (HTML layout đồng bộ preview/in) */
export async function exportEmployeeProfileDoc(emp: Employee): Promise<void> {
  const html = buildEmployeeProfileFullHTML(emp);
  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ho_so_${safeFileName(emp.ho_ten)}_${emp.id}_${getTodayISODate()}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}
