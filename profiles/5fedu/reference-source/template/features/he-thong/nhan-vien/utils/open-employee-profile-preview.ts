import { toast } from 'sonner';
import { txt } from '@/lib/text';

/** Mở trang in / xem hồ sơ nhân viên (tab mới). Báo toast nếu trình duyệt chặn popup. */
export function openEmployeeProfilePreviewTab(employeeId: string): void {
  const url = `${window.location.origin}/ho-so-nhan-vien/${encodeURIComponent(employeeId)}`;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w == null) {
    toast.error(txt('employee.rowActions.popupBlocked'), {
      description: txt('employee.rowActions.popupBlockedHint'),
    });
  }
}
