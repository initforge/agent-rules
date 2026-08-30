import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import {
  Save, Building2, MapPin, Phone, Mail, Globe, Hash, Image as ImageIcon, Camera,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SingleImageInput from '@/components/ui/SingleImageInput';
import { CLOUDINARY_FOLDERS } from '@/lib/media/cloudinary-folders';
import { companySchema } from '../core/schema';
import type { CompanyFormValues } from '../core/types';
import { useCan } from '@/hooks/use-can';
import { txt } from '@/lib/text';

export interface CompanyFormProps {
  /** Giá trị ban đầu (từ store) */
  initialValues: CompanyFormValues;
  /** Callback khi submit thành công */
  onSubmit: (data: CompanyFormValues) => void | Promise<void>;
}

const CompanyInfoForm: React.FC<CompanyFormProps> = ({ initialValues, onSubmit }) => {
  const canEditCompany = useCan('edit', 'company');

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      appName: initialValues.appName,
      appDescription: initialValues.appDescription ?? '',
      appLogo: initialValues.appLogo ?? null,
      companyName: initialValues.companyName,
      taxId: initialValues.taxId,
      address: initialValues.address ?? '',
      phone: initialValues.phone ?? '',
      email: initialValues.email ?? '',
      website: initialValues.website ?? '',
    },
  });

  const onFormSubmit = async (data: CompanyFormValues) => {
    if (!canEditCompany) return;
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="min-w-0">
      <fieldset disabled={!canEditCompany} className="grid grid-cols-1 md:grid-cols-3 gap-6 border-0 p-0 m-0 min-w-0 disabled:opacity-80">
      {/* Branding Column */}
      <div className="md:col-span-1 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card p-5 rounded-xl border border-border shadow-sm"
        >
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" /> {txt('company.brandSection')}
          </h3>

          <div className="space-y-4">
            <Controller
              name="appLogo"
              control={control}
              render={({ field }) => (
                <SingleImageInput
                  label={txt('company.logoLabel')}
                  icon={<Camera className="w-4 h-4" />}
                  value={field.value ?? null}
                  onChange={field.onChange}
                  shape="rounded"
                  maxSizeMB={2}
                  allowUrlInput
                  uploadContext={{ folder: CLOUDINARY_FOLDERS.companyLogo }}
                  placeholder={txt('company.logoPlaceholder')}
                  hint={txt('company.logoHint')}
                  error={errors.appLogo?.message}
                  className="w-[180px]"
                  disabled={!canEditCompany}
                />
              )}
            />

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Input
                  label={txt('company.appName')}
                  placeholder={txt('company.appNamePlaceholder')}
                  {...register('appName')}
                  error={errors.appName?.message}
                />
                <p className="text-xs text-muted-foreground italic">{txt('company.appNameHint')}</p>
              </div>
              <div className="space-y-1">
                <Input
                  label={txt('company.appDescription')}
                  placeholder={txt('company.appDescPlaceholder')}
                  {...register('appDescription')}
                  error={errors.appDescription?.message}
                />
                <p className="text-xs text-muted-foreground italic">{txt('company.appDescHint')}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Company Info Column */}
      <div className="md:col-span-2 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card p-5 rounded-xl border border-border shadow-sm"
        >
          <h3 className="font-semibold text-foreground mb-6 flex items-center gap-2 border-b border-border pb-3">
            <Building2 className="w-4 h-4 text-muted-foreground" /> {txt('company.legalSection')}
          </h3>

          <div className="grid gap-5">
            <div className="grid md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <Input
                  label={txt('company.companyName')}
                  placeholder={txt('company.companyNamePlaceholder')}
                  icon={<Building2 className="w-4 h-4 text-muted-foreground" />}
                  {...register('companyName')}
                  error={errors.companyName?.message}
                />
              </div>
              <Input
                label={txt('company.taxId')}
                placeholder={txt('company.taxIdPlaceholder')}
                icon={<Hash className="w-4 h-4 text-muted-foreground" />}
                {...register('taxId')}
                error={errors.taxId?.message}
              />
              <Input
                label={txt('company.phone')}
                placeholder={txt('company.phonePlaceholder')}
                icon={<Phone className="w-4 h-4 text-muted-foreground" />}
                {...register('phone')}
                error={errors.phone?.message}
              />
              <Input
                label={txt('company.email')}
                placeholder={txt('company.emailPlaceholder')}
                icon={<Mail className="w-4 h-4 text-muted-foreground" />}
                {...register('email')}
                error={errors.email?.message}
              />
              <Input
                label={txt('company.website')}
                placeholder={txt('company.websitePlaceholder')}
                icon={<Globe className="w-4 h-4 text-muted-foreground" />}
                {...register('website')}
                error={errors.website?.message}
              />
              <div className="md:col-span-2">
                <Input
                  label={txt('company.address')}
                  placeholder={txt('company.addressPlaceholder')}
                  icon={<MapPin className="w-4 h-4 text-muted-foreground" />}
                  {...register('address')}
                  error={errors.address?.message}
                />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex justify-end pt-2"
        >
          {canEditCompany && (
          <Button type="submit" size="lg" className="w-full md:w-auto shadow-lg shadow-primary/20" isLoading={isSubmitting}>
            <Save className="w-4 h-4 mr-2" /> {txt('company.saveButton')}
          </Button>
          )}
        </motion.div>
      </div>
      </fieldset>
    </form>
  );
};

export default CompanyInfoForm;
