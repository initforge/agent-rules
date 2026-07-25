import type { CompanyFormValues } from '../core/types';

/** Dữ liệu hiển thị / Zustand — map từ `var_cong_ty`. */
export interface CompanyInfo {
  appName: string;
  appDescription: string;
  appLogo: string | null;
  companyName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

export interface VarCongTyRow {
  id: number;
  ten_ung_dung: string;
  mo_ta_ung_dung: string | null;
  logo: string | null;
  ten_cong_ty: string;
  ma_so_thue: string;
  dia_chi: string | null;
  so_dien_thoai: string | null;
  email: string | null;
  website: string | null;
  tg_tao: string;
  tg_cap_nhat: string;
}

export const COMPANY_ROW_ID = 1;

export const VAR_CONG_TY_COLUMNS = [
  'id',
  'ten_ung_dung',
  'mo_ta_ung_dung',
  'logo',
  'ten_cong_ty',
  'ma_so_thue',
  'dia_chi',
  'so_dien_thoai',
  'email',
  'website',
  'tg_tao',
  'tg_cap_nhat',
].join(',');

export function mapRowToCompanyInfo(row: VarCongTyRow): CompanyInfo {
  return {
    appName: row.ten_ung_dung,
    appDescription: row.mo_ta_ung_dung ?? '',
    appLogo: row.logo,
    companyName: row.ten_cong_ty,
    taxId: row.ma_so_thue,
    address: row.dia_chi ?? '',
    phone: row.so_dien_thoai ?? '',
    email: row.email ?? '',
    website: row.website ?? '',
  };
}

export function mapFormToVarCongTyRow(values: CompanyFormValues): Omit<VarCongTyRow, 'tg_tao' | 'tg_cap_nhat'> {
  return {
    id: COMPANY_ROW_ID,
    ten_ung_dung: values.appName,
    mo_ta_ung_dung: values.appDescription?.trim() ? values.appDescription : null,
    logo: values.appLogo ?? null,
    ten_cong_ty: values.companyName,
    ma_so_thue: values.taxId,
    dia_chi: values.address?.trim() ? values.address : null,
    so_dien_thoai: values.phone?.trim() ? values.phone : null,
    email: values.email?.trim() ? values.email : null,
    website: values.website?.trim() ? values.website : null,
  };
}

export function mapCompanyInfoToFormValues(info: CompanyInfo): CompanyFormValues {
  return {
    appName: info.appName,
    appDescription: info.appDescription,
    appLogo: info.appLogo,
    companyName: info.companyName,
    taxId: info.taxId,
    address: info.address,
    phone: info.phone,
    email: info.email,
    website: info.website,
  };
}
