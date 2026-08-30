import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { masterDataQueryOptions } from '@/lib/supabase/query-config';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import { txt } from '@/lib/text';
import type { CompanyFormValues } from '../core/types';
import { getCompany, upsertCompany } from '../services/cong-ty-service';

export function companyInfoQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.company.info,
    queryFn: getCompany,
    ...masterDataQueryOptions,
  });
}

export function useCompanyInfo() {
  return useQuery(companyInfoQueryOptions());
}

export function useUpsertCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CompanyFormValues) => upsertCompany(values),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.company.info, data);
      toast.success(txt('company.saveSuccess'));
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
