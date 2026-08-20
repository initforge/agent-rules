/**
 * Quy tắc kích thước cột bảng (list/table dùng ColumnConfig).
 *
 * Nguyên tắc:
 * - minWidth: đủ cho nội dung “điển hình” một dòng (badge enum, ngày, mã…), tránh ép xuống dòng.
 * - maxWidth: trần mềm; ô vẫn `min-w-0` + `truncate` / ellipsis — text cực dài hiển thị “…” (xem EnumBadge `truncate`, cell `overflow-hidden`).
 * - Cột text dài (email, địa chỉ, ghi chú): min đủ đọc vài ký tự, max 320–400; luôn truncate + nên `title` khi cần.
 * - Badge / enum (trạng thái, giới tính, loại HĐ): không wrap; min theo nhãn dài nhất trong locale, max trần hợp lý.
 * - Ngày (ISO / dd/mm/yyyy): hẹp, tabular-nums.
 * - Mã / ID ngắn: hẹp.
 *
 * Đơn vị: px (khớp ColumnConfig.minWidth / maxWidth).
 */
export const TABLE_COLUMN_PRESETS = {
  /** Mã nhân viên, mã đơn hàng, … */
  code: { minWidth: 88, maxWidth: 130 },
  /** Họ tên, tên khách hàng */
  personName: { minWidth: 160, maxWidth: 280 },
  /** Số điện thoại VN */
  phone: { minWidth: 112, maxWidth: 152 },
  /** Email */
  email: { minWidth: 190, maxWidth: 320 },
  /** Ngày (chuỗi hiển thị ngắn) */
  date: { minWidth: 104, maxWidth: 144 },
  /** Giờ (HH:mm) */
  time: { minWidth: 88, maxWidth: 112 },
  /** Ngày giờ (chuỗi dài hơn) */
  datetime: { minWidth: 152, maxWidth: 200 },
  /** Phần trăm */
  percent: { minWidth: 96, maxWidth: 128 },
  /** Badge enum 1 dòng — trạng thái, loại trung bình (nhãn có thể dài) */
  enumBadge: { minWidth: 152, maxWidth: 220 },
  /** Badge enum ngắn (Nam/Nữ, có/không) */
  enumBadgeShort: { minWidth: 92, maxWidth: 128 },
  /** Badge / tag loại hợp đồng, trình độ (nhãn trung bình) */
  enumBadgeMedium: { minWidth: 120, maxWidth: 180 },
  /** Tên chức vụ, phòng ban (một dòng, truncate nếu quá dài) */
  titleShort: { minWidth: 136, maxWidth: 240 },
  /** Tên chi nhánh, địa điểm */
  branch: { minWidth: 140, maxWidth: 260 },
  /** Địa chỉ / nơi làm việc — thường truncate */
  addressLine: { minWidth: 160, maxWidth: 280 },
  /** Tỉnh/TP */
  province: { minWidth: 120, maxWidth: 200 },
  /** CCCD / CMND (số) */
  idCard: { minWidth: 128, maxWidth: 160 },
} as const;

export type TableColumnPresetKey = keyof typeof TABLE_COLUMN_PRESETS;
