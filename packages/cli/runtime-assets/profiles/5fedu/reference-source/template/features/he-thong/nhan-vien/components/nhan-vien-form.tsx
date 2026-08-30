import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { txt } from '@/lib/text';
import { useForm, Controller, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UserPlus, UserCircle, Camera, Mail, Phone, Briefcase, Building2,
  CircleDot, AlertCircle, Layers, KeyRound, AtSign,
} from 'lucide-react';
import FormDrawerFooter from '@/components/shared/FormDrawerFooter';
import Input from '@/components/ui/Input';
import Combobox from '@/components/ui/Combobox';
import RadioGroup from '@/components/ui/RadioGroup';
import SingleImageInput from '@/components/ui/SingleImageInput';
import { CLOUDINARY_FOLDERS } from '@/lib/media/cloudinary-folders';
import GenericDrawer, { DRAWER_WIDTH_FORM } from '@/components/shared/GenericDrawer';
import FormSection from '@/components/shared/FormSection';
import FormGrid from '@/components/shared/FormGrid';
import {
  createEmployeeCreateSchema,
  createEmployeeEditSchema,
  type EmployeeCreateFormValues,
  type EmployeeEditFormValues,
  type EmployeeFormValues,
} from '../core/schema';
import { Employee } from '../core/types';
import {
  getDefaultEmployeeCreateFormValues,
  getDefaultEmployeeFormValues,
  employeeToEditFormValues,
} from '../utils/employee-to-form';
import { normalizeLoginName } from '@/lib/validation/login-name';
import { useCreateEmployee, useUpdateEmployee, useResetEmployeePassword } from '../hooks/use-nhan-vien';
import { useLoginNameAvailability } from '../hooks/use-login-name-availability';
import { useDepartments } from '@/features/he-thong/phong-ban/hooks/use-phong-ban';
import { useActivePositions } from '@/features/he-thong/chuc-vu/hooks/use-chuc-vu';
import {
  buildEmployeePositionComboboxOptions,
  getDepartmentIdForPosition,
  getDepartmentNameForPosition,
  getDivisionNameForPosition,
  getPositionNameById,
  getCapBacForPosition,
  formatEmployeeCapBacLabel,
} from '../utils/build-employee-position-options';
import { coerceEntityId } from '@/lib/coerce-entity-id';
import { mergeActivePositionsForEmployeeForm } from '../utils/merge-active-positions-for-form';
import Button from '@/components/ui/Button';
import { useCan } from '@/hooks/use-can';
import { useCanOnRecord } from '@/hooks/use-can-on-record';
import { toast } from 'sonner';

interface Props {
  initialData?: Employee | null;
  prefillData?: Partial<EmployeeFormValues>;
  onClose: () => void;
}

