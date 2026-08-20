-- Seed demo: Thông tin công ty (bổ sung chi tiết)
-- Chạy SAU seed-var-he-thong.sql
-- Upsert singleton id = 1

INSERT INTO public.var_cong_ty (
  id,
  ten_ung_dung,
  mo_ta_ung_dung,
  ten_cong_ty,
  ma_so_thue,
  dia_chi,
  so_dien_thoai,
  email,
  website
)
VALUES (
  1,
  '5F ERP',
  'Hệ thống quản trị doanh nghiệp — module Hệ thống',
  'Công ty TNHH Demo 5F',
  '0312345678',
  '123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
  '028 3822 1234',
  'contact@demo-5f.vn',
  'https://demo-5f.vn'
)
ON CONFLICT (id) DO UPDATE SET
  ten_ung_dung    = EXCLUDED.ten_ung_dung,
  mo_ta_ung_dung  = EXCLUDED.mo_ta_ung_dung,
  ten_cong_ty     = EXCLUDED.ten_cong_ty,
  ma_so_thue      = EXCLUDED.ma_so_thue,
  dia_chi         = EXCLUDED.dia_chi,
  so_dien_thoai   = EXCLUDED.so_dien_thoai,
  email           = EXCLUDED.email,
  website         = EXCLUDED.website,
  tg_cap_nhat     = now();
