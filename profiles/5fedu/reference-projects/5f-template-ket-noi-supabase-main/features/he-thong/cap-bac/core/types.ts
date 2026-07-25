import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';

export interface JobLevel {
  id: string;
  ma_cap_bac: string;
  ten_cap_bac: string;
  mo_ta?: string | null;
  thu_tu: number;
  trang_thai: TrangThaiHoatDong;
  tg_tao: string;
  tg_cap_nhat: string;
}
