import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import EnumBadge from '@/components/ui/EnumBadge';
import type { BadgeConfig } from '@/components/ui/EnumBadge';
import { buildDepartmentLevelBadgeConfig, departmentTrangThaiBadgeConfig } from '../utils/department-badges';
import { txt } from '@/lib/text';
import {
  Edit,
  Trash2,
  Building2,
  Layers,
  ArrowUpFromLine,
  Power,
  Plus,
  Folder,
  FileText,
  Briefcase,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Department } from '../core/types';
import GenericDrawer, { DRAWER_WIDTH_DETAIL } from '@/components/shared/GenericDrawer';
import DetailSection from '@/components/shared/DetailSection';
import DetailField from '@/components/shared/DetailField';
import DetailFieldGrid from '@/components/shared/DetailFieldGrid';
import DetailToolbar, { DetailToolbarAction } from '@/components/shared/DetailToolbar';
import DetailSystemSection from '@/components/shared/DetailSystemSection';
import EmptyState from '@/components/shared/EmptyState';
import EmbeddedChildDataGrid from '@/components/shared/EmbeddedChildDataGrid';
import { BTN_CLOSE, BTN_EDIT, BTN_DELETE, CONFIRM_DELETE, CONFIRM_YES } from '@/lib/button-labels';
import { useCan } from '@/hooks/use-can';
import { useResourcePermissions } from '@/hooks/use-resource-permissions';
import { useCanOnRecord } from '@/hooks/use-can-on-record';
import { canAddChildDepartment } from '../utils/department-hierarchy';
import { getPositionsForDepartment } from '../utils/department-positions';
import { DepartmentTableRowActions } from './department-table-row-actions';
import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import {
  usePositions,
  useDeletePosition,
  useUpdateStatusPosition,
} from '@/features/he-thong/chuc-vu/hooks/use-chuc-vu';
import { PositionTableRowActions } from '@/features/he-thong/chuc-vu/components/position-table-row-actions';
import { useConfirmStore } from '@/store/useConfirmStore';
import { getDrawerWidthClass, DRAWER_Z_CONTENT_BASE } from '@/lib/dialog-sizes';
import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';

const PositionForm = lazy(() => import('@/features/he-thong/chuc-vu/components/chuc-vu-form'));
const PositionDetail = lazy(() => import('@/features/he-thong/chuc-vu/components/chuc-vu-detail'));

const DrawerLazyFallback: React.FC = () => (
  <div
    className="fixed inset-0 flex items-center justify-center bg-black/30 pointer-events-none"
    style={{ zIndex: DRAWER_Z_CONTENT_BASE }}
  >
    <div
      className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent"
      aria-hidden
    />
  </div>
);

interface Props {
  data: Department;
  allDepartments: Department[];
  onClose: () => void;
  onEdit: (item: Department) => void;
  onDelete: (id: string) => void;
  onStatusChange?: (item: Department) => void;
  onAddChild?: (parent: Department) => void;
  /** Click dòng con mở detail con (drawer do index render, đóng khi Thêm/Sửa/Xóa/Hủy) */
  onViewChild?: (child: Department) => void;
  /** Drawer nhỏ hơn khi là detail con (stackLevel do index truyền) */
  maxWidthClass?: string;
  stackLevel?: number;
}

