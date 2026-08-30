-- Seed demo: Chức vụ gắn phòng ban — tên thủ công theo từng phòng/nhóm
-- Chạy SAU scripts/seed-var-he-thong.sql + scripts/seed-demo-phong-ban.sql
-- Idempotent — chạy lại cập nhật ten_chuc_vu trên DB đã seed
--
-- Quy ước mã: {vai trò}-{mã phòng ban} (vd. CV-TP-PB-FIN)
-- CEO: seed-var-he-thong.sql

-- =============================================================================
-- 0. Dọn chức vụ generic không phòng ban (seed cũ) nếu chưa có NV gán
-- =============================================================================

DELETE FROM public.var_chuc_vu cv
WHERE cv.phong_ban_id IS NULL
  AND lower(cv.ma_chuc_vu) IN ('cv-tp', 'cv-pp', 'cv-tn', 'cv-nv', 'cv-tt')
  AND NOT EXISTS (
    SELECT 1 FROM public.var_nhan_vien nv WHERE nv.chuc_vu_id = cv.id
  );

-- =============================================================================
-- 1. Danh mục chức vụ demo (tên thủ công)
-- =============================================================================

WITH position_seed AS (
  SELECT *
  FROM (VALUES
    -- Ban Giám đốc
    ('PB-HD',     'CV-PGD',           'Phó Giám đốc',                    2, 'Hỗ trợ giám đốc điều hành', 10),

    -- Phòng cấp 1 — Kỹ thuật
    ('PB-TECH',   'CV-TP-PB-TECH',    'Trưởng phòng Kỹ thuật',           3, 'Quản lý phòng ban',         20),
    ('PB-TECH',   'CV-PP-PB-TECH',    'Phó phòng Kỹ thuật',              4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-TECH',   'CV-NV-PB-TECH',    'Nhân viên Kỹ thuật',              6, 'Nhân viên chính thức',       50),

    -- Phòng cấp 1 — Nhân sự
    ('PB-HR',     'CV-TP-PB-HR',      'Trưởng phòng Nhân sự',            3, 'Quản lý phòng ban',         20),
    ('PB-HR',     'CV-PP-PB-HR',      'Phó phòng Nhân sự',               4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-HR',     'CV-NV-PB-HR',      'Nhân viên Nhân sự',               6, 'Nhân viên chính thức',       50),

    -- Phòng cấp 1 — Kế toán (PB-FIN)
    ('PB-FIN',    'CV-TP-PB-FIN',     'Trưởng phòng Kế toán',            3, 'Quản lý phòng ban',         20),
    ('PB-FIN',    'CV-PP-PB-FIN',     'Phó phòng Kế toán',               4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-FIN',    'CV-NV-PB-FIN',     'Nhân viên Kế toán',               6, 'Nhân viên chính thức',       50),

    -- Phòng cấp 1 — Kinh doanh
    ('PB-SALE',   'CV-TP-PB-SALE',    'Trưởng phòng Kinh doanh',         3, 'Quản lý phòng ban',         20),
    ('PB-SALE',   'CV-PP-PB-SALE',    'Phó phòng Kinh doanh',            4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-SALE',   'CV-NV-PB-SALE',    'Nhân viên Kinh doanh',            6, 'Nhân viên chính thức',       50),

    -- Phòng cấp 1 — Kho vận
    ('PB-WH',     'CV-TP-PB-WH',      'Trưởng phòng Kho vận',            3, 'Quản lý phòng ban',         20),
    ('PB-WH',     'CV-PP-PB-WH',      'Phó phòng Kho vận',               4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-WH',     'CV-NV-PB-WH',      'Nhân viên Kho vận',               6, 'Nhân viên chính thức',       50),

    -- Phòng cấp 1 — Marketing
    ('PB-MKT',    'CV-TP-PB-MKT',     'Trưởng phòng Marketing',          3, 'Quản lý phòng ban',         20),
    ('PB-MKT',    'CV-PP-PB-MKT',     'Phó phòng Marketing',             4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-MKT',    'CV-NV-PB-MKT',     'Nhân viên Marketing',             6, 'Nhân viên chính thức',       50),

    -- Phòng cấp 1 — Hành chính
    ('PB-ADMIN',  'CV-TP-PB-ADMIN',   'Trưởng phòng Hành chính',         3, 'Quản lý phòng ban',         20),
    ('PB-ADMIN',  'CV-PP-PB-ADMIN',   'Phó phòng Hành chính',            4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-ADMIN',  'CV-NV-PB-ADMIN',   'Nhân viên Hành chính',            6, 'Nhân viên chính thức',       50),

    -- Nhóm cấp 2 — Phát triển phần mềm
    ('PB-DEV',    'CV-TN-PB-DEV',     'Trưởng nhóm Phát triển phần mềm', 5, 'Quản lý nhóm làm việc',     40),
    ('PB-DEV',    'CV-NV-PB-DEV',     'Nhân viên Phát triển phần mềm',   6, 'Nhân viên chính thức',       50),
    ('PB-DEV',    'CV-TT-PB-DEV',     'Thực tập sinh Phát triển phần mềm', 7, 'Nhân viên thực tập',      60),

    -- Nhóm cấp 2 — Hạ tầng IT
    ('PB-INFRA',  'CV-TN-PB-INFRA',   'Trưởng nhóm Hạ tầng IT',          5, 'Quản lý nhóm làm việc',     40),
    ('PB-INFRA',  'CV-NV-PB-INFRA',   'Nhân viên Hạ tầng IT',            6, 'Nhân viên chính thức',       50),
    ('PB-INFRA',  'CV-TT-PB-INFRA',   'Thực tập sinh Hạ tầng IT',        7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Tuyển dụng
    ('PB-HR-TD',  'CV-TN-PB-HR-TD',   'Trưởng nhóm Tuyển dụng',          5, 'Quản lý nhóm làm việc',     40),
    ('PB-HR-TD',  'CV-NV-PB-HR-TD',   'Nhân viên Tuyển dụng',            6, 'Nhân viên chính thức',       50),
    ('PB-HR-TD',  'CV-TT-PB-HR-TD',   'Thực tập sinh Tuyển dụng',        7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Đào tạo
    ('PB-HR-DT',  'CV-TN-PB-HR-DT',   'Trưởng nhóm Đào tạo',             5, 'Quản lý nhóm làm việc',     40),
    ('PB-HR-DT',  'CV-NV-PB-HR-DT',   'Nhân viên Đào tạo',               6, 'Nhân viên chính thức',       50),
    ('PB-HR-DT',  'CV-TT-PB-HR-DT',   'Thực tập sinh Đào tạo',           7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Kế toán
    ('PB-FIN-KT', 'CV-TN-PB-FIN-KT',  'Trưởng nhóm Kế toán',             5, 'Quản lý nhóm làm việc',     40),
    ('PB-FIN-KT', 'CV-NV-PB-FIN-KT',  'Nhân viên Kế toán',               6, 'Nhân viên chính thức',       50),
    ('PB-FIN-KT', 'CV-TT-PB-FIN-KT',  'Thực tập sinh Kế toán',           7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Tài chính
    ('PB-FIN-TC', 'CV-TN-PB-FIN-TC',  'Trưởng nhóm Tài chính',           5, 'Quản lý nhóm làm việc',     40),
    ('PB-FIN-TC', 'CV-NV-PB-FIN-TC',  'Nhân viên Tài chính',             6, 'Nhân viên chính thức',       50),
    ('PB-FIN-TC', 'CV-TT-PB-FIN-TC',  'Thực tập sinh Tài chính',         7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Kinh doanh B2B
    ('PB-SALE-B2B','CV-TN-PB-SALE-B2B','Trưởng nhóm Kinh doanh B2B',     5, 'Quản lý nhóm làm việc',     40),
    ('PB-SALE-B2B','CV-NV-PB-SALE-B2B','Nhân viên Kinh doanh B2B',      6, 'Nhân viên chính thức',       50),
    ('PB-SALE-B2B','CV-TT-PB-SALE-B2B','Thực tập sinh Kinh doanh B2B',   7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Kinh doanh B2C
    ('PB-SALE-B2C','CV-TN-PB-SALE-B2C','Trưởng nhóm Kinh doanh B2C',     5, 'Quản lý nhóm làm việc',     40),
    ('PB-SALE-B2C','CV-NV-PB-SALE-B2C','Nhân viên Kinh doanh B2C',      6, 'Nhân viên chính thức',       50),
    ('PB-SALE-B2C','CV-TT-PB-SALE-B2C','Thực tập sinh Kinh doanh B2C',   7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Nhập kho
    ('PB-WH-NHAP','CV-TN-PB-WH-NHAP', 'Trưởng nhóm Nhập kho',            5, 'Quản lý nhóm làm việc',     40),
    ('PB-WH-NHAP','CV-NV-PB-WH-NHAP', 'Nhân viên Nhập kho',              6, 'Nhân viên chính thức',       50),
    ('PB-WH-NHAP','CV-TT-PB-WH-NHAP', 'Thực tập sinh Nhập kho',          7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Xuất kho
    ('PB-WH-XUAT','CV-TN-PB-WH-XUAT', 'Trưởng nhóm Xuất kho',            5, 'Quản lý nhóm làm việc',     40),
    ('PB-WH-XUAT','CV-NV-PB-WH-XUAT', 'Nhân viên Xuất kho',              6, 'Nhân viên chính thức',       50),
    ('PB-WH-XUAT','CV-TT-PB-WH-XUAT', 'Thực tập sinh Xuất kho',          7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Digital Marketing
    ('PB-MKT-DT', 'CV-TN-PB-MKT-DT',  'Trưởng nhóm Digital Marketing', 5, 'Quản lý nhóm làm việc',     40),
    ('PB-MKT-DT', 'CV-NV-PB-MKT-DT',  'Nhân viên Digital Marketing',     6, 'Nhân viên chính thức',       50),
    ('PB-MKT-DT', 'CV-TT-PB-MKT-DT',  'Thực tập sinh Digital Marketing', 7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Thương hiệu
    ('PB-MKT-BR', 'CV-TN-PB-MKT-BR',  'Trưởng nhóm Thương hiệu',         5, 'Quản lý nhóm làm việc',     40),
    ('PB-MKT-BR', 'CV-NV-PB-MKT-BR',  'Nhân viên Thương hiệu',           6, 'Nhân viên chính thức',       50),
    ('PB-MKT-BR', 'CV-TT-PB-MKT-BR',  'Thực tập sinh Thương hiệu',       7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Văn phòng
    ('PB-ADMIN-VP','CV-TN-PB-ADMIN-VP','Trưởng nhóm Văn phòng',          5, 'Quản lý nhóm làm việc',     40),
    ('PB-ADMIN-VP','CV-NV-PB-ADMIN-VP','Nhân viên Văn phòng',           6, 'Nhân viên chính thức',       50),
    ('PB-ADMIN-VP','CV-TT-PB-ADMIN-VP','Thực tập sinh Văn phòng',       7, 'Nhân viên thực tập',         60),

    -- Nhóm cấp 2 — Tổ chức sự kiện
    ('PB-ADMIN-TC','CV-TN-PB-ADMIN-TC','Trưởng nhóm Tổ chức sự kiện',   5, 'Quản lý nhóm làm việc',     40),
    ('PB-ADMIN-TC','CV-NV-PB-ADMIN-TC','Nhân viên Tổ chức sự kiện',     6, 'Nhân viên chính thức',       50),
    ('PB-ADMIN-TC','CV-TT-PB-ADMIN-TC','Thực tập sinh Tổ chức sự kiện',  7, 'Nhân viên thực tập',         60)
  ) AS s(ma_phong_ban, ma_chuc_vu, ten_chuc_vu, cap_bac, mo_ta, thu_tu)
),
inserted AS (
  INSERT INTO public.var_chuc_vu (
    ma_chuc_vu, ten_chuc_vu, cap_bac, phong_ban_id, mo_ta, trang_thai, thu_tu
  )
  SELECT
    s.ma_chuc_vu,
    s.ten_chuc_vu,
    s.cap_bac,
    pb.id,
    s.mo_ta,
    'Đang hoạt động',
    s.thu_tu
  FROM position_seed s
  JOIN public.var_phong_ban pb ON lower(pb.ma_phong_ban) = lower(s.ma_phong_ban)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.var_chuc_vu cv
    WHERE lower(cv.ma_chuc_vu) = lower(s.ma_chuc_vu)
  )
  RETURNING id
)
SELECT count(*) AS inserted_count FROM inserted;

-- =============================================================================
-- 2. Đồng bộ tên / metadata khi chạy lại (fix DB đã seed tên generic)
-- =============================================================================

UPDATE public.var_chuc_vu cv
SET
  ten_chuc_vu = s.ten_chuc_vu,
  cap_bac = s.cap_bac,
  thu_tu = s.thu_tu,
  mo_ta = s.mo_ta,
  phong_ban_id = pb.id
FROM (
  VALUES
    ('PB-HD',     'CV-PGD',           'Phó Giám đốc',                    2, 'Hỗ trợ giám đốc điều hành', 10),
    ('PB-TECH',   'CV-TP-PB-TECH',    'Trưởng phòng Kỹ thuật',           3, 'Quản lý phòng ban',         20),
    ('PB-TECH',   'CV-PP-PB-TECH',    'Phó phòng Kỹ thuật',              4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-TECH',   'CV-NV-PB-TECH',    'Nhân viên Kỹ thuật',              6, 'Nhân viên chính thức',       50),
    ('PB-HR',     'CV-TP-PB-HR',      'Trưởng phòng Nhân sự',            3, 'Quản lý phòng ban',         20),
    ('PB-HR',     'CV-PP-PB-HR',      'Phó phòng Nhân sự',               4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-HR',     'CV-NV-PB-HR',      'Nhân viên Nhân sự',               6, 'Nhân viên chính thức',       50),
    ('PB-FIN',    'CV-TP-PB-FIN',     'Trưởng phòng Kế toán',            3, 'Quản lý phòng ban',         20),
    ('PB-FIN',    'CV-PP-PB-FIN',     'Phó phòng Kế toán',               4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-FIN',    'CV-NV-PB-FIN',     'Nhân viên Kế toán',               6, 'Nhân viên chính thức',       50),
    ('PB-SALE',   'CV-TP-PB-SALE',    'Trưởng phòng Kinh doanh',         3, 'Quản lý phòng ban',         20),
    ('PB-SALE',   'CV-PP-PB-SALE',    'Phó phòng Kinh doanh',            4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-SALE',   'CV-NV-PB-SALE',    'Nhân viên Kinh doanh',            6, 'Nhân viên chính thức',       50),
    ('PB-WH',     'CV-TP-PB-WH',      'Trưởng phòng Kho vận',            3, 'Quản lý phòng ban',         20),
    ('PB-WH',     'CV-PP-PB-WH',      'Phó phòng Kho vận',               4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-WH',     'CV-NV-PB-WH',      'Nhân viên Kho vận',               6, 'Nhân viên chính thức',       50),
    ('PB-MKT',    'CV-TP-PB-MKT',     'Trưởng phòng Marketing',          3, 'Quản lý phòng ban',         20),
    ('PB-MKT',    'CV-PP-PB-MKT',     'Phó phòng Marketing',             4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-MKT',    'CV-NV-PB-MKT',     'Nhân viên Marketing',             6, 'Nhân viên chính thức',       50),
    ('PB-ADMIN',  'CV-TP-PB-ADMIN',   'Trưởng phòng Hành chính',         3, 'Quản lý phòng ban',         20),
    ('PB-ADMIN',  'CV-PP-PB-ADMIN',   'Phó phòng Hành chính',            4, 'Hỗ trợ trưởng phòng',       30),
    ('PB-ADMIN',  'CV-NV-PB-ADMIN',   'Nhân viên Hành chính',            6, 'Nhân viên chính thức',       50),
    ('PB-DEV',    'CV-TN-PB-DEV',     'Trưởng nhóm Phát triển phần mềm', 5, 'Quản lý nhóm làm việc',     40),
    ('PB-DEV',    'CV-NV-PB-DEV',     'Nhân viên Phát triển phần mềm',   6, 'Nhân viên chính thức',       50),
    ('PB-DEV',    'CV-TT-PB-DEV',     'Thực tập sinh Phát triển phần mềm', 7, 'Nhân viên thực tập',      60),
    ('PB-INFRA',  'CV-TN-PB-INFRA',   'Trưởng nhóm Hạ tầng IT',          5, 'Quản lý nhóm làm việc',     40),
    ('PB-INFRA',  'CV-NV-PB-INFRA',   'Nhân viên Hạ tầng IT',            6, 'Nhân viên chính thức',       50),
    ('PB-INFRA',  'CV-TT-PB-INFRA',   'Thực tập sinh Hạ tầng IT',        7, 'Nhân viên thực tập',         60),
    ('PB-HR-TD',  'CV-TN-PB-HR-TD',   'Trưởng nhóm Tuyển dụng',          5, 'Quản lý nhóm làm việc',     40),
    ('PB-HR-TD',  'CV-NV-PB-HR-TD',   'Nhân viên Tuyển dụng',            6, 'Nhân viên chính thức',       50),
    ('PB-HR-TD',  'CV-TT-PB-HR-TD',   'Thực tập sinh Tuyển dụng',        7, 'Nhân viên thực tập',         60),
    ('PB-HR-DT',  'CV-TN-PB-HR-DT',   'Trưởng nhóm Đào tạo',             5, 'Quản lý nhóm làm việc',     40),
    ('PB-HR-DT',  'CV-NV-PB-HR-DT',   'Nhân viên Đào tạo',               6, 'Nhân viên chính thức',       50),
    ('PB-HR-DT',  'CV-TT-PB-HR-DT',   'Thực tập sinh Đào tạo',           7, 'Nhân viên thực tập',         60),
    ('PB-FIN-KT', 'CV-TN-PB-FIN-KT',  'Trưởng nhóm Kế toán',             5, 'Quản lý nhóm làm việc',     40),
    ('PB-FIN-KT', 'CV-NV-PB-FIN-KT',  'Nhân viên Kế toán',               6, 'Nhân viên chính thức',       50),
    ('PB-FIN-KT', 'CV-TT-PB-FIN-KT',  'Thực tập sinh Kế toán',           7, 'Nhân viên thực tập',         60),
    ('PB-FIN-TC', 'CV-TN-PB-FIN-TC',  'Trưởng nhóm Tài chính',           5, 'Quản lý nhóm làm việc',     40),
    ('PB-FIN-TC', 'CV-NV-PB-FIN-TC',  'Nhân viên Tài chính',             6, 'Nhân viên chính thức',       50),
    ('PB-FIN-TC', 'CV-TT-PB-FIN-TC',  'Thực tập sinh Tài chính',         7, 'Nhân viên thực tập',         60),
    ('PB-SALE-B2B','CV-TN-PB-SALE-B2B','Trưởng nhóm Kinh doanh B2B',     5, 'Quản lý nhóm làm việc',     40),
    ('PB-SALE-B2B','CV-NV-PB-SALE-B2B','Nhân viên Kinh doanh B2B',      6, 'Nhân viên chính thức',       50),
    ('PB-SALE-B2B','CV-TT-PB-SALE-B2B','Thực tập sinh Kinh doanh B2B',   7, 'Nhân viên thực tập',         60),
    ('PB-SALE-B2C','CV-TN-PB-SALE-B2C','Trưởng nhóm Kinh doanh B2C',     5, 'Quản lý nhóm làm việc',     40),
    ('PB-SALE-B2C','CV-NV-PB-SALE-B2C','Nhân viên Kinh doanh B2C',      6, 'Nhân viên chính thức',       50),
    ('PB-SALE-B2C','CV-TT-PB-SALE-B2C','Thực tập sinh Kinh doanh B2C',   7, 'Nhân viên thực tập',         60),
    ('PB-WH-NHAP','CV-TN-PB-WH-NHAP', 'Trưởng nhóm Nhập kho',            5, 'Quản lý nhóm làm việc',     40),
    ('PB-WH-NHAP','CV-NV-PB-WH-NHAP', 'Nhân viên Nhập kho',              6, 'Nhân viên chính thức',       50),
    ('PB-WH-NHAP','CV-TT-PB-WH-NHAP', 'Thực tập sinh Nhập kho',          7, 'Nhân viên thực tập',         60),
    ('PB-WH-XUAT','CV-TN-PB-WH-XUAT', 'Trưởng nhóm Xuất kho',            5, 'Quản lý nhóm làm việc',     40),
    ('PB-WH-XUAT','CV-NV-PB-WH-XUAT', 'Nhân viên Xuất kho',              6, 'Nhân viên chính thức',       50),
    ('PB-WH-XUAT','CV-TT-PB-WH-XUAT', 'Thực tập sinh Xuất kho',          7, 'Nhân viên thực tập',         60),
    ('PB-MKT-DT', 'CV-TN-PB-MKT-DT',  'Trưởng nhóm Digital Marketing', 5, 'Quản lý nhóm làm việc',     40),
    ('PB-MKT-DT', 'CV-NV-PB-MKT-DT',  'Nhân viên Digital Marketing',     6, 'Nhân viên chính thức',       50),
    ('PB-MKT-DT', 'CV-TT-PB-MKT-DT',  'Thực tập sinh Digital Marketing', 7, 'Nhân viên thực tập',         60),
    ('PB-MKT-BR', 'CV-TN-PB-MKT-BR',  'Trưởng nhóm Thương hiệu',         5, 'Quản lý nhóm làm việc',     40),
    ('PB-MKT-BR', 'CV-NV-PB-MKT-BR',  'Nhân viên Thương hiệu',           6, 'Nhân viên chính thức',       50),
    ('PB-MKT-BR', 'CV-TT-PB-MKT-BR',  'Thực tập sinh Thương hiệu',       7, 'Nhân viên thực tập',         60),
    ('PB-ADMIN-VP','CV-TN-PB-ADMIN-VP','Trưởng nhóm Văn phòng',          5, 'Quản lý nhóm làm việc',     40),
    ('PB-ADMIN-VP','CV-NV-PB-ADMIN-VP','Nhân viên Văn phòng',           6, 'Nhân viên chính thức',       50),
    ('PB-ADMIN-VP','CV-TT-PB-ADMIN-VP','Thực tập sinh Văn phòng',       7, 'Nhân viên thực tập',         60),
    ('PB-ADMIN-TC','CV-TN-PB-ADMIN-TC','Trưởng nhóm Tổ chức sự kiện',   5, 'Quản lý nhóm làm việc',     40),
    ('PB-ADMIN-TC','CV-NV-PB-ADMIN-TC','Nhân viên Tổ chức sự kiện',     6, 'Nhân viên chính thức',       50),
    ('PB-ADMIN-TC','CV-TT-PB-ADMIN-TC','Thực tập sinh Tổ chức sự kiện',  7, 'Nhân viên thực tập',         60)
) AS s(ma_phong_ban, ma_chuc_vu, ten_chuc_vu, cap_bac, mo_ta, thu_tu)
JOIN public.var_phong_ban pb ON lower(pb.ma_phong_ban) = lower(s.ma_phong_ban)
WHERE lower(cv.ma_chuc_vu) = lower(s.ma_chuc_vu);
