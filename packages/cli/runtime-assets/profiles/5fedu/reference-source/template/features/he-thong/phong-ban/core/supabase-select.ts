export const VAR_PHONG_BAN_ROW_COLUMNS = [
  'id',
  'ma_phong_ban',
  'ten_phong_ban',
  'mo_ta',
  'cha_id',
  'cap_do',
  'duong_dan',
  'trang_thai',
  'thu_tu',
  'nguoi_tao',
  'tg_tao',
  'tg_cap_nhat',
].join(',');

export const DEPARTMENT_SELECT_FULL = `${VAR_PHONG_BAN_ROW_COLUMNS},creator:var_nhan_vien!var_phong_ban_nguoi_tao_fkey(ho_ten)`;

/** @deprecated Use VAR_PHONG_BAN_ROW_COLUMNS */
export const HE_THONG_PHONG_BAN_ROW_COLUMNS = VAR_PHONG_BAN_ROW_COLUMNS;

export const DEPARTMENT_RETURNING_FULL = DEPARTMENT_SELECT_FULL;

export const DEPARTMENT_RETURNING_STATUS_ONLY = 'id,trang_thai,tg_cap_nhat';
