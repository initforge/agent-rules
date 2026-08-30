-- Seed demo: Phân quyền theo chức vụ (một dòng / module, quyen CSV)
-- Chạy SAU migrate-var-phan-quyen-csv.sql + seed-demo-chuc-vu.sql
-- CEO đã được seed trong seed-var-he-thong.sql
-- Khớp cả mã gốc (CV-TP) và mã theo phòng ban (CV-TP-PB-TECH, …)
-- Idempotent — ON CONFLICT upsert

INSERT INTO public.var_phan_quyen (module_key, chuc_vu_id, quyen)
SELECT m.module_key, cv.id, m.quyen
FROM public.var_chuc_vu cv
CROSS JOIN (
  VALUES
    -- Trưởng phòng: CRUD nhân viên + phòng ban, xem các module còn lại
    ('CV-TP', 'nhan_vien',         'xem,them,sua,xoa'),
    ('CV-TP', 'phong_ban',         'xem,them,sua,xoa'),
    ('CV-TP', 'chuc_vu',           'xem,them,sua'),
    ('CV-TP', 'thong_tin_cong_ty', 'xem'),
    ('CV-TP', 'phan_quyen',        'xem'),
    -- Phó phòng: xem + thêm + sửa (không xóa)
    ('CV-PP', 'nhan_vien',         'xem,them,sua'),
    ('CV-PP', 'phong_ban',         'xem'),
    ('CV-PP', 'chuc_vu',           'xem'),
    ('CV-PP', 'thong_tin_cong_ty', 'xem'),
    -- Trưởng nhóm: xem + sửa nhân viên
    ('CV-TN', 'nhan_vien',         'xem,sua'),
    ('CV-TN', 'phong_ban',         'xem'),
    -- Nhân viên: chỉ xem
    ('CV-NV', 'nhan_vien',         'xem'),
    ('CV-NV', 'phong_ban',         'xem'),
    ('CV-NV', 'chuc_vu',           'xem'),
    -- Phó GĐ: gần full trừ phân quyền
    ('CV-PGD','nhan_vien',         'xem,them,sua,xoa'),
    ('CV-PGD','phong_ban',         'xem,them,sua,xoa'),
    ('CV-PGD','chuc_vu',           'xem,them,sua,xoa'),
    ('CV-PGD','thong_tin_cong_ty', 'xem,sua'),
    ('CV-PGD','phan_quyen',        'xem')
) AS m(ma_chuc_vu, module_key, quyen)
WHERE lower(cv.ma_chuc_vu) = lower(m.ma_chuc_vu)
   OR cv.ma_chuc_vu LIKE m.ma_chuc_vu || '-%'
ON CONFLICT (chuc_vu_id, module_key) DO UPDATE
  SET quyen = EXCLUDED.quyen,
      tg_cap_nhat = now();
