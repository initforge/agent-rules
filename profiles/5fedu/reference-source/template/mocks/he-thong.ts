/**
 * Mock Data - Hệ thống (Phòng ban, Chức vụ, Cấp bậc, Nhân viên)
 * Dữ liệu có liên kết chặt chẽ với nhau
 */

import { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Branch } from '@/features/he-thong/chi-nhanh/core/types';
import { Employee } from '@/features/he-thong/nhan-vien/core/types';

// ==================== PHÒNG BAN ====================
export const MOCK_DEPARTMENTS: Department[] = [
  {
    id: 'dep-0',
    ma_phong_ban: 'PB-GD',
    ten_phong_ban: 'Phòng Ban Giám đốc',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/dep-0',
    trang_thai: 'Đang hoạt động',
    thu_tu: 0,
    tg_tao: '2023-01-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  // Nhóm con thuộc Phòng Ban Giám đốc
  { id: 'dep-0-1', ma_phong_ban: 'PB-GD-DH', ten_phong_ban: 'Nhóm điều hành', cha_id: 'dep-0', cap_do: 2, duong_dan: '/dep-0/dep-0-1', trang_thai: 'Đang hoạt động', thu_tu: 1, tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  { id: 'dep-0-2', ma_phong_ban: 'PB-GD-TL', ten_phong_ban: 'Nhóm trợ lý', cha_id: 'dep-0', cap_do: 2, duong_dan: '/dep-0/dep-0-2', trang_thai: 'Đang hoạt động', thu_tu: 2, tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  {
    id: 'dep-1',
    ma_phong_ban: 'PB-TECH',
    ten_phong_ban: 'Phòng Kỹ thuật',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/dep-1',
    trang_thai: 'Đang hoạt động',
    thu_tu: 1,
    tg_tao: '2023-01-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dep-2',
    ma_phong_ban: 'PB-HR',
    ten_phong_ban: 'Phòng Nhân sự',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/dep-2',
    trang_thai: 'Đang hoạt động',
    thu_tu: 2,
    tg_tao: '2023-01-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dep-3',
    ma_phong_ban: 'PB-FIN',
    ten_phong_ban: 'Phòng Tài chính - Kế toán',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/dep-3',
    trang_thai: 'Đang hoạt động',
    thu_tu: 3,
    tg_tao: '2023-01-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dep-4',
    ma_phong_ban: 'PB-SALE',
    ten_phong_ban: 'Phòng Kinh doanh',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/dep-4',
    trang_thai: 'Đang hoạt động',
    thu_tu: 4,
    tg_tao: '2023-01-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dep-5',
    ma_phong_ban: 'PB-WH',
    ten_phong_ban: 'Phòng Kho vận',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/dep-5',
    trang_thai: 'Đang hoạt động',
    thu_tu: 5,
    tg_tao: '2023-01-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dep-6',
    ma_phong_ban: 'PB-MKT',
    ten_phong_ban: 'Phòng Marketing',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/dep-6',
    trang_thai: 'Đang hoạt động',
    thu_tu: 6,
    tg_tao: '2023-01-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dep-7',
    ma_phong_ban: 'PB-ADMIN',
    ten_phong_ban: 'Phòng Hành chính',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/dep-7',
    trang_thai: 'Đang hoạt động',
    thu_tu: 7,
    tg_tao: '2023-01-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  // Phòng con thuộc Phòng Kỹ thuật
  {
    id: 'dep-1-1',
    ma_phong_ban: 'PB-DEV',
    ten_phong_ban: 'Nhóm Phát triển phần mềm',
    cha_id: 'dep-1',
    cap_do: 2,
    duong_dan: '/dep-1/dep-1-1',
    trang_thai: 'Đang hoạt động',
    thu_tu: 1,
    tg_tao: '2023-03-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dep-1-2',
    ma_phong_ban: 'PB-INFRA',
    ten_phong_ban: 'Nhóm Hạ tầng IT',
    cha_id: 'dep-1',
    cap_do: 2,
    duong_dan: '/dep-1/dep-1-2',
    trang_thai: 'Đang hoạt động',
    thu_tu: 2,
    tg_tao: '2023-03-01T00:00:00Z',
    tg_cap_nhat: '2024-01-15T10:30:00Z'
  },
  // Phòng con thuộc Phòng Nhân sự
  { id: 'dep-2-1', ma_phong_ban: 'PB-HR-TD', ten_phong_ban: 'Nhóm Tuyển dụng', cha_id: 'dep-2', cap_do: 2, duong_dan: '/dep-2/dep-2-1', trang_thai: 'Đang hoạt động', thu_tu: 1, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  { id: 'dep-2-2', ma_phong_ban: 'PB-HR-DT', ten_phong_ban: 'Nhóm Đào tạo', cha_id: 'dep-2', cap_do: 2, duong_dan: '/dep-2/dep-2-2', trang_thai: 'Đang hoạt động', thu_tu: 2, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  // Phòng con thuộc Phòng Tài chính - Kế toán
  { id: 'dep-3-1', ma_phong_ban: 'PB-FIN-KT', ten_phong_ban: 'Nhóm Kế toán', cha_id: 'dep-3', cap_do: 2, duong_dan: '/dep-3/dep-3-1', trang_thai: 'Đang hoạt động', thu_tu: 1, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  { id: 'dep-3-2', ma_phong_ban: 'PB-FIN-TC', ten_phong_ban: 'Nhóm Tài chính', cha_id: 'dep-3', cap_do: 2, duong_dan: '/dep-3/dep-3-2', trang_thai: 'Đang hoạt động', thu_tu: 2, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  // Phòng con thuộc Phòng Kinh doanh
  { id: 'dep-4-1', ma_phong_ban: 'PB-SALE-B2B', ten_phong_ban: 'Nhóm Kinh doanh B2B', cha_id: 'dep-4', cap_do: 2, duong_dan: '/dep-4/dep-4-1', trang_thai: 'Đang hoạt động', thu_tu: 1, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  { id: 'dep-4-2', ma_phong_ban: 'PB-SALE-B2C', ten_phong_ban: 'Nhóm Kinh doanh B2C', cha_id: 'dep-4', cap_do: 2, duong_dan: '/dep-4/dep-4-2', trang_thai: 'Đang hoạt động', thu_tu: 2, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  // Phòng con thuộc Phòng Kho vận
  { id: 'dep-5-1', ma_phong_ban: 'PB-WH-NHAP', ten_phong_ban: 'Nhóm Nhập kho', cha_id: 'dep-5', cap_do: 2, duong_dan: '/dep-5/dep-5-1', trang_thai: 'Đang hoạt động', thu_tu: 1, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  { id: 'dep-5-2', ma_phong_ban: 'PB-WH-XUAT', ten_phong_ban: 'Nhóm Xuất kho', cha_id: 'dep-5', cap_do: 2, duong_dan: '/dep-5/dep-5-2', trang_thai: 'Đang hoạt động', thu_tu: 2, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  // Phòng con thuộc Phòng Marketing
  { id: 'dep-6-1', ma_phong_ban: 'PB-MKT-DT', ten_phong_ban: 'Nhóm Digital Marketing', cha_id: 'dep-6', cap_do: 2, duong_dan: '/dep-6/dep-6-1', trang_thai: 'Đang hoạt động', thu_tu: 1, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  { id: 'dep-6-2', ma_phong_ban: 'PB-MKT-BR', ten_phong_ban: 'Nhóm Thương hiệu', cha_id: 'dep-6', cap_do: 2, duong_dan: '/dep-6/dep-6-2', trang_thai: 'Đang hoạt động', thu_tu: 2, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  // Phòng con thuộc Phòng Hành chính
  { id: 'dep-7-1', ma_phong_ban: 'PB-ADMIN-VP', ten_phong_ban: 'Nhóm Văn phòng', cha_id: 'dep-7', cap_do: 2, duong_dan: '/dep-7/dep-7-1', trang_thai: 'Đang hoạt động', thu_tu: 1, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
  { id: 'dep-7-2', ma_phong_ban: 'PB-ADMIN-TC', ten_phong_ban: 'Nhóm Tổ chức sự kiện', cha_id: 'dep-7', cap_do: 2, duong_dan: '/dep-7/dep-7-2', trang_thai: 'Đang hoạt động', thu_tu: 2, tg_tao: '2023-02-01T00:00:00Z', tg_cap_nhat: '2024-01-15T10:30:00Z' },
];

// ==================== CHI NHÁNH ====================
export const MOCK_BRANCHES: Branch[] = [
  {
    id: 'branch-1',
    ma_chi_nhanh: 'CN-HCM',
    ten_chi_nhanh: 'Chi nhánh TP. Hồ Chí Minh',
    dia_chi: 'Số 12 Nguyễn Huệ, Quận 1',
    tinh_thanh: 'TP. Hồ Chí Minh',
    quan_huyen: 'Quận 1',
    vi_do: 10.773256,
    kinh_do: 106.704321,
    duong_dan_map: 'https://maps.app.goo.gl/1d4QJwqJgTQw5nUj7',
    gio_vao_sang: '08:00',
    gio_ra_sang: '12:00',
    gio_vao_chieu: '13:00',
    gio_ra_chieu: '17:30',
    trang_thai: 'Đang hoạt động',
    tg_tao: '2024-01-15T08:00:00Z',
    tg_cap_nhat: '2025-01-10T09:30:00Z',
  },
  {
    id: 'branch-2',
    ma_chi_nhanh: 'CN-HN',
    ten_chi_nhanh: 'Chi nhánh Hà Nội',
    dia_chi: 'Số 88 Trần Duy Hưng, Cầu Giấy',
    tinh_thanh: 'Hà Nội',
    quan_huyen: 'Cầu Giấy',
    vi_do: 21.016897,
    kinh_do: 105.798233,
    duong_dan_map: 'https://maps.app.goo.gl/2G6X7Gm9mXJqf8Qm8',
    gio_vao_sang: '08:00',
    gio_ra_sang: '12:00',
    gio_vao_chieu: '13:30',
    gio_ra_chieu: '17:30',
    trang_thai: 'Đang hoạt động',
    tg_tao: '2024-02-20T08:00:00Z',
    tg_cap_nhat: '2025-01-20T10:15:00Z',
  },
  {
    id: 'branch-3',
    ma_chi_nhanh: 'CN-DN',
    ten_chi_nhanh: 'Chi nhánh Đà Nẵng',
    dia_chi: 'Số 22 Bạch Đằng, Hải Châu',
    tinh_thanh: 'Đà Nẵng',
    quan_huyen: 'Hải Châu',
    vi_do: 16.06778,
    kinh_do: 108.22083,
    duong_dan_map: 'https://maps.app.goo.gl/9vZWm1vUz4vw1q5a6',
    gio_vao_sang: '08:00',
    gio_ra_sang: '12:00',
    gio_vao_chieu: '13:00',
    gio_ra_chieu: '17:00',
    trang_thai: 'Ngừng hoạt động',
    tg_tao: '2024-03-12T08:00:00Z',
    tg_cap_nhat: '2025-01-05T14:20:00Z',
  },
];

// ==================== CHỨC VỤ ====================
export interface Position {
  id: string;
  ma_chuc_vu: string;
  ten_chuc_vu: string;
  mo_ta?: string;
  /** Text: "Đang hoạt động" | "Ngừng hoạt động" */
  trang_thai: 'Đang hoạt động' | 'Ngừng hoạt động';
  tg_tao: string;
  tg_cap_nhat: string;
}

export const MOCK_POSITIONS: Position[] = [
  { id: 'pos-1', ma_chuc_vu: 'CV-GD', ten_chuc_vu: 'Giám đốc', mo_ta: 'Điều hành toàn bộ công ty', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'pos-2', ma_chuc_vu: 'CV-PGD', ten_chuc_vu: 'Phó Giám đốc', mo_ta: 'Hỗ trợ giám đốc điều hành', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'pos-3', ma_chuc_vu: 'CV-TP', ten_chuc_vu: 'Trưởng phòng', mo_ta: 'Quản lý phòng ban', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'pos-4', ma_chuc_vu: 'CV-PP', ten_chuc_vu: 'Phó phòng', mo_ta: 'Hỗ trợ trưởng phòng', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'pos-5', ma_chuc_vu: 'CV-TN', ten_chuc_vu: 'Trưởng nhóm', mo_ta: 'Quản lý nhóm làm việc', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'pos-6', ma_chuc_vu: 'CV-NV', ten_chuc_vu: 'Nhân viên', mo_ta: 'Nhân viên chính thức', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'pos-7', ma_chuc_vu: 'CV-TT', ten_chuc_vu: 'Thực tập sinh', mo_ta: 'Nhân viên thực tập', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
];

// ==================== CẤP BẬC ====================
export interface JobLevel {
  id: string;
  ma_cap_bac: string;
  ten_cap_bac: string;
  he_so_luong: number;
  mo_ta?: string;
  /** Text: "Đang hoạt động" | "Ngừng hoạt động" */
  trang_thai: 'Đang hoạt động' | 'Ngừng hoạt động';
  tg_tao: string;
  tg_cap_nhat: string;
}

export const MOCK_JOB_LEVELS: JobLevel[] = [
  { id: 'lvl-1', ma_cap_bac: 'CB-01', ten_cap_bac: 'Fresher', he_so_luong: 1.0, mo_ta: 'Mới ra trường, dưới 1 năm kinh nghiệm', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'lvl-2', ma_cap_bac: 'CB-02', ten_cap_bac: 'Junior', he_so_luong: 1.3, mo_ta: '1-2 năm kinh nghiệm', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'lvl-3', ma_cap_bac: 'CB-03', ten_cap_bac: 'Middle', he_so_luong: 1.8, mo_ta: '2-4 năm kinh nghiệm', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'lvl-4', ma_cap_bac: 'CB-04', ten_cap_bac: 'Senior', he_so_luong: 2.5, mo_ta: '4-7 năm kinh nghiệm', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
  { id: 'lvl-5', ma_cap_bac: 'CB-05', ten_cap_bac: 'Expert', he_so_luong: 3.5, mo_ta: 'Trên 7 năm, chuyên gia', trang_thai: 'Đang hoạt động', tg_tao: '2023-01-01T00:00:00Z', tg_cap_nhat: '2024-01-01T00:00:00Z' },
];

// ==================== NHÂN VIÊN ====================
export const MOCK_EMPLOYEES: Employee[] = [
  // Ban Giám đốc
  {
    id: 'emp-000',
    ma_nhan_vien: 'NV000',
    ho_ten: 'Lê Minh Công',
    email: 'admin@5fedu.com',
    ten_dang_nhap: 'admin',
    must_change_password: false,
    tai_khoan_dang_hoat_dong: true,
    so_dien_thoai: '0900000000',
    phong_ban_id: 'dep-7',
    ten_phong_ban: 'Phòng Hành chính',
    chuc_vu_id: 'pos-1',
    ten_chuc_vu: 'Giám đốc',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2019-01-10',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Le+Minh+Cong&background=0f172a&color=fff'
  },
  {
    id: 'emp-001',
    ma_nhan_vien: 'NV001',
    ho_ten: 'Nguyễn Văn Thành',
    email: 'thanh.nguyen@company.vn',
    so_dien_thoai: '0901234567',
    phong_ban_id: 'dep-7',
    ten_phong_ban: 'Phòng Hành chính',
    chuc_vu_id: 'pos-1',
    ten_chuc_vu: 'Giám đốc',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2020-01-15',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Nguyen+Van+Thanh&background=1e40af&color=fff'
  },
  {
    id: 'emp-002',
    ma_nhan_vien: 'NV002',
    ho_ten: 'Trần Thị Mai',
    email: 'mai.tran@company.vn',
    so_dien_thoai: '0902345678',
    phong_ban_id: 'dep-7',
    ten_phong_ban: 'Phòng Hành chính',
    chuc_vu_id: 'pos-2',
    ten_chuc_vu: 'Phó Giám đốc',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2020-03-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Tran+Thi+Mai&background=7c3aed&color=fff'
  },
  // Phòng Kỹ thuật
  {
    id: 'emp-003',
    ma_nhan_vien: 'NV003',
    ho_ten: 'Lê Hoàng Nam',
    email: 'nam.le@company.vn',
    so_dien_thoai: '0903456789',
    phong_ban_id: 'dep-1',
    ten_phong_ban: 'Phòng Kỹ thuật',
    chuc_vu_id: 'pos-3',
    ten_chuc_vu: 'Trưởng phòng',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-06-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Le+Hoang+Nam&background=059669&color=fff'
  },
  {
    id: 'emp-004',
    ma_nhan_vien: 'NV004',
    ho_ten: 'Phạm Minh Tuấn',
    email: 'tuan.pham@company.vn',
    so_dien_thoai: '0904567890',
    phong_ban_id: 'dep-1-1',
    ten_phong_ban: 'Nhóm Phát triển phần mềm',
    chuc_vu_id: 'pos-5',
    ten_chuc_vu: 'Trưởng nhóm',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2022-01-10',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Pham+Minh+Tuan&background=0891b2&color=fff'
  },
  {
    id: 'emp-005',
    ma_nhan_vien: 'NV005',
    ho_ten: 'Võ Thị Hương',
    email: 'huong.vo@company.vn',
    so_dien_thoai: '0905678901',
    phong_ban_id: 'dep-1-1',
    ten_phong_ban: 'Nhóm Phát triển phần mềm',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2022-08-15',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Vo+Thi+Huong&background=dc2626&color=fff'
  },
  {
    id: 'emp-006',
    ma_nhan_vien: 'NV006',
    ho_ten: 'Đặng Quốc Bảo',
    email: 'bao.dang@company.vn',
    so_dien_thoai: '0906789012',
    phong_ban_id: 'dep-1-2',
    ten_phong_ban: 'Nhóm Hạ tầng IT',
    chuc_vu_id: 'pos-5',
    ten_chuc_vu: 'Trưởng nhóm',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-11-20',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Dang+Quoc+Bao&background=ea580c&color=fff'
  },
  {
    id: 'emp-007',
    ma_nhan_vien: 'NV007',
    ho_ten: 'Ngô Thanh Tùng',
    email: 'tung.ngo@company.vn',
    so_dien_thoai: '0907890123',
    phong_ban_id: 'dep-1-2',
    ten_phong_ban: 'Nhóm Hạ tầng IT',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2023-02-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Ngo+Thanh+Tung&background=4f46e5&color=fff'
  },
  // Phòng Nhân sự
  {
    id: 'emp-008',
    ma_nhan_vien: 'NV008',
    ho_ten: 'Bùi Thị Lan',
    email: 'lan.bui@company.vn',
    so_dien_thoai: '0908901234',
    phong_ban_id: 'dep-2',
    ten_phong_ban: 'Phòng Nhân sự',
    chuc_vu_id: 'pos-3',
    ten_chuc_vu: 'Trưởng phòng',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-04-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Bui+Thi+Lan&background=be185d&color=fff'
  },
  {
    id: 'emp-009',
    ma_nhan_vien: 'NV009',
    ho_ten: 'Hoàng Văn Đức',
    email: 'duc.hoang@company.vn',
    so_dien_thoai: '0909012345',
    phong_ban_id: 'dep-2',
    ten_phong_ban: 'Phòng Nhân sự',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2023-05-15',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Hoang+Van+Duc&background=0d9488&color=fff'
  },
  // Phòng Tài chính
  {
    id: 'emp-010',
    ma_nhan_vien: 'NV010',
    ho_ten: 'Trịnh Thị Ngọc',
    email: 'ngoc.trinh@company.vn',
    so_dien_thoai: '0910123456',
    phong_ban_id: 'dep-3',
    ten_phong_ban: 'Phòng Tài chính - Kế toán',
    chuc_vu_id: 'pos-3',
    ten_chuc_vu: 'Trưởng phòng',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2020-09-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Trinh+Thi+Ngoc&background=7c2d12&color=fff'
  },
  {
    id: 'emp-011',
    ma_nhan_vien: 'NV011',
    ho_ten: 'Lý Văn Phú',
    email: 'phu.ly@company.vn',
    so_dien_thoai: '0911234567',
    phong_ban_id: 'dep-3',
    ten_phong_ban: 'Phòng Tài chính - Kế toán',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2022-03-10',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Ly+Van+Phu&background=475569&color=fff'
  },
  // Phòng Kinh doanh
  {
    id: 'emp-012',
    ma_nhan_vien: 'NV012',
    ho_ten: 'Đinh Công Vinh',
    email: 'vinh.dinh@company.vn',
    so_dien_thoai: '0912345678',
    phong_ban_id: 'dep-4',
    ten_phong_ban: 'Phòng Kinh doanh',
    chuc_vu_id: 'pos-3',
    ten_chuc_vu: 'Trưởng phòng',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-01-15',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Dinh+Cong+Vinh&background=15803d&color=fff'
  },
  {
    id: 'emp-013',
    ma_nhan_vien: 'NV013',
    ho_ten: 'Phan Thị Hạnh',
    email: 'hanh.phan@company.vn',
    so_dien_thoai: '0913456789',
    phong_ban_id: 'dep-4',
    ten_phong_ban: 'Phòng Kinh doanh',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2023-01-05',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Phan+Thi+Hanh&background=c026d3&color=fff'
  },
  {
    id: 'emp-014',
    ma_nhan_vien: 'NV014',
    ho_ten: 'Vũ Đình Khoa',
    email: 'khoa.vu@company.vn',
    so_dien_thoai: '0914567890',
    phong_ban_id: 'dep-4',
    ten_phong_ban: 'Phòng Kinh doanh',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Thử việc',
    ngay_vao_lam: '2024-11-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Vu+Dinh+Khoa&background=0369a1&color=fff'
  },
  // Phòng Kho vận
  {
    id: 'emp-015',
    ma_nhan_vien: 'NV015',
    ho_ten: 'Cao Văn Long',
    email: 'long.cao@company.vn',
    so_dien_thoai: '0915678901',
    phong_ban_id: 'dep-5',
    ten_phong_ban: 'Phòng Kho vận',
    chuc_vu_id: 'pos-3',
    ten_chuc_vu: 'Trưởng phòng',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-07-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Cao+Van+Long&background=b45309&color=fff'
  },
  {
    id: 'emp-016',
    ma_nhan_vien: 'NV016',
    ho_ten: 'Đỗ Thị Hằng',
    email: 'hang.do@company.vn',
    so_dien_thoai: '0916789012',
    phong_ban_id: 'dep-5',
    ten_phong_ban: 'Phòng Kho vận',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2022-09-20',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Do+Thi+Hang&background=65a30d&color=fff'
  },
  // Phòng Marketing
  {
    id: 'emp-017',
    ma_nhan_vien: 'NV017',
    ho_ten: 'Nguyễn Thùy Linh',
    email: 'linh.nguyen@company.vn',
    so_dien_thoai: '0917890123',
    phong_ban_id: 'dep-6',
    ten_phong_ban: 'Phòng Marketing',
    chuc_vu_id: 'pos-3',
    ten_chuc_vu: 'Trưởng phòng',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-10-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Nguyen+Thuy+Linh&background=e11d48&color=fff'
  },
  {
    id: 'emp-018',
    ma_nhan_vien: 'NV018',
    ho_ten: 'Trần Quang Huy',
    email: 'huy.tran@company.vn',
    so_dien_thoai: '0918901234',
    phong_ban_id: 'dep-6',
    ten_phong_ban: 'Phòng Marketing',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2023-04-10',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Tran+Quang+Huy&background=6366f1&color=fff'
  },
  // Nhân viên nghỉ việc
  {
    id: 'emp-019',
    ma_nhan_vien: 'NV019',
    ho_ten: 'Lê Anh Dũng',
    email: 'dung.le@company.vn',
    so_dien_thoai: '0919012345',
    phong_ban_id: 'dep-1',
    ten_phong_ban: 'Phòng Kỹ thuật',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Nghỉ việc',
    ngay_vao_lam: '2022-01-15',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Le+Anh+Dung&background=6b7280&color=fff'
  },
  {
    id: 'emp-020',
    ma_nhan_vien: 'NV020',
    ho_ten: 'Phạm Thu Hà',
    email: 'ha.pham@company.vn',
    so_dien_thoai: '0920123456',
    phong_ban_id: 'dep-4',
    ten_phong_ban: 'Phòng Kinh doanh',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Nghỉ phép',
    ngay_vao_lam: '2022-06-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Pham+Thu+Ha&background=f59e0b&color=fff'
  },
  // ==================== BỔ SUNG DỮ LIỆU MẪU ====================
  {
    id: 'emp-021',
    ma_nhan_vien: 'NV021',
    ho_ten: 'Trương Quốc Đạt',
    email: 'dat.truong@company.vn',
    so_dien_thoai: '0921234567',
    phong_ban_id: 'dep-1-1',
    ten_phong_ban: 'Nhóm Phát triển phần mềm',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2023-07-15',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Truong+Quoc+Dat&background=2563eb&color=fff'
  },
  {
    id: 'emp-022',
    ma_nhan_vien: 'NV022',
    ho_ten: 'Lâm Thị Bích Ngọc',
    email: 'ngoc.lam@company.vn',
    so_dien_thoai: '0922345678',
    phong_ban_id: 'dep-2',
    ten_phong_ban: 'Phòng Nhân sự',
    chuc_vu_id: 'pos-4',
    ten_chuc_vu: 'Phó phòng',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-09-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Lam+Thi+Bich+Ngoc&background=d946ef&color=fff'
  },
  {
    id: 'emp-023',
    ma_nhan_vien: 'NV023',
    ho_ten: 'Hồ Sỹ Phước',
    email: 'phuoc.ho@company.vn',
    so_dien_thoai: '0923456789',
    phong_ban_id: 'dep-1-2',
    ten_phong_ban: 'Nhóm Hạ tầng IT',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Thử việc',
    ngay_vao_lam: '2025-01-10',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Ho+Sy+Phuoc&background=0ea5e9&color=fff'
  },
  {
    id: 'emp-024',
    ma_nhan_vien: 'NV024',
    ho_ten: 'Mai Thị Thanh Trúc',
    email: 'truc.mai@company.vn',
    so_dien_thoai: '0924567890',
    phong_ban_id: 'dep-3',
    ten_phong_ban: 'Phòng Tài chính - Kế toán',
    chuc_vu_id: 'pos-4',
    ten_chuc_vu: 'Phó phòng',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-05-10',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Mai+Thi+Thanh+Truc&background=a855f7&color=fff'
  },
  {
    id: 'emp-025',
    ma_nhan_vien: 'NV025',
    ho_ten: 'Tạ Minh Quân',
    email: 'quan.ta@company.vn',
    so_dien_thoai: '0925678901',
    phong_ban_id: 'dep-4',
    ten_phong_ban: 'Phòng Kinh doanh',
    chuc_vu_id: 'pos-4',
    ten_chuc_vu: 'Phó phòng',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2022-02-15',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Ta+Minh+Quan&background=16a34a&color=fff'
  },
  {
    id: 'emp-026',
    ma_nhan_vien: 'NV026',
    ho_ten: 'Dương Thị Kim Oanh',
    email: 'oanh.duong@company.vn',
    so_dien_thoai: '0926789012',
    phong_ban_id: 'dep-6',
    ten_phong_ban: 'Phòng Marketing',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2024-03-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Duong+Thi+Kim+Oanh&background=f43f5e&color=fff'
  },
  {
    id: 'emp-027',
    ma_nhan_vien: 'NV027',
    ho_ten: 'Nguyễn Hữu Trí',
    email: 'tri.nguyen@company.vn',
    so_dien_thoai: '0927890123',
    phong_ban_id: 'dep-1-1',
    ten_phong_ban: 'Nhóm Phát triển phần mềm',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2023-11-20',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Nguyen+Huu+Tri&background=7c3aed&color=fff'
  },
  {
    id: 'emp-028',
    ma_nhan_vien: 'NV028',
    ho_ten: 'Lê Thị Phương Anh',
    email: 'anh.le@company.vn',
    so_dien_thoai: '0928901234',
    phong_ban_id: 'dep-5',
    ten_phong_ban: 'Phòng Kho vận',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Thử việc',
    ngay_vao_lam: '2025-02-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Le+Thi+Phuong+Anh&background=06b6d4&color=fff'
  },
  {
    id: 'emp-029',
    ma_nhan_vien: 'NV029',
    ho_ten: 'Bùi Đức Thắng',
    email: 'thang.bui@company.vn',
    so_dien_thoai: '0929012345',
    phong_ban_id: 'dep-1',
    ten_phong_ban: 'Phòng Kỹ thuật',
    chuc_vu_id: 'pos-4',
    ten_chuc_vu: 'Phó phòng',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2021-12-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Bui+Duc+Thang&background=1d4ed8&color=fff'
  },
  {
    id: 'emp-030',
    ma_nhan_vien: 'NV030',
    ho_ten: 'Trần Ngọc Diễm',
    email: 'diem.tran@company.vn',
    so_dien_thoai: '0930123456',
    phong_ban_id: 'dep-3',
    ten_phong_ban: 'Phòng Tài chính - Kế toán',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2024-06-10',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Tran+Ngoc+Diem&background=e11d48&color=fff'
  },
  {
    id: 'emp-031',
    ma_nhan_vien: 'NV031',
    ho_ten: 'Võ Hoàng Minh',
    email: 'minh.vo@company.vn',
    so_dien_thoai: '0931234567',
    phong_ban_id: 'dep-4',
    ten_phong_ban: 'Phòng Kinh doanh',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2023-08-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Vo+Hoang+Minh&background=059669&color=fff'
  },
  {
    id: 'emp-032',
    ma_nhan_vien: 'NV032',
    ho_ten: 'Phạm Thị Mỹ Linh',
    email: 'linh.pham@company.vn',
    so_dien_thoai: '0932345678',
    phong_ban_id: 'dep-7',
    ten_phong_ban: 'Phòng Hành chính',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2022-10-15',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Pham+Thi+My+Linh&background=be185d&color=fff'
  },
  {
    id: 'emp-033',
    ma_nhan_vien: 'NV033',
    ho_ten: 'Đoàn Văn Hải',
    email: 'hai.doan@company.vn',
    so_dien_thoai: '0933456789',
    phong_ban_id: 'dep-1-1',
    ten_phong_ban: 'Nhóm Phát triển phần mềm',
    chuc_vu_id: 'pos-7',
    ten_chuc_vu: 'Thực tập sinh',
    gioi_tinh: 'Nam',
    trang_thai: 'Thử việc',
    ngay_vao_lam: '2025-01-20',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Doan+Van+Hai&background=6366f1&color=fff'
  },
  {
    id: 'emp-034',
    ma_nhan_vien: 'NV034',
    ho_ten: 'Huỳnh Thị Yến Nhi',
    email: 'nhi.huynh@company.vn',
    so_dien_thoai: '0934567890',
    phong_ban_id: 'dep-2',
    ten_phong_ban: 'Phòng Nhân sự',
    chuc_vu_id: 'pos-6',
    ten_chuc_vu: 'Nhân viên',
    gioi_tinh: 'Nữ',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2024-01-08',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Huynh+Thi+Yen+Nhi&background=ec4899&color=fff'
  },
  {
    id: 'emp-035',
    ma_nhan_vien: 'NV035',
    ho_ten: 'Nguyễn Đình Cường',
    email: 'cuong.nguyen2@company.vn',
    so_dien_thoai: '0935678901',
    phong_ban_id: 'dep-5',
    ten_phong_ban: 'Phòng Kho vận',
    chuc_vu_id: 'pos-4',
    ten_chuc_vu: 'Phó phòng',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    ngay_vao_lam: '2022-04-01',
    anh_dai_dien: 'https://ui-avatars.com/api/?name=Nguyen+Dinh+Cuong&background=ca8a04&color=fff'
  },
];

// Helper để lấy tên nhân viên theo ID
export const getEmployeeName = (id: string): string => {
  return MOCK_EMPLOYEES.find(e => e.id === id)?.ho_ten || 'Không xác định';
};

// Helper để lấy tên phòng ban theo ID
export const getDepartmentName = (id: string): string => {
  return MOCK_DEPARTMENTS.find(d => d.id === id)?.ten_phong_ban || 'Không xác định';
};
