import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';

export interface Branch {
  id: string;
  ma_chi_nhanh: string;
  ten_chi_nhanh: string;
  dia_chi?: string | null;
  trang_thai: TrangThaiHoatDong;
  tg_tao: string;
  tg_cap_nhat: string;
}
