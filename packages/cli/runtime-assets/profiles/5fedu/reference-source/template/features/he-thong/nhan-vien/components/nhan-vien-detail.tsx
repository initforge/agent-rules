import React, { useCallback, useMemo, memo } from 'react';
import { txt } from '@/lib/text';
import { Employee } from '../core/types';
import {
  User, Mail, Phone, Briefcase, Building2, Edit, Trash2,
  Printer, ShieldCheck, AtSign,
} from 'lucide-react';
import GenericDrawer, { DRAWER_WIDTH_DETAIL } from '@/components/shared/GenericDrawer';
import type { DrawerOverlayTier } from '@/lib/dialog-sizes';
import DetailSection from '@/components/shared/DetailSection';
import DetailField from '@/components/shared/DetailField';
import DetailFieldGrid from '@/components/shared/DetailFieldGrid';
import DetailToolbar, { DetailToolbarAction } from '@/components/shared/DetailToolbar';
import Button from '@/components/ui/Button';
import Combobox from '@/components/ui/Combobox';
import EnumBadge from '@/components/ui/EnumBadge';
import { cn, getAvatarUrl } from '@/lib/utils';
import { openEmployeeProfilePreviewTab } from '../utils/open-employee-profile-preview';
import { BTN_CLOSE, BTN_EDIT, BTN_DELETE, CONFIRM_YES } from '@/lib/button-labels';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useUpdateStatusEmployee } from '../hooks/use-nhan-vien';
import { STATUS_OPTIONS, STATUS_BADGE_CONFIG, GENDER_BADGE_CONFIG } from '../core/constants';
import { formatEmployeeCapBacLabel } from '../utils/build-employee-position-options';
import { useCanOnRecord } from '@/hooks/use-can-on-record';
import DetailSystemSection from '@/components/shared/DetailSystemSection';

interface Props {
  data: Employee;
  onClose: () => void;
  onEdit: (item: Employee) => void;
  onDelete: (id: string) => void;
  overlayTier?: DrawerOverlayTier;
}