const DepartmentDetail: React.FC<Props> = ({
  data,
  allDepartments,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  onAddChild,
  onViewChild,
  maxWidthClass = DRAWER_WIDTH_DETAIL,
  stackLevel = 0,
}) => {
  const confirm = useConfirmStore((s) => s.confirm);
  const recordCtx = { nguoi_tao: data.nguoi_tao };
  const canEdit = useCanOnRecord('edit', 'departments', recordCtx);
  const canDelete = useCanOnRecord('delete', 'departments', recordCtx);
  const canCreate = useCan('create', 'departments');
  const {
    canView: canViewPositions,
    canCreate: canCreatePosition,
  } = useResourcePermissions('positions');

  const { data: allPositions = [] } = usePositions();
  const deletePositionMutation = useDeletePosition();
  const statusPositionMutation = useUpdateStatusPosition();

  const [childMenuOpenId, setChildMenuOpenId] = useState<string | null>(null);
  const [positionMenuOpenId, setPositionMenuOpenId] = useState<string | null>(null);
  const [viewingPosition, setViewingPosition] = useState<Position | null>(null);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [showPositionForm, setShowPositionForm] = useState(false);

  const isActive = data.trang_thai === 'Đang hoạt động';
  const parentDept = data.cha_id ? allDepartments.find((d) => d.id === data.cha_id) : null;
  const positionStackLevel = stackLevel + 1;
  const positionDrawerWidth = getDrawerWidthClass(positionStackLevel);

  const levelBadgeConfig = useMemo(() => buildDepartmentLevelBadgeConfig(), []);
  const statusBadgeConfig = useMemo(() => departmentTrangThaiBadgeConfig(), []);
  const positionStatusBadgeConfig = useMemo(
    (): BadgeConfig<string> => ({
      'Đang hoạt động': { label: txt('position.active'), color: 'emerald' },
      'Ngừng hoạt động': { label: txt('position.inactive'), color: 'slate' },
    }),
    [],
  );

  const children = useMemo(
    () =>
      allDepartments
        .filter((d) => d.cha_id === data.id)
        .sort((a, b) => a.thu_tu - b.thu_tu),
    [allDepartments, data.id],
  );

  const departmentPositions = useMemo(
    () => getPositionsForDepartment(allPositions, data.id),
    [allPositions, data.id],
  );

  const resolvedViewingPosition = useMemo(() => {
    if (!viewingPosition) return null;
    return allPositions.find((p) => p.id === viewingPosition.id) ?? viewingPosition;
  }, [allPositions, viewingPosition]);

  const showAddChild = canAddChildDepartment(data);

  const handleClosePositionForm = useCallback(() => {
    setShowPositionForm(false);
    setEditingPosition(null);
  }, []);

  const handleDeletePosition = useCallback(
    (id: string) => {
      confirm({
        title: txt('position.deleteTitle'),
        message: txt('position.deleteMessage'),
        variant: 'danger',
        confirmText: CONFIRM_DELETE(),
        onConfirm: async () => {
          deletePositionMutation.mutate([id], {
            onSuccess: () => {
              if (viewingPosition?.id === id) setViewingPosition(null);
            },
          });
        },
      });
    },
    [confirm, deletePositionMutation, viewingPosition?.id],
  );

  const handleStatusChangePosition = useCallback(
    (item: Position) => {
      const newStatus: TrangThaiHoatDong =
        item.trang_thai === 'Đang hoạt động' ? 'Ngừng hoạt động' : 'Đang hoạt động';
      confirm({
        title: txt('position.statusChangeTitle'),
        message: `${txt('position.statusChangeMessage', { count: 1 })} ${newStatus}?`,
        variant: 'warning',
        confirmText: CONFIRM_YES(),
        onConfirm: async () => {
          statusPositionMutation.mutate(
            { ids: [item.id], status: newStatus },
            {
              onSuccess: () => {
                if (viewingPosition?.id === item.id) {
                  setViewingPosition((prev) =>
                    prev ? { ...prev, trang_thai: newStatus } : null,
                  );
                }
              },
            },
          );
        },
      });
    },
    [confirm, statusPositionMutation, viewingPosition?.id],
  );

  const toolbarActions: DetailToolbarAction[] = [
    ...(onStatusChange && canEdit
      ? [
          {
            label: isActive ? txt('department.detail.deactivate') : txt('department.detail.activate'),
            icon: <Power size={16} />,
            onClick: () => onStatusChange(data),
            variant: 'info' as const,
          },
        ]
      : []),
  ];

  const renderFooter = (
    <div className="flex w-full items-center justify-between gap-2">
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
    <>
      <GenericDrawer
        title={txt('department.detail.title')}
        subtitle={data.ma_phong_ban}
        icon={<Building2 size={18} />}
        onClose={onClose}
        footer={renderFooter}
        footerCompact
        maxWidthClass={maxWidthClass}
        stackLevel={stackLevel}
      >
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/20">
              <Building2 size={24} className="text-white" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <h2 className="min-w-0 flex-1 truncate text-base font-bold leading-tight text-foreground">
                  {data.ten_phong_ban}
                </h2>
                <div className="shrink-0">
                  <EnumBadge shape="pill" value={data.trang_thai} config={statusBadgeConfig} />
                </div>
              </div>
              <p className="font-mono text-body-sm text-muted-foreground">{data.ma_phong_ban}</p>
            </div>
          </div>

          {toolbarActions.length > 0 && (
            <DetailToolbar actions={toolbarActions} className="bg-card rounded-xl border border-border" />
          )}

          <DetailSection title={txt('department.detail.basicInfo')} icon={<Building2 size={14} />} variant="primary">
            <DetailFieldGrid>
              <DetailField label={txt('department.name')} value={data.ten_phong_ban} icon={<Building2 size={12} />} />
              <DetailField label={txt('department.code')} value={data.ma_phong_ban} icon={<Building2 size={12} />} />
              <DetailField
                label={txt('department.detail.description')}
                value={data.mo_ta ?? ''}
                icon={<FileText size={12} />}
                emptyText={txt('page.profile.emptyField')}
              />
              <DetailField
                label={txt('department.detail.parent')}
                value={parentDept ? parentDept.ten_phong_ban : txt('department.detail.noParent')}
                icon={<Folder size={12} />}
                emptyText={txt('department.detail.noParent')}
              />
              <DetailField
                label={txt('department.detail.level')}
                value={
                  <EnumBadge
                    shape="rounded"
                    value={data.cap_do}
                    config={levelBadgeConfig}
                    fallbackLabel={txt('department.levelBadge', { level: data.cap_do })}
                  />
                }
                icon={<Layers size={12} />}
              />
              <DetailField label={txt('department.detail.order')} value={String(data.thu_tu)} icon={<ArrowUpFromLine size={12} />} />
              <DetailField
                label={txt('common.status')}
                value={<EnumBadge shape="pill" value={data.trang_thai} config={statusBadgeConfig} />}
                icon={<Power size={12} />}
              />
            </DetailFieldGrid>
          </DetailSection>

          {showAddChild ? (
            <DetailSection
              title={txt('department.detail.childrenSection')}
              icon={<Building2 size={14} />}
              variant="primary"
              headerRight={
                <>
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
                    {children.length} {txt('department.footerRecords')}
                  </span>
                  {onAddChild && canCreate ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onAddChild(data)}
                      className="h-8 shrink-0 bg-primary px-3 text-white shadow-sm hover:bg-primary/90"
                    >
                      <Plus size={14} className="mr-1.5" />
                      {txt('department.detail.addChild')}
                    </Button>
                  ) : null}
                </>
              }
            >
              {children.length === 0 ? (
                <EmptyState
                  title={txt('department.detail.noChildren')}
                  description={txt('department.detail.noChildrenHint')}
                  icon={<Folder className="h-10 w-10 text-muted-foreground" />}
                />
              ) : (
                <EmbeddedChildDataGrid<Department>
                  rows={children}
                  getRowKey={(child) => child.id}
                  labelColumn={{
                    header: txt('department.name'),
                    minWidthClass: 'min-w-[160px]',
                    renderCell: (child) => <span className="font-medium text-foreground">{child.ten_phong_ban}</span>,
                  }}
                  columns={[
                    {
                      id: 'code',
                      header: txt('department.code'),
                      renderCell: (child) => (
                        <span className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {child.ma_phong_ban}
                        </span>
                      ),
                    },
                    {
                      id: 'desc',
                      header: txt('department.store.descCol'),
                      headerClassName: 'max-w-[180px]',
                      cellClassName: 'max-w-[180px]',
                      renderCell: (child) => (
                        <span className="line-clamp-2 text-xs text-muted-foreground">{child.mo_ta ?? '—'}</span>
                      ),
                    },
                    {
                      id: 'status',
                      header: txt('common.status'),
                      renderCell: (child) => (
                        <EnumBadge shape="pill" value={child.trang_thai} config={statusBadgeConfig} />
                      ),
                    },
                  ]}
                  actionsColumn={{
                    header: txt('common.actions'),
                    widthClass: 'w-[92px] min-w-[92px]',
                    renderCell: (child) => (
                      <DepartmentTableRowActions
                        compact
                        item={child}
                        menuOpenId={childMenuOpenId}
                        onMenuOpenChange={setChildMenuOpenId}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onStatusChange={onStatusChange}
                      />
                    ),
                  }}
                  onRowClick={onViewChild ? (child) => onViewChild(child) : undefined}
                  containerClassName="border-0 shadow-none"
                />
              )}
            </DetailSection>
          ) : null}

          {canViewPositions ? (
            <DetailSection
              title={txt('department.detail.positionsSection')}
              icon={<Briefcase size={14} />}
              variant="primary"
              headerRight={
                <>
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
                    {departmentPositions.length} {txt('department.footerRecords')}
                  </span>
                  {canCreatePosition ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setEditingPosition(null);
                        setShowPositionForm(true);
                      }}
                      className="h-8 shrink-0 bg-primary px-3 text-white shadow-sm hover:bg-primary/90"
                    >
                      <Plus size={14} className="mr-1.5" />
                      {txt('department.detail.addPosition')}
                    </Button>
                  ) : null}
                </>
              }
            >
              {departmentPositions.length === 0 ? (
                <EmptyState
                  title={txt('department.detail.noPositions')}
                  description={txt('department.detail.noPositionsHint')}
                  icon={<Briefcase className="h-10 w-10 text-muted-foreground" />}
                />
              ) : (
                <EmbeddedChildDataGrid<Position>
                  rows={departmentPositions}
                  getRowKey={(position) => position.id}
                  labelColumn={{
                    header: txt('position.form.name'),
                    minWidthClass: 'min-w-[160px]',
                    renderCell: (position) => (
                      <span className="font-medium text-foreground">{position.ten_chuc_vu}</span>
                    ),
                  }}
                  columns={[
                    {
                      id: 'code',
                      header: txt('position.form.code'),
                      renderCell: (position) => (
                        <span className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {position.ma_chuc_vu}
                        </span>
                      ),
                    },
                    {
                      id: 'level',
                      header: txt('position.detail.level'),
                      renderCell: (position) => (
                        <span className="text-xs text-muted-foreground">
                          {position.cap_bac != null ? String(position.cap_bac) : '—'}
                        </span>
                      ),
                    },
                    {
                      id: 'status',
                      header: txt('common.status'),
                      renderCell: (position) => (
                        <EnumBadge shape="pill" value={position.trang_thai} config={positionStatusBadgeConfig} />
                      ),
                    },
                  ]}
                  actionsColumn={{
                    header: txt('common.actions'),
                    widthClass: 'w-[92px] min-w-[92px]',
                    renderCell: (position) => (
                      <PositionTableRowActions
                        compact
                        item={position}
                        menuOpenId={positionMenuOpenId}
                        onMenuOpenChange={setPositionMenuOpenId}
                        onEdit={(item) => {
                          setEditingPosition(item);
                          setShowPositionForm(true);
                          setViewingPosition(null);
                        }}
                        onDelete={handleDeletePosition}
                        onStatusChange={handleStatusChangePosition}
                      />
                    ),
                  }}
                  onRowClick={(position) => setViewingPosition(position)}
                  containerClassName="border-0 shadow-none"
                />
              )}
            </DetailSection>
          ) : null}

          <DetailSystemSection
            title={txt('department.detail.systemInfo')}
            createdAt={data.tg_tao}
            updatedAt={data.tg_cap_nhat}
            createdBy={data.ten_nguoi_tao ?? undefined}
            labels={{
              createdAt: txt('department.detail.createdAt'),
              updated: txt('department.detail.updated'),
            }}
          />
        </div>
      </GenericDrawer>

      <AnimatePresence>
        {showPositionForm ? (
          <Suspense fallback={<DrawerLazyFallback />}>
            <PositionForm
              initialData={editingPosition}
              defaultPhongBanId={data.id}
              stackLevel={positionStackLevel}
              onClose={handleClosePositionForm}
            />
          </Suspense>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {resolvedViewingPosition && !showPositionForm ? (
          <Suspense fallback={<DrawerLazyFallback />}>
            <PositionDetail
              data={resolvedViewingPosition}
              maxWidthClass={positionDrawerWidth}
              stackLevel={positionStackLevel}
              onClose={() => setViewingPosition(null)}
              onEdit={(item) => {
                setEditingPosition(item);
                setShowPositionForm(true);
                setViewingPosition(null);
              }}
              onDelete={handleDeletePosition}
              onStatusChange={handleStatusChangePosition}
            />
          </Suspense>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export default DepartmentDetail;
