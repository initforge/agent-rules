import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';

export interface Position {
  id: string;
  ma_chuc_vu: string;
  ten_chuc_vu: string;
  /** Cấp bậc (int2 trên DB) */
  cap_bac?: number | null;
  phong_ban_id?: string | null;
  ten_phong_ban?: string;
  mo_ta: string | null;
  thu_tu: number;
  trang_thai: TrangThaiHoatDong;
  tg_tao: string;
  tg_cap_nhat: string;
  nguoi_tao?: string | null;
  ten_nguoi_tao?: string | null;
}

/** Bộ lọc list Chức vụ — đồng bộ pattern module Nhân viên (chip + header cột). */
export interface PositionFilters {
  status: string[];
  /** Phòng gốc (root department) — scope theo subtree */
  id_phong_goc: string[];
  /** Nhóm (phòng ban con cụ thể) — phụ thuộc id_phong_goc */
  phong_ban_id: string[];
  /** Cấp bậc — int2, lưu dưới dạng chuỗi để dùng chung MultiSelect chip */
  cap_bac: string[];
  columnSearch: Record<string, string>;
}

export interface PositionFormState {
  ma_chuc_vu: string;
  ten_chuc_vu: string;
  cap_bac?: number | null;
  phong_ban_id?: string;
  mo_ta: string | null;
  thu_tu: number;
  trang_thai: TrangThaiHoatDong;
}