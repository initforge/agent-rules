import React, { useState, useMemo, useCallback } from 'react';
import { txt } from '@/lib/text';
import { useAuthStore } from '@/store/useStore';
import Button from '@/components/ui/Button';
import SingleImageInput from '@/components/ui/SingleImageInput';
import { CLOUDINARY_FOLDERS } from '@/lib/media/cloudinary-folders';
import DashboardToolbar from '@/components/shared/DashboardToolbar';
import DetailToolbar from '@/components/shared/DetailToolbar';
import DetailSection from '@/components/shared/DetailSection';
import DetailField from '@/components/shared/DetailField';
import DetailFieldGrid from '@/components/shared/DetailFieldGrid';
import EnumBadge from '@/components/ui/EnumBadge';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User as UserIcon, Mail, Shield, Calendar,
  Key, X, Eye, EyeOff,
  Phone, Briefcase, Building2, AtSign,
} from 'lucide-react';
import { cn, formatDate, getAvatarUrl } from '@/lib/utils';
import {
  GENDER_BADGE_CONFIG,
  STATUS_BADGE_CONFIG,
} from '@/features/he-thong/nhan-vien/core/constants';
import { formatEmployeeCapBacLabel } from '@/features/he-thong/nhan-vien/utils/build-employee-position-options';
import { canEditProfile } from '@/lib/profile-permissions';
import type { Employee } from '@/features/he-thong/nhan-vien/core/types';
import { useEmployees } from '@/features/he-thong/nhan-vien/hooks/use-nhan-vien';
import { useUpdateEmployee } from '@/features/he-thong/nhan-vien/hooks/use-nhan-vien';
import { employeeToFormValues } from '@/features/he-thong/nhan-vien/utils/employee-to-form';
import {
  changePassword,
  resolveUserAuthEmail,
  resolveUserLoginName,
} from '@/lib/employee-auth/change-password';

