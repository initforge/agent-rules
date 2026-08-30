/**
 * Hồ sơ nhân viên — sections dùng chung; PDF xuất WYSIWYG từ DOM preview.
 */
import type { Employee } from '../core/types';
import { getTodayISODate } from '@/lib/utils';
import {
  STATUS_BADGE_CONFIG,
  GENDER_BADGE_CONFIG,
} from '../core/constants';
import { formatDate } from '@/lib/utils';
import { txt } from '@/lib/text';
import { formatEmployeeCapBacLabel } from './build-employee-position-options';
import { PRINT_MARGIN_JSPDF } from '@/lib/print-document/constants';

/** Một dòng trong section (nhãn + giá trị) */
export interface EmployeePdfSectionRow {
  label: string;
  value: string;
}

/** Một khối thông tin (tiêu đề + các dòng) */
export interface EmployeePdfSection {
  title: string;
  rows: EmployeePdfSectionRow[];
}

function badgeLabel(value: unknown, config: Record<string, { label: string }>): string {
  if (value == null || value === '') return '—';
  return config[String(value)]?.label ?? String(value);
}

/**
 * Xây dựng các section hồ sơ (dùng cho PDF, preview HTML, Word).
 */
export function buildEmployeeProfileSections(emp: Employee): EmployeePdfSection[] {
  return [
    {
      title: txt('employee.pdf.personalInfo'),
      rows: [
        { label: txt('employee.detail.fullName'), value: emp.ho_ten },
        { label: txt('employee.detail.gender'), value: badgeLabel(emp.gioi_tinh, GENDER_BADGE_CONFIG) },
        { label: 'ID', value: emp.id },
      ],
    },
    {
      title: txt('employee.pdf.workInfo'),
      rows: [
        { label: txt('employee.detail.position'), value: emp.ten_chuc_vu || '—' },
        { label: txt('employee.detail.department'), value: emp.ten_phong_ban || '—' },
        ...(emp.ten_bo_phan
          ? [{ label: txt('employee.detail.division'), value: emp.ten_bo_phan }]
          : []),
        { label: txt('employee.detail.level'), value: formatEmployeeCapBacLabel(emp.cap_bac) || '—' },
        { label: txt('employee.status'), value: badgeLabel(emp.trang_thai, STATUS_BADGE_CONFIG) },
        { label: txt('employee.store.createdCol'), value: emp.tg_tao ? formatDate(emp.tg_tao) : '—' },
      ],
    },
    {
      title: txt('employee.pdf.contactInfo'),
      rows: [
        { label: txt('employee.detail.workEmail'), value: emp.email },
        { label: txt('employee.detail.phone'), value: emp.so_dien_thoai },
        { label: txt('employee.detail.loginName'), value: emp.ten_dang_nhap || '—' },
      ],
    },
  ];
}

function safeFileName(name: string): string {
  return name.replace(/\s+/g, '_').replace(/[<>:"/\\|?*]/g, '');
}

/**
 * Xuất PDF WYSIWYG từ phần tử preview đã render (giữ font tiếng Việt).
 */
export async function downloadEmployeeProfilePdf(
  element: HTMLElement,
  emp: Employee
): Promise<void> {
  await document.fonts.ready;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const prevPadding = element.style.padding;
  element.style.padding = '0';

  try {
    await doc.html(element, {
      margin: PRINT_MARGIN_JSPDF,
      autoPaging: 'text',
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
      },
      width: 210 - PRINT_MARGIN_JSPDF[1] - PRINT_MARGIN_JSPDF[3],
      windowWidth: element.scrollWidth,
    });

    const filename = `Ho_so_${safeFileName(emp.ho_ten)}_${emp.id}_${getTodayISODate()}.pdf`;
    doc.save(filename);
  } finally {
    element.style.padding = prevPadding;
  }
}

/**
 * Tải PDF hồ sơ — dùng DOM preview trên trang hiện tại.
 */
export async function printEmployeePDF(emp: Employee): Promise<void> {
  const el = document.querySelector<HTMLElement>('.employee-profile-preview-content');
  if (!el) {
    throw new Error('Employee profile preview element not found');
  }
  await downloadEmployeeProfilePdf(el, emp);
}
