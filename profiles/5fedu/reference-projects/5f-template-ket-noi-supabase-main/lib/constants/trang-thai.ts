/**
 * Hằng số trạng thái lưu trên Supabase/DB bằng tiếng Việt có dấu.
 * Chỉ giữ các constant dùng chung nhiều module; trạng thái theo từng nghiệp vụ nằm trong core/constants.ts của từng feature.
 */

/** Hai trạng thái bật/tắt (Active/Inactive) – dùng cho Phòng ban, Chức vụ, Chi nhánh, Cấp bậc, Kho, Hàng hóa, v.v. */
export const TRANG_THAI_HOAT_DONG = ['Ngừng hoạt động', 'Đang hoạt động'] as const;
export type TrangThaiHoatDong = (typeof TRANG_THAI_HOAT_DONG)[number];

/** Trạng thái phiếu 3 bước (Chờ duyệt, Đã duyệt, Không duyệt) – Phiếu đề xuất VT, Phiếu kho, v.v. */
export const TRANG_THAI_PHIEU_3 = ['Chờ duyệt', 'Đã duyệt', 'Không duyệt'] as const;
export type TrangThaiPhieu3 = (typeof TRANG_THAI_PHIEU_3)[number];

/**
 * Import Excel/CSV: ưu tiên đúng chuỗi lưu DB; vẫn chấp nhật cột số 0/1 cũ.
 */
export function parseTrangThaiHoatDongImport(raw: unknown): TrangThaiHoatDong {
  const s = String(raw ?? '').trim();
  if (s === 'Đang hoạt động' || s === 'Ngừng hoạt động') return s;
  const n = Number(raw);
  if (Number.isFinite(n)) return n === 0 ? 'Ngừng hoạt động' : 'Đang hoạt động';
  return 'Đang hoạt động';
}
