import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';

export interface Department {
  id: string;
  ma_phong_ban: string;
  ten_phong_ban: string;
  mo_ta?: string;
  cha_id: string | null;
  cap_do: number;
  duong_dan: string;
  trang_thai: TrangThaiHoatDong;
  thu_tu: number;
  tg_tao: string;
  tg_cap_nhat: string;
  nguoi_tao?: string | null;
  ten_nguoi_tao?: string | null;
}

export interface DepartmentFormState {
  ma_phong_ban: string;
  ten_phong_ban: string;
  cha_id: string | null;
  trang_thai: TrangThaiHoatDong;
  thu_tu: number;
}
