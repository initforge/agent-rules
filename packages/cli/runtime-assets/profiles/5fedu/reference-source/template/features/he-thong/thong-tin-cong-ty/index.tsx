import React, { useEffect } from 'react';
import { txt } from '@/lib/text';
import { useNavigate, useLocation } from 'react-router-dom';
import { getParentPath } from '@/components/shared/Breadcrumbs';
import { ArrowLeft } from 'lucide-react';
import { useUIStore } from '@/store/useStore';
import { isSupabase } from '@/lib/data/config';
import CompanyInfoForm from './components/thong-tin-cong-ty-form';
import { mapCompanyInfoToFormValues } from './core/cong-ty-map';
import { useCompanyInfo, useUpsertCompany } from './hooks/use-cong-ty';
import type { CompanyFormValues } from './core/types';

const CompanyInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { companyInfo, setCompanyInfo } = useUIStore();
  const { data: remoteCompany, isLoading } = useCompanyInfo();
  const upsertMutation = useUpsertCompany();

  useEffect(() => {
    if (remoteCompany && isSupabase()) {
      setCompanyInfo(remoteCompany);
    }
  }, [remoteCompany, setCompanyInfo]);

  const displayInfo = isSupabase() && remoteCompany ? remoteCompany : companyInfo;

  const handleSubmit = async (data: CompanyFormValues) => {
    await upsertMutation.mutateAsync(data);
  };

  if (isSupabase() && isLoading && !remoteCompany) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center text-sm text-muted-foreground">
        {txt('common.loading')}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => {
            const p = getParentPath(location.pathname, txt);
            navigate(p ?? '/he-thong');
          }}
          aria-label={txt('nav.back')}
          className="shrink-0 h-8 px-2.5 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-[0.98] mt-0.5"
        >
          <ArrowLeft size={15} className="stroke-[2.5px]" />
          <span className="text-xs font-medium hidden sm:inline">{txt('common.back')}</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{txt('company.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{txt('company.description')}</p>
        </div>
      </div>

      <CompanyInfoForm
        initialValues={mapCompanyInfoToFormValues({
          ...displayInfo,
          appLogo: displayInfo.appLogo ?? null,
          appDescription: displayInfo.appDescription ?? '',
          address: displayInfo.address ?? '',
          phone: displayInfo.phone ?? '',
          email: displayInfo.email ?? '',
          website: displayInfo.website ?? '',
        })}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default CompanyInfoPage;
