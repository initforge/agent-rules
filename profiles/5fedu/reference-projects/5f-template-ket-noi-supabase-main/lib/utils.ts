import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { useUIStore } from "@/store/useStore"
import { txt } from './text'
import { buildSansStackCss } from './theme/fonts'

dayjs.extend(utc)
dayjs.extend(timezone)

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Safe message for caught errors (TanStack Query, try/catch, …) */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Lấy timezone hiện tại từ store (fallback: Asia/Ho_Chi_Minh) */
export function getTimezone(): string {
  try {
    return useUIStore.getState().timezone || 'Asia/Ho_Chi_Minh'
  } catch {
    return 'Asia/Ho_Chi_Minh'
  }
}

/** Locale cố định tiếng Việt — dùng cho Intl, localeCompare */
export function getLocale(): string {
  return 'vi-VN'
}

/** Mã ngôn ngữ ngắn cho sort/chuỗi */
export function getLanguage(): string {
  return 'vi'
}

/** Hash chuỗi thành số (deterministic) – dùng cho màu avatar */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Bảng màu nền avatar (hex không #) – tương phản tốt với chữ trắng */
const AVATAR_BG_PALETTE = [
  '0f172a', '1e40af', '7c3aed', '059669', '0891b2', 'dc2626', 'ea580c', '4f46e5',
  'be185d', '0d9488', '7c2d12', '475569', '15803d', 'c026d3', '0369a1', 'b45309',
]

/** URL avatar fallback (logo chữ) từ ui-avatars.com – cùng tên = cùng màu, thống nhất toàn app */
export function getAvatarUrl(displayName: string, size?: number): string {
  const name = (displayName || 'User').trim() || 'User'
  const idx = hashString(name) % AVATAR_BG_PALETTE.length
  const background = AVATAR_BG_PALETTE[idx]
  const params = new URLSearchParams({
    name: name,
    background,
    color: 'fff',
  })
  if (size != null && size > 0) params.set('size', String(size))
  return `https://ui-avatars.com/api/?${params.toString()}`
}

/** Tạo dayjs instance đã áp timezone từ cài đặt */
function toTz(value: string | Date | dayjs.Dayjs): dayjs.Dayjs {
  return dayjs(value).tz(getTimezone())
}

/** dayjs "bây giờ" theo timezone từ cài đặt */
export function nowTz(): dayjs.Dayjs {
  return dayjs().tz(getTimezone())
}

function getDisplayDateFormat(): string {
  return 'DD/MM/YYYY'
}
function getDisplayDateTimeFormat(): string {
  return 'DD/MM/YYYY HH:mm'
}
function getDisplayDateTimeFormatShort(): string {
  return 'HH:mm - DD/MM/YYYY'
}
function getDisplayDateFormatShort(): string {
  return 'DD/MM'
}
function getDisplayTimeDateShortFormat(): string {
  return 'HH:mm DD/MM'
}
function getDisplayDateShortTimeFormat(): string {
  return 'DD/MM HH:mm'
}

/** Định dạng ngày hiển thị (DD/MM/YYYY) */
export const DATE_DISPLAY_FORMAT = 'DD/MM/YYYY'
export const DATETIME_DISPLAY_FORMAT = 'DD/MM/YYYY HH:mm'
export const DATETIME_DISPLAY_FORMAT_SHORT = 'HH:mm - DD/MM/YYYY'

export function formatDate(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format(getDisplayDateFormat())
}

export function formatDateTime(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format(getDisplayDateTimeFormat())
}

export function formatDateTimeShort(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format(getDisplayDateTimeFormatShort())
}

/** Chỉ giờ (HH:mm) */
export function formatTime(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format('HH:mm')
}

/** Ngày tháng ngắn (vi: DD/MM, en: MM/DD) */
export function formatDateShort(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format(getDisplayDateFormatShort())
}

/** Tháng/năm (MM/YYYY) – giữ chung cho cả hai locale */
export function formatMonthYear(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format('MM/YYYY')
}

/** Tháng/năm 2 chữ số (MM/YY) */
export function formatMonthYearShort(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format('MM/YY')
}

/** HH:mm + ngày tháng ngắn (vi: HH:mm DD/MM, en: HH:mm MM/DD) */
export function formatTimeDateShort(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format(getDisplayTimeDateShortFormat())
}

/** Ngày tháng ngắn + HH:mm (vi: DD/MM HH:mm, en: MM/DD HH:mm) */
export function formatDateShortTime(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format(getDisplayDateShortTimeFormat())
}

/** Ngày hôm nay dạng ISO (YYYY-MM-DD) theo timezone cài đặt */
export function getTodayISO(): string {
  return nowTz().format('YYYY-MM-DD')
}

/** Giá trị ngày cho input type="date" (YYYY-MM-DD) */
export function formatDateForInput(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (value == null) return ''
  return toTz(value).format('YYYY-MM-DD')
}

/** Phần ngày/tháng/năm cho dòng "Ngày DD tháng MM năm YYYY" (in ấn) */
export function getTodayParts(): { day: string; month: string; year: string } {
  const d = nowTz()
  return { day: d.format('DD'), month: d.format('MM'), year: d.format('YYYY') }
}

/** Ngày sau N ngày (định dạng DD/MM/YYYY) */
export function addDaysFormatted(days: number): string {
  return nowTz().add(days, 'day').format(getDisplayDateFormat())
}

/** Thâm niên từ ngày vào làm: "X năm Y tháng" */
export function getTenureText(startDate: string | Date | dayjs.Dayjs | null | undefined): string {
  if (startDate == null) return ''
  const now = nowTz()
  const start = toTz(startDate)
  const years = now.diff(start, 'year')
  const months = now.diff(start, 'month') % 12
  return `${years} ${txt('tenure.year')} ${months} ${txt('tenure.month')}`
}

/** Ngày hiện tại dạng YYYYMMDD theo timezone (dùng cho tên file export/backup) */
export function getTodayFileDate(): string {
  return nowTz().format('YYYYMMDD')
}

/** Ngày hiện tại dạng YYYY-MM-DD theo timezone (dùng cho tên file export) */
export function getTodayISODate(): string {
  return nowTz().format('YYYY-MM-DD')
}

/**
 * Trả về native Date object mà các phương thức .getFullYear(), .getMonth(), .getDate()
 * trả về giá trị theo timezone đã cài đặt (thay vì timezone trình duyệt).
 * Hữu ích khi cần tính toán date ranges theo timezone.
 */
export function getNowAsLocalDate(): Date {
  const d = nowTz()
  return new Date(d.year(), d.month(), d.date(), d.hour(), d.minute(), d.second())
}

/** Font stack cho export HTML/PDF/Doc — đọc từ CSS variable --font-sans (theo cài đặt người dùng) */
export function getFontStack(): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim();
  return val || buildSansStackCss('Inter');
}