const EmployeeForm: React.FC<Props> = ({ initialData, prefillData, onClose }) => {
  const isEdit = !!initialData;
  const canCreate = useCan('create', 'employees');
  const canEditRecord = useCanOnRecord('edit', 'employees', {
    nguoi_tao: initialData?.nguoi_tao,
  });
  const canSave = isEdit ? canEditRecord : canCreate;

  useEffect(() => {
    if (!canSave) {
      toast.error(txt('shared.error.forbidden'));
      onClose();
    }
  }, [canSave, onClose]);
  const createMutation = useCreateEmployee(onClose);
  const updateMutation = useUpdateEmployee(onClose);
  const resetPasswordMutation = useResetEmployeePassword();
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [newTempPassword, setNewTempPassword] = useState('');

  const { data: departments = [] } = useDepartments();
  const { data: activePositions = [], isLoading: isPositionsLoading } = useActivePositions();
  const positions = useMemo(
    () => mergeActivePositionsForEmployeeForm(activePositions, initialData),
    [activePositions, initialData],
  );

  const positionOptions = useMemo(
    () => buildEmployeePositionComboboxOptions(departments, positions),
    [departments, positions],
  );

  const statusOptions = useMemo(
    () => [
      { value: 'Đang làm việc', label: txt('employee.statusActive') },
      { value: 'Thử việc', label: txt('employee.statusProbation') },
      { value: 'Nghỉ phép', label: txt('employee.statusLeave') },
      { value: 'Nghỉ việc', label: txt('employee.statusResigned') },
    ],
    [],
  );

  const employeeFormSchema = useMemo(
    () =>
      isEdit
        ? createEmployeeEditSchema(positions, initialData?.ten_dang_nhap)
        : createEmployeeCreateSchema(positions),
    [positions, isEdit, initialData?.ten_dang_nhap],
  );

  const resolver = useMemo(
    () => zodResolver(employeeFormSchema) as Resolver<
      EmployeeFormValues | EmployeeCreateFormValues | EmployeeEditFormValues
    >,
    [employeeFormSchema],
  );

  const { register, handleSubmit, formState: { errors }, reset, control, setValue, trigger, setError, clearErrors } = useForm<
    EmployeeFormValues | EmployeeCreateFormValues | EmployeeEditFormValues
  >({
    resolver,
    defaultValues: isEdit ? getDefaultEmployeeFormValues() : getDefaultEmployeeCreateFormValues(),
  });

  const selectedPositionId = useWatch({ control, name: 'chuc_vu_id' });
  const watchedLoginName = useWatch({ control, name: 'ten_dang_nhap' as keyof EmployeeEditFormValues });

  const initialLoginNormalized =
    initialData?.ten_dang_nhap ? normalizeLoginName(initialData.ten_dang_nhap) : '';

  const watchedLoginNormalized = useMemo(() => {
    const raw = typeof watchedLoginName === 'string' ? watchedLoginName : '';
    return raw.trim() ? normalizeLoginName(raw) : '';
  }, [watchedLoginName]);

  const isLoginChanged = Boolean(
    isEdit &&
      initialLoginNormalized &&
      watchedLoginNormalized &&
      watchedLoginNormalized !== initialLoginNormalized,
  );

  const setLoginNameFieldError = useCallback(
    (message: string) => {
      setError('ten_dang_nhap' as keyof EmployeeEditFormValues, {
        type: 'manual',
        message,
      });
    },
    [setError],
  );

  const clearLoginNameFieldError = useCallback(() => {
    clearErrors('ten_dang_nhap' as keyof EmployeeEditFormValues);
  }, [clearErrors]);

  const { isChecking: isCheckingLoginName, isDuplicate: isLoginNameDuplicate } =
    useLoginNameAvailability({
      loginName: watchedLoginNormalized,
      excludeEmployeeId: initialData?.id,
      initialLoginName: initialData?.ten_dang_nhap,
      setFieldError: setLoginNameFieldError,
      clearFieldError: clearLoginNameFieldError,
    });

  const departmentDisplayName = useMemo(
    () => getDepartmentNameForPosition(departments, positions, selectedPositionId),
    [departments, positions, selectedPositionId],
  );

  const divisionDisplayName = useMemo(
    () => getDivisionNameForPosition(departments, positions, selectedPositionId),
    [departments, positions, selectedPositionId],
  );

  const capBacDisplayName = useMemo(
    () => formatEmployeeCapBacLabel(getCapBacForPosition(positions, selectedPositionId)),
    [positions, selectedPositionId],
  );

  useEffect(() => {
    const deptId = getDepartmentIdForPosition(positions, selectedPositionId);
    if (deptId) {
      setValue('phong_ban_id', deptId, { shouldValidate: true });
    }
  }, [selectedPositionId, positions, setValue]);

  useEffect(() => {
    if (!selectedPositionId || isPositionsLoading) return;
    void trigger(['chuc_vu_id', 'phong_ban_id']);
  }, [positions, selectedPositionId, isPositionsLoading, trigger]);

  useEffect(() => {
    if (initialData) {
      reset(employeeToEditFormValues(initialData));
    } else if (prefillData) {
      reset((prev) => ({
        ...prev,
        ...prefillData,
        trang_thai: prefillData.trang_thai ?? 'Đang làm việc',
      }));
    }
  }, [initialData, prefillData, reset]);

  const onSubmit = (data: EmployeeFormValues | EmployeeCreateFormValues | EmployeeEditFormValues) => {
    if (!canSave) return;
    if (isCheckingLoginName || isLoginNameDuplicate) return;
    if (isEdit && initialData) {
      updateMutation.mutate({
        id: initialData.id,
        data: data as EmployeeEditFormValues,
      });
    } else {
      createMutation.mutate(data as EmployeeCreateFormValues);
    }
  };

  const handleResetPassword = async () => {
    if (!initialData?.id || newTempPassword.length < 6) return;
    await resetPasswordMutation.mutateAsync({ id: initialData.id, password: newTempPassword });
    setResetPasswordOpen(false);
    setNewTempPassword('');
  };

  const isLoading =
    createMutation.isPending ||
    updateMutation.isPending ||
    isPositionsLoading ||
    isCheckingLoginName;

  const isSubmitBlocked = isLoading || isLoginNameDuplicate || !canSave;

  const footer = useMemo(
    () => (
      <FormDrawerFooter
        formId="emp-form"
        onCancel={onClose}
        isLoading={isSubmitBlocked}
        isEdit={isEdit}
        compact
        createIcon={<UserPlus className="w-3.5 h-3.5 mr-1.5 shrink-0" />}
      />
    ),
    [onClose, isSubmitBlocked, isEdit],
  );

  return (
    <GenericDrawer
      title={isEdit ? txt('employee.form.editTitle') : txt('employee.form.createTitle')}
      subtitle={isEdit ? initialData.ho_ten : txt('employee.form.createSubtitle')}
      icon={<UserCircle size={20} />}
      onClose={onClose}
      footer={footer}
      footerCompact
      maxWidthClass={DRAWER_WIDTH_FORM}
    >
      <form id="emp-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              {txt('employee.form.validationError')}
            </p>
          </div>
        )}

        <FormSection title={txt('employee.form.personalInfo')} icon={<UserCircle size={14} />}>
          <div className="flex justify-center mb-4">
            <Controller
              name="anh_dai_dien"
              control={control}
              render={({ field }) => (
                <SingleImageInput
                  label={txt('employee.form.avatar')}
                  icon={<Camera className="w-4 h-4" />}
                  value={field.value}
                  onChange={field.onChange}
                  shape="circle"
                  className="w-24"
                  aspectRatio="1/1"
                  maxSizeMB={2}
                  placeholder={txt('employee.form.avatarPlaceholder')}
                  uploadContext={{ folder: CLOUDINARY_FOLDERS.employeeAvatar }}
                />
              )}
            />
          </div>
          <FormGrid cols={2}>
            <Input
              label={txt('employee.name')}
              required
              icon={<UserCircle className="w-4 h-4 text-muted-foreground" />}
              {...register('ho_ten')}
              error={errors.ho_ten?.message}
            />
            <Controller
              name="gioi_tinh"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  label={txt('employee.gender')}
                  options={[
                    { value: 'Nam', label: txt('employee.genderMale') },
                    { value: 'Nữ', label: txt('employee.genderFemale') },
                    { value: 'Khác', label: txt('employee.genderOther') },
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </FormGrid>
        </FormSection>

        <FormSection title={txt('employee.form.contactInfo')} icon={<Mail size={14} />}>
          <FormGrid cols={2}>
            <Input
              label={txt('employee.form.workEmail')}
              type="email"
              required
              icon={<Mail className="w-4 h-4 text-muted-foreground" />}
              {...register('email')}
              error={errors.email?.message}
            />
            <Input
              label={txt('employee.phone')}
              required
              icon={<Phone className="w-4 h-4 text-muted-foreground" />}
              {...register('so_dien_thoai')}
              error={errors.so_dien_thoai?.message}
            />
          </FormGrid>
        </FormSection>

        <FormSection title={txt('employee.form.workInfo')} icon={<Briefcase size={14} />}>
          <FormGrid cols={2}>
            <Controller
              name="chuc_vu_id"
              control={control}
              render={({ field }) => (
                <Combobox
                  label={txt('employee.position')}
                  required
                  options={positionOptions}
                  value={coerceEntityId(field.value)}
                  onChange={(val) => field.onChange(val === '' ? '' : String(val))}
                  placeholder={txt('employee.form.positionPlaceholder')}
                  icon={<Briefcase size={16} className="text-muted-foreground" />}
                  dropdownInPortal
                  error={errors.chuc_vu_id?.message}
                  renderValue={() => getPositionNameById(positions, field.value) || undefined}
                />
              )}
            />
            <Input
              label={txt('employee.department')}
              value={departmentDisplayName}
              readOnly
              disabled
              icon={<Building2 className="w-4 h-4 text-muted-foreground" />}
            />
            <Input
              label={txt('employee.division')}
              value={divisionDisplayName || '—'}
              readOnly
              disabled
              icon={<Building2 className="w-4 h-4 text-muted-foreground" />}
            />
            <div>
              <Input
                label={txt('employee.form.level')}
                value={capBacDisplayName}
                readOnly
                disabled
                icon={<Layers className="w-4 h-4 text-muted-foreground" />}
              />
              <p className="text-xs text-muted-foreground mt-1">{txt('employee.form.levelAutoHint')}</p>
            </div>
            <Controller
              name="trang_thai"
              control={control}
              render={({ field }) => (
                <Combobox
                  label={txt('employee.form.workStatus')}
                  options={statusOptions}
                  value={String(field.value)}
                  onChange={(val) => field.onChange(val)}
                  placeholder={txt('employee.form.workStatusPlaceholder')}
                  icon={<CircleDot size={16} className="text-muted-foreground" />}
                  searchable={false}
                  error={errors.trang_thai?.message}
                />
              )}
            />
            <input type="hidden" {...register('phong_ban_id')} />
          </FormGrid>
        </FormSection>

        {!isEdit && (
          <FormSection title={txt('employee.form.authAccount')} icon={<KeyRound size={14} />}>
            <FormGrid cols={2}>
              <Input
                label={txt('employee.form.loginName')}
                required
                icon={<AtSign className="w-4 h-4 text-muted-foreground" />}
                {...register('ten_dang_nhap' as keyof EmployeeCreateFormValues)}
                error={(errors as { ten_dang_nhap?: { message?: string } }).ten_dang_nhap?.message}
              />
              {isCheckingLoginName && !(errors as { ten_dang_nhap?: { message?: string } }).ten_dang_nhap && (
                <p className="text-xs text-muted-foreground -mt-2 col-span-2">
                  {txt('employee.validation.loginNameChecking')}
                </p>
              )}
              <Input
                label={txt('employee.form.tempPassword')}
                type="password"
                required
                icon={<KeyRound className="w-4 h-4 text-muted-foreground" />}
                {...register('mat_khau_tam' as keyof EmployeeCreateFormValues)}
                error={(errors as { mat_khau_tam?: { message?: string } }).mat_khau_tam?.message}
              />
            </FormGrid>
          </FormSection>
        )}

        {isEdit && initialData?.ten_dang_nhap && (
          <FormSection title={txt('employee.form.authAccount')} icon={<KeyRound size={14} />}>
            <div className="space-y-3">
              <FormGrid cols={2}>
                <Input
                  label={txt('employee.form.loginName')}
                  icon={<AtSign className="w-4 h-4 text-muted-foreground" />}
                  {...register('ten_dang_nhap' as keyof EmployeeEditFormValues)}
                  error={(errors as { ten_dang_nhap?: { message?: string } }).ten_dang_nhap?.message}
                />
                {isCheckingLoginName && !(errors as { ten_dang_nhap?: { message?: string } }).ten_dang_nhap && (
                  <p className="text-xs text-muted-foreground -mt-2 col-span-2">
                    {txt('employee.validation.loginNameChecking')}
                  </p>
                )}
                {isLoginChanged && (
                  <Input
                    label={txt('employee.form.tempPassword')}
                    type="password"
                    required
                    icon={<KeyRound className="w-4 h-4 text-muted-foreground" />}
                    {...register('mat_khau_tam' as keyof EmployeeEditFormValues)}
                    error={(errors as { mat_khau_tam?: { message?: string } }).mat_khau_tam?.message}
                  />
                )}
              </FormGrid>
              {isLoginChanged && (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  {txt('employee.form.loginChangeWarning')}
                </p>
              )}
              {!isLoginChanged && (
                <>
                  {!resetPasswordOpen ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setResetPasswordOpen(true)}>
                      {txt('employee.form.resetPassword')}
                    </Button>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="password"
                        label={txt('employee.form.newTempPassword')}
                        value={newTempPassword}
                        onChange={(e) => setNewTempPassword(e.target.value)}
                      />
                      <div className="flex gap-2 items-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleResetPassword}
                          isLoading={resetPasswordMutation.isPending}
                          disabled={newTempPassword.length < 6}
                        >
                          {txt('common.save')}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setResetPasswordOpen(false)}>
                          {txt('common.cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </FormSection>
        )}

        {isEdit && initialData && !initialData.ten_dang_nhap && (
          <FormSection title={txt('employee.form.authAccount')} icon={<KeyRound size={14} />}>
            <p className="text-xs text-muted-foreground mb-3">{txt('employee.form.createAuthOnEditHint')}</p>
            <FormGrid cols={2}>
              <Input
                label={txt('employee.form.loginName')}
                icon={<AtSign className="w-4 h-4 text-muted-foreground" />}
                {...register('ten_dang_nhap' as keyof EmployeeEditFormValues)}
                error={(errors as { ten_dang_nhap?: { message?: string } }).ten_dang_nhap?.message}
              />
              {isCheckingLoginName && !(errors as { ten_dang_nhap?: { message?: string } }).ten_dang_nhap && (
                <p className="text-xs text-muted-foreground -mt-2 col-span-2">
                  {txt('employee.validation.loginNameChecking')}
                </p>
              )}
              <Input
                label={txt('employee.form.tempPassword')}
                type="password"
                icon={<KeyRound className="w-4 h-4 text-muted-foreground" />}
                {...register('mat_khau_tam' as keyof EmployeeEditFormValues)}
                error={(errors as { mat_khau_tam?: { message?: string } }).mat_khau_tam?.message}
              />
            </FormGrid>
          </FormSection>
        )}
      </form>
    </GenericDrawer>
  );
};

export default EmployeeForm;
