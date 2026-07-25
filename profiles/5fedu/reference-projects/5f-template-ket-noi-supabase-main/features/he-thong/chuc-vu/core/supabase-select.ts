/** PostgREST: không dùng `*` — giảm egress. */
export const VAR_CHUC_VU_ROW_COLUMNS = [
  'id',
  'ma_chuc_vu',
  'ten_chuc_vu',
  'cap_bac',
  'phong_ban_id',
  'mo_ta',
  'thu_tu',
  'trang_thai',
  'nguoi_tao',
  'tg_tao',
  'tg_cap_nhat',
].join(',');

/** @deprecated Use VAR_CHUC_VU_ROW_COLUMNS */
export const HE_THONG_CHUC_VU_ROW_COLUMNS = VAR_CHUC_VU_ROW_COLUMNS;

export const POSITION_SELECT_FULL =
  `${VAR_CHUC_VU_ROW_COLUMNS},var_phong_ban(ten_phong_ban),creator:var_nhan_vien!var_chuc_vu_nguoi_tao_fkey(ho_ten)`;

export const POSITION_RETURNING_FULL = POSITION_SELECT_FULL;

/** Chỉ đổi trạng thái — merge ở hook; payload trả về nhỏ. */
export const POSITION_RETURNING_STATUS_ONLY =
  'id,trang_thai,tg_cap_nhat,cap_bac,var_phong_ban(ten_phong_ban)';
