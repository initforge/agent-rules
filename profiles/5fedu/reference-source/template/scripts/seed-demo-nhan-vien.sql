-- Seed demo: Nhân viên mẫu (~18 người, đa phòng ban)
-- Chạy SAU seed-var-he-thong.sql + seed-demo-phong-ban.sql + seed-demo-chuc-vu.sql
-- Không ghi đè admin — chỉ thêm nếu email chưa tồn tại
--
-- ma_chuc_vu khớp seed-demo-chuc-vu.sql → ten_chuc_vu hiển thị trên UI:
--   Nguyễn Văn Thành     · CEO              → Giám đốc
--   Trần Thị Mai          · CV-PGD           → Phó Giám đốc
--   Lê Hoàng Nam          · CV-TP-PB-TECH    → Trưởng phòng Kỹ thuật
--   Phạm Minh Tuấn        · CV-TN-PB-DEV     → Trưởng nhóm Phát triển phần mềm
--   Võ Thị Hương          · CV-NV-PB-DEV     → Nhân viên Phát triển phần mềm
--   Đặng Quốc Bảo         · CV-TN-PB-INFRA   → Trưởng nhóm Hạ tầng IT
--   Ngô Thanh Tùng        · CV-NV-PB-INFRA   → Nhân viên Hạ tầng IT
--   Bùi Thị Lan           · CV-TP-PB-HR      → Trưởng phòng Nhân sự
--   Hoàng Văn Đức         · CV-NV-PB-HR      → Nhân viên Nhân sự
--   Trịnh Thị Ngọc        · CV-TP-PB-FIN     → Trưởng phòng Kế toán
--   Lý Văn Phú            · CV-NV-PB-FIN     → Nhân viên Kế toán
--   Đinh Công Vinh        · CV-TP-PB-SALE    → Trưởng phòng Kinh doanh
--   Phan Thị Hạnh         · CV-NV-PB-SALE    → Nhân viên Kinh doanh
--   Vũ Đình Khoa          · CV-NV-PB-SALE    → Nhân viên Kinh doanh
--   Cao Văn Long          · CV-TP-PB-WH      → Trưởng phòng Kho vận
--   Nguyễn Thùy Linh      · CV-TP-PB-MKT     → Trưởng phòng Marketing
--   Trần Quang Huy        · CV-NV-PB-MKT     → Nhân viên Marketing
--   Lê Anh Dũng           · CV-NV-PB-TECH    → Nhân viên Kỹ thuật

INSERT INTO public.var_nhan_vien (
  ho_ten, email, ten_dang_nhap, phong_ban_id, chuc_vu_id,
  gioi_tinh, trang_thai, tai_khoan_dang_hoat_dong, so_dien_thoai
)
SELECT
  v.ho_ten,
  v.email,
  NULL,
  pb.id,
  cv.id,
  v.gioi_tinh,
  v.trang_thai,
  false,
  v.so_dien_thoai
FROM (VALUES
  ('Nguyễn Văn Thành',    'thanh.nguyen@company.vn',  'PB-HD',    'CEO',              'Nam', 'Đang làm việc', '0901234567'),
  ('Trần Thị Mai',         'mai.tran@company.vn',      'PB-HD',    'CV-PGD',           'Nữ',  'Đang làm việc', '0902345678'),
  ('Lê Hoàng Nam',         'nam.le@company.vn',        'PB-TECH',  'CV-TP-PB-TECH',    'Nam', 'Đang làm việc', '0903456789'),
  ('Phạm Minh Tuấn',       'tuan.pham@company.vn',     'PB-DEV',   'CV-TN-PB-DEV',     'Nam', 'Đang làm việc', '0904567890'),
  ('Võ Thị Hương',         'huong.vo@company.vn',      'PB-DEV',   'CV-NV-PB-DEV',     'Nữ',  'Đang làm việc', '0905678901'),
  ('Đặng Quốc Bảo',        'bao.dang@company.vn',      'PB-INFRA', 'CV-TN-PB-INFRA',   'Nam', 'Đang làm việc', '0906789012'),
  ('Ngô Thanh Tùng',       'tung.ngo@company.vn',      'PB-INFRA', 'CV-NV-PB-INFRA',   'Nam', 'Đang làm việc', '0907890123'),
  ('Bùi Thị Lan',          'lan.bui@company.vn',       'PB-HR',    'CV-TP-PB-HR',      'Nữ',  'Đang làm việc', '0908901234'),
  ('Hoàng Văn Đức',        'duc.hoang@company.vn',     'PB-HR',    'CV-NV-PB-HR',      'Nam', 'Đang làm việc', '0909012345'),
  ('Trịnh Thị Ngọc',       'ngoc.trinh@company.vn',    'PB-FIN',   'CV-TP-PB-FIN',     'Nữ',  'Đang làm việc', '0910123456'),
  ('Lý Văn Phú',           'phu.ly@company.vn',        'PB-FIN',   'CV-NV-PB-FIN',     'Nam', 'Đang làm việc', '0911234567'),
  ('Đinh Công Vinh',       'vinh.dinh@company.vn',     'PB-SALE',  'CV-TP-PB-SALE',    'Nam', 'Đang làm việc', '0912345678'),
  ('Phan Thị Hạnh',        'hanh.phan@company.vn',     'PB-SALE',  'CV-NV-PB-SALE',    'Nữ',  'Đang làm việc', '0913456789'),
  ('Vũ Đình Khoa',         'khoa.vu@company.vn',       'PB-SALE',  'CV-NV-PB-SALE',    'Nam', 'Thử việc',      '0914567890'),
  ('Cao Văn Long',         'long.cao@company.vn',       'PB-WH',    'CV-TP-PB-WH',      'Nam', 'Đang làm việc', '0915678901'),
  ('Nguyễn Thùy Linh',     'linh.nguyen@company.vn',   'PB-MKT',   'CV-TP-PB-MKT',     'Nữ',  'Đang làm việc', '0917890123'),
  ('Trần Quang Huy',       'huy.tran@company.vn',      'PB-MKT',   'CV-NV-PB-MKT',     'Nam', 'Đang làm việc', '0918901234'),
  ('Lê Anh Dũng',          'dung.le@company.vn',       'PB-TECH',  'CV-NV-PB-TECH',    'Nam', 'Nghỉ việc',     '0919012345')
) AS v(ho_ten, email, ma_phong_ban, ma_chuc_vu, gioi_tinh, trang_thai, so_dien_thoai)
JOIN public.var_phong_ban pb ON lower(pb.ma_phong_ban) = lower(v.ma_phong_ban)
JOIN public.var_chuc_vu cv ON lower(cv.ma_chuc_vu) = lower(v.ma_chuc_vu)
WHERE NOT EXISTS (
  SELECT 1 FROM public.var_nhan_vien nv WHERE lower(nv.email) = lower(v.email)
);
