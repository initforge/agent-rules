/** Bảng `var_phan_quyen` — liệt kê cột thay vì `*`. */
export const VAR_PHAN_QUYEN_ROW_COLUMNS = [
  'id',
  'module_key',
  'chuc_vu_id',
  'quyen',
  'tg_tao',
  'tg_cap_nhat',
].join(',');

export const VAR_PHAN_QUYEN_SELECT_FULL = VAR_PHAN_QUYEN_ROW_COLUMNS;

export const VAR_PHAN_QUYEN_RETURNING_FULL = VAR_PHAN_QUYEN_ROW_COLUMNS;

/** @deprecated Use VAR_PHAN_QUYEN_* — kept for imports during transition. */
export const PHAN_QUYEN_ROW_COLUMNS = VAR_PHAN_QUYEN_ROW_COLUMNS;
export const PHAN_QUYEN_SELECT_FULL = VAR_PHAN_QUYEN_SELECT_FULL;
export const PHAN_QUYEN_RETURNING_FULL = VAR_PHAN_QUYEN_RETURNING_FULL;