const EmployeeDetailComponent: React.FC<Props> = ({
  data,
  onClose,
  onEdit,
  onDelete,
  overlayTier = 'default',
}) => {
  const confirm = useConfirmStore((state) => state.confirm);
  const statusMutation = useUpdateStatusEmployee();
  const recordCtx = { nguoi_tao: data.nguoi_tao };
  const canEdit = useCanOnRecord('edit', 'employees', recordCtx);
  const canDelete = useCanOnRecord('delete', 'employees', recordCtx);
  const canViewExtras = useCanOnRecord('view', 'employees', recordCtx);

  const handleUpdateStatus = useCallback(() => {
    let selectedStatus: Employee['trang_thai'] = data.trang_thai;

    confirm({
      title: txt('employee.statusChangeTitle'),
      message: (
        <div className="space-y-4 text-left py-2">
          <p className="text-sm">
            {txt('employee.statusChangeMessage')} <strong>{data.ho_ten}</strong>:
          </p>
          <Combobox
            value={data.trang_thai}
            options={STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            onChange={(v) => {
              selectedStatus = v as Employee['trang_thai'];
            }}
            searchable={false}
            dropdownInPortal
          />
        </div>
      ),
      variant: 'info',
      confirmText: CONFIRM_YES(),
      onConfirm: async () => {
        await statusMutation.mutateAsync({ ids: [data.id], status: selectedStatus });
      },
    });
  }, [data.id, data.trang_thai, data.ho_ten, confirm, statusMutation]);

  const toolbarActions = useMemo((): DetailToolbarAction[] => {
    const actions: DetailToolbarAction[] = [];
    if (canEdit) {
      actions.push({
        label: txt('employee.detail.changeStatus'),
        icon: <Briefcase />,
        onClick: handleUpdateStatus,
        variant: 'info',
      });
    }
    if (canViewExtras) {
      actions.push(
        {
          label: txt('employee.detail.print'),
          icon: <Printer />,
          onClick: () => openEmployeeProfilePreviewTab(data.id),
          variant: 'secondary',
        },
        {
          label: txt('employee.detail.sendEmail'),
          icon: <Mail />,
          onClick: () => {
            window.location.href = `mailto:${data.email}`;
          },
          variant: 'primary',
        },
        {
          label: txt('employee.detail.callPhone'),
          icon: <Phone />,
          onClick: () => {
            window.location.href = `tel:${data.so_dien_thoai}`;
          },
          variant: 'success',
        },
      );
    }
    return actions;
  }, [handleUpdateStatus, data.id, data.email, data.so_dien_thoai, canEdit, canViewExtras]);

  const renderFooter = useMemo(
    () => (
      <div className="flex items-center justify-between w-full gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground border border-border"
        >
          {BTN_CLOSE()}
        </Button>
        {canEdit || canDelete ? (
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                size="sm"
                onClick={() => onEdit(data)}
                className="h-8 px-3 text-xs bg-primary text-white shadow-sm hover:bg-primary/90"
              >
                <Edit className="w-3.5 h-3.5 mr-1.5 shrink-0" /> {BTN_EDIT()}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(data.id)}
                className="h-8 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 border border-rose-200 hover:border-rose-300 dark:border-rose-800 dark:hover:border-rose-700"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5 shrink-0" /> {BTN_DELETE()}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    ),
    [onClose, onEdit, onDelete, data, canEdit, canDelete],
  );

  return (
    <GenericDrawer
      title={txt('employee.detail.title')}
      subtitle={data.ho_ten}
      icon={<User size={20} />}
      onClose={onClose}
      footer={renderFooter}
      footerCompact
      maxWidthClass={DRAWER_WIDTH_DETAIL}
      overlayTier={overlayTier}
    >
      <div className="space-y-5">
        <div className="bg-card p-4 rounded-xl border border-border/50 shadow-sm flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={data.anh_dai_dien || getAvatarUrl(data.ho_ten ?? '')}
              alt={data.ho_ten}
              className="w-14 h-14 rounded-xl border-2 border-card shadow-md object-cover bg-card"
            />
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card shadow-sm',
                data.trang_thai === 'Đang làm việc' ? 'bg-emerald-500' : 'bg-muted-foreground/30',
              )}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <h2 className="text-base font-bold text-foreground leading-tight truncate flex-1 min-w-0">
                {data.ho_ten}
              </h2>
              <div className="shrink-0">
                <EnumBadge value={data.trang_thai} config={STATUS_BADGE_CONFIG} />
              </div>
            </div>
            <p className="text-body-sm text-primary font-medium">{data.ten_chuc_vu}</p>
          </div>
        </div>

        <DetailToolbar actions={toolbarActions} className="bg-card rounded-xl border border-border" />

        <DetailSection title={txt('employee.detail.personalInfo')} icon={<User size={14} />}>
          <DetailFieldGrid>
            <DetailField label={txt('employee.detail.fullName')} value={data.ho_ten} icon={<User size={12} />} />
            <DetailField
              label={txt('employee.detail.gender')}
              value={<EnumBadge value={data.gioi_tinh} config={GENDER_BADGE_CONFIG} />}
            />
          </DetailFieldGrid>
        </DetailSection>

        <DetailSection title={txt('employee.detail.workInfo')} icon={<Briefcase size={14} />}>
          <DetailFieldGrid>
            <DetailField label={txt('employee.detail.position')} value={data.ten_chuc_vu} icon={<Briefcase size={12} />} />
            <DetailField label={txt('employee.detail.department')} value={data.ten_phong_ban} icon={<Building2 size={12} />} />
            <DetailField
              label={txt('employee.detail.division')}
              value={data.ten_bo_phan || '—'}
              icon={<Building2 size={12} />}
            />
            <DetailField
              label={txt('employee.detail.level')}
              value={formatEmployeeCapBacLabel(data.cap_bac) || undefined}
            />
          </DetailFieldGrid>
        </DetailSection>

        {data.ten_dang_nhap && (
          <DetailSection title={txt('employee.detail.authAccount')} icon={<ShieldCheck size={14} />}>
            <DetailFieldGrid>
              <DetailField
                label={txt('employee.detail.loginName')}
                value={data.ten_dang_nhap ?? undefined}
                icon={<AtSign size={12} />}
              />
              <DetailField
                label={txt('employee.detail.accountActive')}
                value={
                  data.tai_khoan_dang_hoat_dong === false
                    ? txt('employee.detail.accountInactive')
                    : txt('employee.statusActive')
                }
                icon={<ShieldCheck size={12} />}
              />
            </DetailFieldGrid>
          </DetailSection>
        )}

        <DetailSection title={txt('employee.detail.contactInfo')} icon={<Phone size={14} />}>
          <DetailFieldGrid>
            <DetailField label={txt('employee.detail.workEmail')} value={data.email} icon={<Mail size={12} />} />
            <DetailField label={txt('employee.detail.phone')} value={data.so_dien_thoai} icon={<Phone size={12} />} />
          </DetailFieldGrid>
        </DetailSection>

        <DetailSystemSection
          title={txt('employee.detail.systemInfo')}
          createdAt={data.tg_tao}
          updatedAt={data.tg_cap_nhat}
          createdBy={data.ten_nguoi_tao ?? undefined}
          labels={{
            createdAt: txt('employee.detail.createdDate'),
            updated: txt('employee.detail.lastUpdated'),
            createdBy: txt('employee.detail.createdBy'),
          }}
        />
      </div>
    </GenericDrawer>
  );
};

export default memo(EmployeeDetailComponent);
