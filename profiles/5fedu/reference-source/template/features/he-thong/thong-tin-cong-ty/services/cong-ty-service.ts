import { isSupabase } from '@/lib/data/config';
import { getSupabase } from '@/lib/supabase/client';
import { handleSupabaseError } from '@/lib/supabase/errors';
import { useUIStore } from '@/store/useStore';
import type { CompanyFormValues } from '../core/types';
import {
  COMPANY_ROW_ID,
  VAR_CONG_TY_COLUMNS,
  mapFormToVarCongTyRow,
  mapRowToCompanyInfo,
  type CompanyInfo,
  type VarCongTyRow,
} from '../core/cong-ty-map';

function getMockCompanyInfo(): CompanyInfo {
  return useUIStore.getState().companyInfo;
}

export async function getCompany(): Promise<CompanyInfo> {
  if (!isSupabase()) {
    return getMockCompanyInfo();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return getMockCompanyInfo();
  }

  const { data, error } = await supabase
    .from('var_cong_ty')
    .select(VAR_CONG_TY_COLUMNS)
    .eq('id', COMPANY_ROW_ID)
    .maybeSingle();

  if (error) handleSupabaseError(error);
  if (!data) return getMockCompanyInfo();

  return mapRowToCompanyInfo(data as VarCongTyRow);
}

export async function upsertCompany(values: CompanyFormValues): Promise<CompanyInfo> {
  const payload = mapFormToVarCongTyRow(values);
  const info = mapRowToCompanyInfo({
    ...payload,
    tg_tao: new Date().toISOString(),
    tg_cap_nhat: new Date().toISOString(),
  });

  if (!isSupabase()) {
    useUIStore.getState().setCompanyInfo(info);
    return info;
  }

  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('var_cong_ty')
    .upsert(payload, { onConflict: 'id' })
    .select(VAR_CONG_TY_COLUMNS)
    .single();

  if (error) handleSupabaseError(error);

  const saved = mapRowToCompanyInfo(data as VarCongTyRow);
  useUIStore.getState().setCompanyInfo(saved);
  return saved;
}
