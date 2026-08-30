-- Seed dữ liệu nền (chạy SAU scripts/bootstrap-var-he-thong.sql)
-- Idempotent — có thể chạy lại an toàn.
-- Hướng dẫn: docs/supabase-setup.md · scripts/README-seed.md
--
-- Dữ liệu demo thêm: seed-demo-phong-ban → seed-demo-chuc-vu → nhan-vien → phan-quyen → cong-ty
-- DB cũ (quyền nhiều dòng): chạy scripts/migrate-var-phan-quyen-csv.sql trước khi seed quyền
--
-- Lưu ý: vẫn cần tạo user Auth thủ công (Authentication → Users):
--   Email: admin@gmail.com  (ten_dang_nhap "admin" + VITE_AUTH_EMAIL_SUFFIX)
--   User metadata: { "full_name": "Admin", "id_chuc_vu": ["<uuid-chuc-vu-CEO>"] }
--   Quyền UI/RLS lấy từ var_phan_quyen (mục 5), không dùng user_metadata.role.

-- =============================================================================
-- 1. Phòng ban gốc
-- =============================================================================

INSERT INTO public.var_phong_ban (
  ma_phong_ban, ten_phong_ban, cap_do, duong_dan, trang_thai, thu_tu
)
SELECT 'PB-HD', 'Ban Giám đốc', 1, '/1', 'Đang hoạt động', 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.var_phong_ban WHERE lower(ma_phong_ban) = lower('PB-HD')
);

-- =============================================================================
-- 2. Chức vụ: CEO (Ban Giám đốc)
-- Chức vụ theo phòng ban: seed-demo-chuc-vu.sql (sau seed-demo-phong-ban.sql)
-- =============================================================================

INSERT INTO public.var_chuc_vu (
  ma_chuc_vu, ten_chuc_vu, cap_bac, phong_ban_id, trang_thai, thu_tu
)
SELECT 'CEO', 'Giám đốc', 1, pb.id, 'Đang hoạt động', 0
FROM public.var_phong_ban pb
WHERE lower(pb.ma_phong_ban) = lower('PB-HD')
  AND NOT EXISTS (
    SELECT 1 FROM public.var_chuc_vu WHERE lower(ma_chuc_vu) = lower('CEO')
  );

UPDATE public.var_chuc_vu cv
SET cap_bac = 1, thu_tu = 0, phong_ban_id = pb.id
FROM public.var_phong_ban pb
WHERE lower(cv.ma_chuc_vu) = lower('CEO')
  AND lower(pb.ma_phong_ban) = lower('PB-HD')
  AND (
    cv.phong_ban_id IS DISTINCT FROM pb.id
    OR cv.cap_bac IS DISTINCT FROM 1
  );

-- =============================================================================
-- 3. Nhân viên admin (khớp ten_dang_nhap với Auth)
-- =============================================================================

INSERT INTO public.var_nhan_vien (
  ho_ten, email, ten_dang_nhap, phong_ban_id, chuc_vu_id,
  gioi_tinh, trang_thai, tai_khoan_dang_hoat_dong, so_dien_thoai
)
SELECT
  'Admin',
  'admin@company.vn',
  'admin',
  pb.id,
  cv.id,
  'Nam',
  'Đang làm việc',
  true,
  ''
FROM public.var_phong_ban pb
CROSS JOIN public.var_chuc_vu cv
WHERE lower(pb.ma_phong_ban) = lower('PB-HD')
  AND lower(cv.ma_chuc_vu) = lower('CEO')
  AND NOT EXISTS (
    SELECT 1 FROM public.var_nhan_vien WHERE lower(ten_dang_nhap) = lower('admin')
  );

-- =============================================================================
-- 4. Thông tin công ty (singleton id = 1)
-- =============================================================================

INSERT INTO public.var_cong_ty (
  id, ten_ung_dung, ten_cong_ty, ma_so_thue
)
VALUES (1, '5F ERP', 'Công ty của bạn', '')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 5. Quyền đầy đủ cho chức vụ CEO — một dòng / module, quyen CSV
-- =============================================================================

DELETE FROM public.var_phan_quyen pq
USING public.var_chuc_vu cv
WHERE pq.chuc_vu_id = cv.id
  AND lower(cv.ma_chuc_vu) = lower('CEO');

INSERT INTO public.var_phan_quyen (module_key, chuc_vu_id, quyen)
SELECT m.module_key, cv.id, 'xem,them,sua,xoa'
FROM public.var_chuc_vu cv
CROSS JOIN (
  VALUES
    ('nhan_vien'),
    ('phong_ban'),
    ('chuc_vu'),
    ('thong_tin_cong_ty'),
    ('phan_quyen')
) AS m(module_key)
WHERE lower(cv.ma_chuc_vu) = lower('CEO')
ON CONFLICT (chuc_vu_id, module_key) DO UPDATE
  SET quyen = EXCLUDED.quyen,
      tg_cap_nhat = now();