// Định dạng số thành tiền tệ VND, sử dụng locale từ cài đặt
export function formatCurrency(value: number) {
  return new Intl.NumberFormat(getLocale(), {
    style: 'currency',
    currency: 'VND',
  }).format(value);
}

export function exportToExcel(data: Record<string, unknown>[], filename: string) {
  if (!data || !data.length) return;
  import('xlsx').then(XLSX => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}_${getTodayISODate()}.xlsx`);
  });
}

export function exportToPDF(data: Record<string, unknown>[], filename: string, title?: string) {
  if (!data || !data.length) return;
  Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]).then(([jspdfModule, autoTableModule]) => {
    const jsPDF = (jspdfModule as { default?: typeof import('jspdf') }).default;
    if (!jsPDF) return;
    const headers = Object.keys(data[0]);
    const doc = new jsPDF({ orientation: headers.length > 5 ? 'l' : 'p', unit: 'mm', format: 'a4' });
    if (title) { doc.setFontSize(12); doc.text(title, 14, 15); }
    const autoTable = autoTableModule.default;
    autoTable(doc, {
      head: [headers],
      body: data.map(row => headers.map(h => String(row[h] ?? ''))),
      startY: title ? 22 : 10,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    doc.save(`${filename}_${getTodayISODate()}.pdf`);
  }).catch(() => {});
}

export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (!data || !data.length) return;

  // Lấy header từ key của object đầu tiên
  const headers = Object.keys(data[0]);
  
  // Tạo nội dung CSV với BOM để hỗ trợ tiếng Việt trong Excel
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(fieldName => {
      let cell = row[fieldName];
      // Xử lý null/undefined
      if (cell === null || cell === undefined) cell = '';
      // Convert sang string và escape dấu ngoặc kép
      cell = cell.toString().replace(/"/g, '""');
      // Bọc trong ngoặc kép nếu có ký tự đặc biệt
      if (cell.search(/("|,|\n)/g) >= 0) cell = `"${cell}"`;
      return cell;
    }).join(','))
  ].join('\n');

  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${getTodayISODate()}.csv`);
  document.body.appendChild(link);
  
  link.click();
  document.body.removeChild(link);
}
