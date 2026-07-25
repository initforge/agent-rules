/**
 * PostgREST `.select()` cho bảng var_nhan_vien — không dùng `*` để giảm egress.
 */
export const VAR_NHAN_VIEN_ROW_COLUMNS = [
  'id',
  'ho_ten',
  'email',
  'ten_dang_nhap',
  'must_change_password',
  'tai_khoan_dang_hoat_dong',
  'so_dien_thoai',
  'phong_ban_id',
  'chuc_vu_id',
  'gioi_tinh',
  'trang_thai',
  'anh_dai_dien',
  'nguoi_tao',
  'tg_tao',
  'tg_cap_nhat',
].join(',');

/** @deprecated Use VAR_NHAN_VIEN_ROW_COLUMNS */
export const HE_THONG_NHAN_VIEN_ROW_COLUMNS = VAR_NHAN_VIEN_ROW_COLUMNS;

export const VAR_NHAN_VIEN_TABLE_COLUMNS = VAR_NHAN_VIEN_ROW_COLUMNS;

/** @deprecated Use VAR_NHAN_VIEN_TABLE_COLUMNS */
export const HE_THONG_NHAN_VIEN_TABLE_COLUMNS = VAR_NHAN_VIEN_TABLE_COLUMNS;

export const EMPLOYEE_SELECT_TABLE = `${VAR_NHAN_VIEN_TABLE_COLUMNS},var_phong_ban(ten_phong_ban),var_chuc_vu(ten_chuc_vu,cap_bac),creator:var_nhan_vien!var_nhan_vien_nguoi_tao_fkey(ho_ten)`;

/** Tab thống kê — cột tối thiểu cho aggregate client-side (≤500 NV). */
export const EMPLOYEE_SELECT_STATS =
  'id,phong_ban_id,trang_thai,gioi_tinh,tg_tao,var_phong_ban(ten_phong_ban)';

/** @deprecated Dùng EMPLOYEE_SELECT_TABLE hoặc EMPLOYEE_SELECT_FULL. */
export const EMPLOYEE_SELECT_LIST = EMPLOYEE_SELECT_TABLE;

export const EMPLOYEE_SELECT_FULL = EMPLOYEE_SELECT_TABLE;

export const EMPLOYEE_RETURNING_FULL = EMPLOYEE_SELECT_FULL;

export const EMPLOYEE_RETURNING_STATUS_ONLY = `id,trang_thai,tg_cap_nhat,var_phong_ban(ten_phong_ban),var_chuc_vu(ten_chuc_vu,cap_bac)`;
