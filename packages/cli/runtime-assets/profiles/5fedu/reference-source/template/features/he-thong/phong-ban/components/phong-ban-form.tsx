import React, { useEffect, useMemo } from 'react';
import { txt } from '@/lib/text';
import { useForm, Controller, SubmitHandler, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building, Building2, Layers, FileText, ArrowUpFromLine, Power, Folder } from 'lucide-react';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import StatusToggle from '@/components/ui/StatusToggle';
import ParentSelect from '@/components/ui/ParentSelect';
import { DepartmentFormValues, createDepartmentSchema } from '../core/schema';
import { Department } from '../core/types';
import {
  departmentHasChildren,
  getEligibleParentDepartments,
} from '../utils/department-hierarchy';
import { useCreateDepartment, useUpdateDepartment } from '../hooks/use-phong-ban';
import GenericDrawer, { DRAWER_WIDTH_FORM } from '@/components/shared/GenericDrawer';
import FormSection from '@/components/shared/FormSection';
import FormGrid from '@/components/shared/FormGrid';
import FormDrawerFooter from '@/components/shared/FormDrawerFooter';
import { useCan } from '@/hooks/use-can';
import { useCanOnRecord } from '@/hooks/use-can-on-record';
import { toast } from 'sonner';

interface Props {
  initialData?: Department | null;
  allDepartments: Department[];
  onClose: () => void;
  /** Khi thêm phòng ban con từ detail: id cha được chọn sẵn */
  defaultParentId?: string | null;
}

