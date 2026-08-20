import type { TrangThaiNhanVien } from './constants';

export type Gender = 'Nam' | 'Nữ' | 'Khác';

export interface Employee {
  id: string;
  ho_ten: string;
  email: string;
  so_dien_thoai: string;
  ten_dang_nhap?: string | null;
  must_change_password?: boolean;
  tai_khoan_dang_hoat_dong?: boolean;
  phong_ban_id: string | null;
  chuc_vu_id: string | null;
  ten_phong_ban?: string;
  /** Nhóm/phòng con cấp 2 — enrich từ cây phòng ban, không cột DB */
  ten_bo_phan?: string | null;
  ten_chuc_vu?: string;
  /** Cấp bậc số — enrich từ var_chuc_vu */
  cap_bac?: number | null;
  gioi_tinh: Gender;
  trang_thai: TrangThaiNhanVien;
  anh_dai_dien?: string;
  tg_tao?: string;
  tg_cap_nhat?: string;
  /** Id NV tạo bản ghi */
  nguoi_tao?: string | null;
  /** Enrich từ join creator */
  ten_nguoi_tao?: string | null;
}

export interface EmployeeFilters {
  columnSearch: Record<string, string>;
  trang_thai: string[];
  phong_ban_id: string[];
  gender: string[];
  position: string[];
}
