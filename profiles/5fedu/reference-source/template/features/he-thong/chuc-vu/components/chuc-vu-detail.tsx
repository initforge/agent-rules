import React, { useMemo } from 'react';
import { txt } from '@/lib/text';
import { Edit, Trash2, Briefcase, Power, Building2, Layers, FileText, ArrowUpFromLine } from 'lucide-react';
import Button from '@/components/ui/Button';
import EnumBadge from '@/components/ui/EnumBadge';
import type { BadgeConfig } from '@/components/ui/EnumBadge';
import { Position } from '../core/types';
import GenericDrawer, { DRAWER_WIDTH_DETAIL } from '@/components/shared/GenericDrawer';
import DetailSection from '@/components/shared/DetailSection';
import DetailField from '@/components/shared/DetailField';
import DetailFieldGrid from '@/components/shared/DetailFieldGrid';
import DetailSystemSection from '@/components/shared/DetailSystemSection';
import DetailToolbar, { DetailToolbarAction } from '@/components/shared/DetailToolbar';
import { BTN_CLOSE, BTN_EDIT, BTN_DELETE } from '@/lib/button-labels';
import { useCanOnRecord } from '@/hooks/use-can-on-record';

interface Props {
  data: Position;
  onClose: () => void;
  onEdit: (item: Position) => void;
  onDelete: (id: string) => void;
  onStatusChange?: (item: Position) => void;
  maxWidthClass?: string;
  stackLevel?: number;
}

const PositionDetail: React.FC<Props> = ({
  data,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  maxWidthClass = DRAWER_WIDTH_DETAIL,
  stackLevel = 0,
}) => {
  const recordCtx = { nguoi_tao: data.nguoi_tao };
  const canEdit = useCanOnRecord('edit', 'positions', recordCtx);
  const canDelete = useCanOnRecord('delete', 'positions', recordCtx);
  const isActive = data.trang_thai === 'Đang hoạt động';

  const trangThaiBadgeConfig = useMemo((): BadgeConfig<string> => ({
    'Đang hoạt động': { label: txt('position.active'), color: 'emerald' },
    'Ngừng hoạt động': { label: txt('position.inactive'), color: 'slate' },
  }), []);

  const toolbarActions: DetailToolbarAction[] = [
    ...(onStatusChange && canEdit
      ? [
          {
            label: isActive ? txt('position.detail.deactivate') : txt('position.detail.activate'),
            icon: <Power size={16} />,
            onClick: () => onStatusChange(data),
            variant: 'info' as const,
          },
        ]
      : []),
  ];

  const renderFooter = (
    <div className="flex items-center justify-between w-full gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground border border-border"
      >
        {BTN_CLOSE()}
      </Button>
      {(canEdit || canDelete) ? (
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              size="sm"
              onClick={() => {
                onEdit(data);
                onClose();
              }}
              className="h-8 px-3 text-xs bg-primary text-white shadow-sm hover:bg-primary/90"
            >
              <Edit className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              {BTN_EDIT()}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDelete(data.id);
                onClose();
              }}
              className="h-8 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:text-rose-400 border border-rose-200 hover:border-rose-300 dark:border-rose-800 dark:hover:border-rose-700"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              {BTN_DELETE()}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <GenericDrawer
      title={txt('position.detail.title')}
      subtitle={`${txt('position.detail.subtitle')}: ${data.ma_chuc_vu}`}
      icon={<Briefcase size={18} />}
      onClose={onClose}
      footer={renderFooter}
      footerCompact
      maxWidthClass={maxWidthClass}
      stackLevel={stackLevel}
    >
      <div className="space-y-5">
        <div className="bg-card p-4 rounded-xl border border-border/50 shadow-sm flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white shadow-primary/20 shadow-lg shrink-0">
            <Briefcase size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <h2 className="text-base font-bold text-foreground leading-tight truncate flex-1 min-w-0">
                {data.ten_chuc_vu}
              </h2>
              <div className="shrink-0">
                <EnumBadge value={data.trang_thai} config={trangThaiBadgeConfig} />
              </div>
            </div>
            <p className="text-body-sm text-muted-foreground font-mono">{data.ma_chuc_vu}</p>
          </div>
        </div>

        {toolbarActions.length > 0 && (
          <DetailToolbar actions={toolbarActions} className="bg-card rounded-xl border border-border" />
        )}

        <DetailSection title={txt('position.detail.basicInfo')} icon={<Briefcase size={14} />} variant="primary">
          <DetailFieldGrid>
            <DetailField label={txt('position.form.code')} value={data.ma_chuc_vu} icon={<Briefcase size={12} />} />
            <DetailField label={txt('position.form.name')} value={data.ten_chuc_vu} icon={<Briefcase size={12} />} />
            <DetailField
              label={txt('position.detail.level')}
              value={data.cap_bac != null ? String(data.cap_bac) : '—'}
              icon={<Layers size={12} />}
              emptyText="—"
            />
            <DetailField label={txt('position.detail.department')} value={data.ten_phong_ban ?? '—'} icon={<Building2 size={12} />} emptyText="—" />
            <DetailField label={txt('position.detail.order')} value={String(data.thu_tu ?? 0)} icon={<ArrowUpFromLine size={12} />} />
            <DetailField label={txt('position.detail.description')} value={data.mo_ta ?? ''} icon={<FileText size={12} />} emptyText="—" />
            <DetailField label={txt('common.status')} value={isActive ? txt('position.active') : txt('position.inactive')} icon={<Power size={12} />} />
          </DetailFieldGrid>
        </DetailSection>

        <DetailSystemSection
          title={txt('position.detail.systemInfo')}
          createdAt={data.tg_tao}
          updatedAt={data.tg_cap_nhat}
          createdBy={data.ten_nguoi_tao ?? undefined}
          labels={{
            createdAt: txt('position.detail.createdAt'),
            updated: txt('position.detail.updated'),
          }}
        />
      </div>
    </GenericDrawer>
  );
};

export default PositionDetail;