const Profile: React.FC = () => {
  const { user, login, patchUser } = useAuthStore();
  const { data: employees = [] } = useEmployees();
  const updateEmployeeMutation = useUpdateEmployee();

  const currentEmployee = useMemo(() => {
    if (!user) return null;
    if (user.employee_id) {
      return employees.find((e) => e.id === user.employee_id) ?? null;
    }
    if (user.email) {
      return employees.find((e) => e.email === user.email) ?? null;
    }
    return null;
  }, [employees, user]);

  const displayData: Employee = useMemo(() => {
    if (currentEmployee) return currentEmployee;
    return {
      id: '',
      ho_ten: user?.full_name ?? '',
      email: user?.email ?? '',
      so_dien_thoai: '',
      phong_ban_id: null,
      chuc_vu_id: null,
      gioi_tinh: 'Khác',
      trang_thai: 'Đang làm việc',
    };
  }, [currentEmployee, user?.full_name, user?.email]);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordShow, setPasswordShow] = useState({ current: false, new: false, confirm: false });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const resetPasswordModal = useCallback(() => {
    setPasswordForm({ current: '', new: '', confirm: '' });
    setPasswordShow({ current: false, new: false, confirm: false });
    setPasswordError(null);
  }, []);

  const handlePasswordModalOpen = useCallback(() => {
    resetPasswordModal();
    setPasswordModalOpen(true);
  }, [resetPasswordModal]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    const { current, new: newPw, confirm } = passwordForm;
    if (!current.trim()) {
      setPasswordError(txt('nav.changePassword.errorCurrentRequired'));
      return;
    }
    if (newPw.length < 6) {
      setPasswordError(txt('nav.changePassword.errorNewMin'));
      return;
    }
    if (newPw !== confirm) {
      setPasswordError(txt('nav.changePassword.errorConfirmMismatch'));
      return;
    }
    if (current === newPw) {
      setPasswordError(txt('nav.changePassword.errorSameAsCurrent'));
      return;
    }
    if (!user) return;
    const loginName = resolveUserLoginName(user);
    if (!loginName) {
      setPasswordError('Chưa có tên đăng nhập');
      return;
    }
    setPasswordSubmitting(true);
    const result = await changePassword({
      loginName,
      authEmail: resolveUserAuthEmail(user),
      currentPassword: current,
      newPassword: newPw,
    });
    setPasswordSubmitting(false);
    if (!result.ok) {
      setPasswordError(result.error);
      return;
    }
    if (user.must_change_password) {
      patchUser({ must_change_password: false });
    }
    setPasswordModalOpen(false);
    resetPasswordModal();
    toast.success(txt('nav.changePassword.success'));
  };

  const editable = canEditProfile(user);

  const displayName = currentEmployee?.ho_ten ?? user?.full_name ?? '';
  const displayEmail = currentEmployee?.email ?? user?.email ?? '';
  const displayAvatar = currentEmployee?.anh_dai_dien ?? user?.avatar_url ?? null;
  const displayJoinedAt = currentEmployee?.tg_tao ?? user?.created_at;

  const handleAvatarChange = async (value: string | null) => {
    if (!user || !editable) return;
    if (currentEmployee) {
      try {
        const payload = employeeToFormValues(currentEmployee);
        await updateEmployeeMutation.mutateAsync({
          id: currentEmployee.id,
          data: { ...payload, anh_dai_dien: value },
        });
        login({ ...user, avatar_url: value ?? undefined });
        toast.success(txt('page.profile.avatarUpdateSuccess'));
      } catch {
        toast.error(txt('page.profile.userNotFound'));
      }
      return;
    }
    login({ ...user, avatar_url: value ?? undefined });
    toast.success(txt('page.profile.avatarUpdateSuccess'));
  };

  const positionLabel = displayData.ten_chuc_vu?.trim() || null;
  const avatarAlt = displayName
    ? txt('page.profile.avatarAlt', { name: displayName })
    : txt('page.profile.avatarAltFallback');
  const emptyText = txt('page.profile.emptyField');

  const toolbarActions = useMemo(() => {
    if (!editable) return [];
    return [
      {
        label: txt('page.profile.changePassword'),
        icon: <Key />,
        onClick: handlePasswordModalOpen,
        variant: 'secondary' as const,
      },
    ];
  }, [editable, handlePasswordModalOpen]);

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">{txt('page.profile.userNotFound')}</p>
      </div>
    );
  }

  const data = displayData;

  return (
    <div className="flex flex-col min-h-0">
      <DashboardToolbar
        leadingContent={
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UserIcon className="h-4 w-4" />
            </div>
            <h1 className="text-sm font-semibold text-foreground truncate">
              {txt('page.profile.title')}
            </h1>
          </div>
        }
      />
      <div className="px-4 sm:px-6 space-y-4 sm:space-y-6 pb-10 pt-3 md:pt-4 max-w-full">
      {/* View-only banner */}
      {!editable && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-amber-800 dark:text-amber-200"
          role="status"
        >
          {txt('page.profile.viewOnlyBanner')}
        </motion.div>
      )}

      {/* ===== Main layout: sidebar + content ===== */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 items-stretch lg:items-start w-full">
        {/* --- Sidebar: compact horizontal on mobile, vertical card on desktop --- */}
        <motion.aside
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full lg:w-72 lg:shrink-0 lg:sticky lg:top-6"
        >
          <div className="rounded-xl border border-border bg-card shadow-sm relative overflow-hidden">
            {/* Cover gradient – shorter on mobile */}
            <div className="h-16 sm:h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" aria-hidden="true" />

            {/* Avatar + identity: horizontal on mobile, centered on desktop */}
            <div className="px-4 sm:px-6 -mt-8 sm:-mt-12">
              {/* Mobile: flex row | Desktop: text-center stacked */}
              <div className="flex items-end gap-3 sm:block sm:text-center">
                <div className="relative shrink-0 sm:inline-block">
                  {editable ? (
                    <SingleImageInput
                      value={displayAvatar}
                      onChange={(value) => void handleAvatarChange(value)}
                      shape="circle"
                      aspectRatio="1/1"
                      maxSizeMB={2}
                      uploadContext={{ folder: CLOUDINARY_FOLDERS.employeeAvatar }}
                      placeholder={txt('page.profile.changeAvatar')}
                      hint={txt('page.profile.avatarModalHint')}
                      className="w-[96px] sm:w-[180px]"
                      disabled={updateEmployeeMutation.isPending}
                    />
                  ) : (
                    <>
                      <img
                        src={displayAvatar ?? getAvatarUrl(displayName, 128)}
                        alt={avatarAlt}
                        className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-[3px] sm:border-4 border-card shadow-lg object-cover"
                      />
                      <span
                        className="absolute bottom-0.5 right-0.5 sm:bottom-1 sm:right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-500 border-2 border-card rounded-full"
                        title={txt('page.profile.activeStatus')}
                        aria-hidden="true"
                      />
                    </>
                  )}
                </div>
                <div className="pb-1 sm:pb-0 sm:mt-3 min-w-0">
                  <h3 className="font-bold text-base sm:text-lg text-foreground leading-tight truncate">{displayName}</h3>
                  {positionLabel ? (
                    <span className="inline-block mt-1 sm:mt-1.5 bg-primary/10 text-primary px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-semibold">
                      {positionLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Quick info – 2-col grid on mobile, stacked on desktop */}
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-4 sm:pb-5">
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-2.5 sm:gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground min-w-0">
                  <Mail size={14} className="shrink-0" />
                  <span className="truncate">{displayEmail}</span>
                </div>
                {displayData.so_dien_thoai && (
                  <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground">
                    <Phone size={14} className="shrink-0" />
                    <span className="truncate">{displayData.so_dien_thoai}</span>
                  </div>
                )}
                {displayData.ten_phong_ban && (
                  <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground">
                    <Building2 size={14} className="shrink-0" />
                    <span className="truncate">{displayData.ten_phong_ban}</span>
                  </div>
                )}
                {displayData.ten_chuc_vu && (
                  <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground">
                    <Briefcase size={14} className="shrink-0" />
                    <span className="truncate">{displayData.ten_chuc_vu}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground">
                  <Calendar size={14} className="shrink-0" />
                  <span className="truncate">{txt('page.profile.joinedAt')} {formatDate(displayJoinedAt)}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground">
                  <Shield size={14} className="shrink-0" />
                  <span>{txt('page.profile.verified')}</span>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            {toolbarActions.length > 0 && (
              <div className="border-t border-border">
                <DetailToolbar
                  actions={toolbarActions}
                  columns={2}
                  className="py-3 sm:py-4"
                />
              </div>
            )}
          </div>
        </motion.aside>

        {/* --- Content: sections xếp dọc, full width mobile --- */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="w-full min-w-0 flex-1 space-y-4 sm:space-y-5"
        >
          <DetailSection title={txt('employee.detail.personalInfo')} icon={<UserIcon size={14} />} variant="primary">
            <DetailFieldGrid cols={3}>
              <DetailField label={txt('employee.detail.fullName')} value={data.ho_ten} icon={<UserIcon size={12} />} emptyText={emptyText} />
              <DetailField label={txt('employee.detail.gender')} value={data.gioi_tinh ? <EnumBadge value={data.gioi_tinh} config={GENDER_BADGE_CONFIG} /> : undefined} icon={<UserIcon size={12} />} emptyText={emptyText} />
              <DetailField label="ID" value={data.id || undefined} emptyText={emptyText} />
            </DetailFieldGrid>
          </DetailSection>

          <DetailSection title={txt('employee.detail.workInfo')} icon={<Briefcase size={14} />} variant="primary">
            <DetailFieldGrid cols={3}>
              <DetailField label={txt('employee.detail.position')} value={data.ten_chuc_vu} icon={<Briefcase size={12} />} emptyText={emptyText} />
              <DetailField label={txt('employee.detail.department')} value={data.ten_phong_ban} icon={<Building2 size={12} />} emptyText={emptyText} />
              <DetailField label={txt('employee.detail.level')} value={formatEmployeeCapBacLabel(data.cap_bac) || undefined} emptyText={emptyText} />
              <DetailField label={txt('employee.status')} value={data.trang_thai ? <EnumBadge value={data.trang_thai} config={STATUS_BADGE_CONFIG} /> : undefined} emptyText={emptyText} />
            </DetailFieldGrid>
          </DetailSection>

          <DetailSection title={txt('employee.detail.contactInfo')} icon={<Phone size={14} />} variant="primary">
            <DetailFieldGrid cols={3}>
              <DetailField label={txt('employee.detail.workEmail')} value={data.email} icon={<Mail size={12} />} emptyText={emptyText} />
              <DetailField label={txt('employee.detail.phone')} value={data.so_dien_thoai} icon={<Phone size={12} />} emptyText={emptyText} />
              <DetailField label={txt('employee.detail.loginName')} value={data.ten_dang_nhap ?? undefined} icon={<AtSign size={12} />} emptyText={emptyText} />
            </DetailFieldGrid>
          </DetailSection>

          {(data.tg_tao || data.tg_cap_nhat) && (
            <DetailSection title={txt('employee.detail.systemInfo')} icon={<Calendar size={14} />} variant="primary">
              <DetailFieldGrid cols={3}>
                <DetailField label={txt('employee.store.createdCol')} value={data.tg_tao ? formatDate(data.tg_tao) : undefined} icon={<Calendar size={12} />} emptyText={emptyText} />
                <DetailField label="Cập nhật" value={data.tg_cap_nhat ? formatDate(data.tg_cap_nhat) : undefined} icon={<Calendar size={12} />} emptyText={emptyText} />
              </DetailFieldGrid>
            </DetailSection>
          )}
        </motion.div>
      </div>
      </div>

      {/* ===== Modal: Đổi mật khẩu ===== */}
      <AnimatePresence>
        {passwordModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => !passwordSubmitting && setPasswordModalOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-card rounded-2xl shadow-xl border border-border w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">{txt('page.profile.changePasswordTitle')}</h3>
                <button
                  type="button"
                  onClick={() => !passwordSubmitting && setPasswordModalOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={txt('common.close')}
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{txt('page.profile.changePasswordDesc')}</p>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {passwordError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                    {passwordError}
                  </div>
                )}
                {(['current', 'new', 'confirm'] as const).map((field) => {
                  const labelKey =
                    field === 'current'
                      ? 'page.profile.currentPassword'
                      : field === 'new'
                        ? 'page.profile.newPassword'
                        : 'page.profile.confirmPassword';
                  return (
                    <div key={field}>
                      <label className="text-sm font-medium text-foreground block mb-1.5">{txt(labelKey)}</label>
                      <div className="relative">
                        <input
                          type={passwordShow[field] ? 'text' : 'password'}
                          value={passwordForm[field]}
                          onChange={(e) => setPasswordForm((f) => ({ ...f, [field]: e.target.value }))}
                          placeholder={txt('page.profile.passwordPlaceholder')}
                          autoComplete={field === 'current' ? 'current-password' : 'new-password'}
                          className={cn(
                            'flex h-10 w-full rounded-lg border border-input bg-background pl-3 pr-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setPasswordShow((s) => ({ ...s, [field]: !s[field] }))}
                          aria-label={passwordShow[field] ? txt('nav.changePassword.hidePassword') : txt('nav.changePassword.showPassword')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                        >
                          {passwordShow[field] ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => setPasswordModalOpen(false)}
                    disabled={passwordSubmitting}
                  >
                    {txt('common.cancel')}
                  </Button>
                  <Button type="submit" className="flex-1 rounded-xl" isLoading={passwordSubmitting} disabled={passwordSubmitting}>
                    {txt('nav.changePassword.submit')}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Profile;
