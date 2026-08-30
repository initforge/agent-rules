-- Seed demo: Phòng ban (cây 2 cấp)
-- Chạy SAU scripts/seed-var-he-thong.sql
-- Idempotent — bỏ qua nếu mã phòng ban đã tồn tại

-- =============================================================================
-- Cấp 1 — phòng gốc
-- =============================================================================

INSERT INTO public.var_phong_ban (ma_phong_ban, ten_phong_ban, cap_do, duong_dan, trang_thai, thu_tu)
SELECT v.ma, v.ten, 1, '/' || v.ma, 'Đang hoạt động', v.thu_tu
FROM (VALUES
  ('PB-TECH', 'Phòng Kỹ thuật', 1),
  ('PB-HR',   'Phòng Nhân sự', 2),
  ('PB-FIN',  'Phòng Tài chính - Kế toán', 3),
  ('PB-SALE', 'Phòng Kinh doanh', 4),
  ('PB-WH',   'Phòng Kho vận', 5),
  ('PB-MKT',  'Phòng Marketing', 6),
  ('PB-ADMIN','Phòng Hành chính', 7)
) AS v(ma, ten, thu_tu)
WHERE NOT EXISTS (
  SELECT 1 FROM public.var_phong_ban pb WHERE lower(pb.ma_phong_ban) = lower(v.ma)
);

-- =============================================================================
-- Cấp 2 — nhóm con
-- =============================================================================

INSERT INTO public.var_phong_ban (ma_phong_ban, ten_phong_ban, cha_id, cap_do, duong_dan, trang_thai, thu_tu)
SELECT v.ma, v.ten, parent.id, 2, '/' || parent.ma_phong_ban || '/' || v.ma, 'Đang hoạt động', v.thu_tu
FROM (VALUES
  ('PB-DEV',   'Nhóm Phát triển phần mềm', 'PB-TECH', 1),
  ('PB-INFRA', 'Nhóm Hạ tầng IT',         'PB-TECH', 2),
  ('PB-HR-TD', 'Nhóm Tuyển dụng',         'PB-HR',   1),
  ('PB-HR-DT', 'Nhóm Đào tạo',            'PB-HR',   2),
  ('PB-FIN-KT','Nhóm Kế toán',            'PB-FIN',  1),
  ('PB-FIN-TC','Nhóm Tài chính',          'PB-FIN',  2),
  ('PB-SALE-B2B','Nhóm Kinh doanh B2B',   'PB-SALE', 1),
  ('PB-SALE-B2C','Nhóm Kinh doanh B2C',   'PB-SALE', 2),
  ('PB-WH-NHAP','Nhóm Nhập kho',         'PB-WH',   1),
  ('PB-WH-XUAT','Nhóm Xuất kho',         'PB-WH',   2),
  ('PB-MKT-DT', 'Nhóm Digital Marketing','PB-MKT',  1),
  ('PB-MKT-BR', 'Nhóm Thương hiệu',      'PB-MKT',  2),
  ('PB-ADMIN-VP','Nhóm Văn phòng',       'PB-ADMIN',1),
  ('PB-ADMIN-TC','Nhóm Tổ chức sự kiện',  'PB-ADMIN',2)
) AS v(ma, ten, parent_ma, thu_tu)
JOIN public.var_phong_ban parent ON lower(parent.ma_phong_ban) = lower(v.parent_ma)
WHERE NOT EXISTS (
  SELECT 1 FROM public.var_phong_ban pb WHERE lower(pb.ma_phong_ban) = lower(v.ma)
);