const DepartmentForm: React.FC<Props> = ({ initialData, allDepartments, onClose, defaultParentId }) => {
  const isEdit = !!initialData;
  const canCreate = useCan('create', 'departments');
  const canEditRecord = useCanOnRecord('edit', 'departments', {
    nguoi_tao: initialData?.nguoi_tao,
  });
  const canSave = isEdit ? canEditRecord : canCreate;

  useEffect(() => {
    if (!canSave) {
      toast.error(txt('shared.error.forbidden'));
      onClose();
    }
  }, [canSave, onClose]);

  const createMutation = useCreateDepartment(onClose);
  const updateMutation = useUpdateDepartment(onClose);

  const resolver = useMemo(
    () => zodResolver(createDepartmentSchema({ allDepartments, editingId: initialData?.id })) as Resolver<DepartmentFormValues>,
    [allDepartments, initialData?.id],
  );

  const eligibleParents = useMemo(
    () => getEligibleParentDepartments(allDepartments, { excludeId: initialData?.id }),
    [allDepartments, initialData?.id],
  );

  const isParentLocked = useMemo(
    () => Boolean(initialData && departmentHasChildren(initialData.id, allDepartments)),
    [initialData, allDepartments],
  );

  const defaultValues = useMemo<Partial<DepartmentFormValues>>(
    () => ({
      ma_phong_ban: '',
      ten_phong_ban: '',
      mo_ta: '',
      cha_id: '',
      trang_thai: 'Đang hoạt động',
      thu_tu: 1,
    }),
    [],
  );

  const { register, handleSubmit, formState: { errors }, reset, control } = useForm<DepartmentFormValues>({
    resolver,
    defaultValues,
  });

  useEffect(() => {
    if (initialData) {
      reset({
        ma_phong_ban: initialData.ma_phong_ban,
        ten_phong_ban: initialData.ten_phong_ban,
        mo_ta: initialData.mo_ta ?? '',
        cha_id: initialData.cha_id || '',
        trang_thai: initialData.trang_thai,
        thu_tu: initialData.thu_tu,
      });
    } else {
      const nextThuTu = allDepartments.length
        ? Math.max(...allDepartments.map((d) => d.thu_tu ?? 0)) + 1
        : 1;
      reset({
        ...defaultValues,
        thu_tu: nextThuTu,
        cha_id: defaultParentId ?? '',
      });
    }
  }, [initialData, defaultParentId, allDepartments, reset, defaultValues]);

  const onSubmit: SubmitHandler<DepartmentFormValues> = (data) => {
    const sanitizedData = {
      ...data,
      cha_id: data.cha_id === '' || data.cha_id === undefined ? null : data.cha_id,
      mo_ta: data.mo_ta?.trim() || undefined,
    };
    if (isEdit && initialData) {
      updateMutation.mutate({ id: initialData.id, data: sanitizedData });
    } else {
      createMutation.mutate(sanitizedData);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <GenericDrawer
      title={isEdit ? txt('department.form.editTitle') : txt('department.form.createTitle')}
      icon={<Building size={20} />}
      onClose={onClose}
      footer={
        <FormDrawerFooter
          formId="dept-form"
          onCancel={onClose}
          isLoading={isLoading}
          isEdit={isEdit}
          compact
        />
      }
      footerCompact
      maxWidthClass={DRAWER_WIDTH_FORM}
    >
      <form id="dept-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Một section giống detail: Thông tin cơ bản, thứ tự trường trùng với detail */}
        <FormSection title={txt('department.detail.basicInfo')} icon={<Building2 size={14} />} variant="primary">
          <FormGrid cols={2}>
            <Input
              label={txt('department.name')}
              placeholder={txt('department.form.namePlaceholder')}
              icon={<Building2 size={12} />}
              required
              {...register('ten_phong_ban')}
              error={errors.ten_phong_ban?.message}
            />
            <Input
              label={txt('department.code')}
              placeholder={txt('department.form.codePlaceholder')}
              icon={<Building2 size={12} />}
              required
              {...register('ma_phong_ban')}
              error={errors.ma_phong_ban?.message}
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
                register('ma_phong_ban').onChange(e);
              }}
            />
            <div className="col-span-1 sm:col-span-2">
              <Textarea
                {...register('mo_ta')}
                label={txt('department.detail.description')}
                placeholder={txt('department.form.descriptionPlaceholder')}
                icon={<FileText size={12} />}
                rows={3}
                className="resize-y min-h-[80px]"
                error={errors.mo_ta?.message}
              />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <Controller
                name="cha_id"
                control={control}
                render={({ field }) => (
                  <ParentSelect<Department>
                    items={eligibleParents}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    excludeId={initialData?.id}
                    getId={(d) => d.id}
                    getParentId={(d) => d.cha_id}
                    getLevel={(d) => d.cap_do}
                    getOptionLabel={(d) => d.ten_phong_ban}
                    label={txt('department.form.parent')}
                    icon={<Folder size={12} />}
                    placeholder={txt('department.form.parentNone')}
                    hint={
                      isParentLocked
                        ? txt('department.form.parentLockedHasChildren')
                        : txt('department.form.parentHint')
                    }
                    disabled={isParentLocked}
                    error={errors.cha_id?.message}
                  />
                )}
              />
            </div>
            {isEdit && initialData && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground/80 flex items-center gap-1.5">
                  <Layers size={12} className="text-muted-foreground" />
                  {txt('department.detail.level')}
                </span>
                <span className="text-sm text-muted-foreground">{String(initialData.cap_do)}</span>
              </div>
            )}
            <Input
              type="number"
              label={txt('department.detail.order')}
              icon={<ArrowUpFromLine size={12} />}
              required
              {...register('thu_tu')}
              error={errors.thu_tu?.message}
            />
            <Controller
              name="trang_thai"
              control={control}
              render={({ field }) => (
                <StatusToggle
                  label={txt('common.status')}
                  value={field.value}
                  onChange={field.onChange}
                  activeLabel="Đang hoạt động"
                  inactiveLabel="Ngừng hoạt động"
                  icon={<Power size={12} />}
                  required
                />
              )}
            />
          </FormGrid>
        </FormSection>
      </form>
    </GenericDrawer>
  );
};

export default DepartmentForm;
