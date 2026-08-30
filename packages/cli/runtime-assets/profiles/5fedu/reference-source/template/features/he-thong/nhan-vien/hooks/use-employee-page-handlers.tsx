import { useCallback, startTransition } from 'react';
import type { FeaturePageHandlerContext, FeaturePageHandlers } from '@/lib/factories/create-feature-module';
import type { FormViewOrigin } from '@/lib/last-view-flow';
import Combobox from '@/components/ui/Combobox';
import { txt } from '@/lib/text';
import { CONFIRM_DELETE, CONFIRM_DELETE_ALL, CONFIRM_YES } from '@/lib/button-labels';
import { useConfirmStore } from '@/store/useConfirmStore';
import { STATUS_OPTIONS, type TrangThaiNhanVien } from '../core/constants';
import type { Employee } from '../core/types';
import { useDeleteWithUndo, useUpdateStatusEmployee } from './use-nhan-vien';

export function useEmployeePageHandlers(
  ctx: FeaturePageHandlerContext<Employee>,
): FeaturePageHandlers<Employee> {
  const {
    rawData,
    rawDataRef,
    viewingItemRef,
    editingItemRef,
    formOriginRef,
    setViewingItem,
    setEditingItem,
    setShowForm,
    setFormOrigin,
    clearSelection,
    keyExtractor,
  } = ctx;

  const { deleteWithUndo } = useDeleteWithUndo();
  const statusMutation = useUpdateStatusEmployee();
  const confirm = useConfirmStore((s) => s.confirm);

  const handleEdit = useCallback(
    (item: Employee, origin?: FormViewOrigin) => {
      const resolvedOrigin: FormViewOrigin =
        origin ?? (viewingItemRef.current ? 'detail' : 'list');
      startTransition(() => {
        setFormOrigin(resolvedOrigin);
        if (resolvedOrigin === 'list') setViewingItem(null);
        setEditingItem(item);
        setShowForm(true);
      });
    },
    [setFormOrigin, setEditingItem, setShowForm, setViewingItem, viewingItemRef],
  );

  const handleView = useCallback(
    (item: Employee) => {
      startTransition(() => setViewingItem(item));
    },
    [setViewingItem],
  );

  const closeDetail = useCallback(() => setViewingItem(null), [setViewingItem]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    const origin = formOriginRef.current;
    const ed = editingItemRef.current;
    if (origin === 'list') {
      setViewingItem(null);
    } else if (origin === 'detail' && ed) {
      const fresh = rawDataRef.current.find((e) => keyExtractor(e) === keyExtractor(ed));
      setViewingItem(fresh ?? null);
    }
    setEditingItem(null);
    setFormOrigin('list');
  }, [
    setShowForm,
    editingItemRef,
    formOriginRef,
    rawDataRef,
    setViewingItem,
    setEditingItem,
    setFormOrigin,
    keyExtractor,
  ]);

  const handleDelete = useCallback(
    (id: string) => {
      const emp = rawDataRef.current.find((e) => keyExtractor(e) === id);
      if (!emp) return;
      confirm({
        title: txt('employee.deleteConfirmTitle'),
        message: `${txt('employee.deleteConfirmMessage')} "${emp.ho_ten}"? ${txt('employee.deleteConfirmNote')}`,
        variant: 'danger',
        confirmText: CONFIRM_DELETE(),
        onConfirm: async () => {
          await deleteWithUndo([emp], {
            onDone: () => {
              if (viewingItemRef.current && keyExtractor(viewingItemRef.current) === id) {
                setViewingItem(null);
              }
              if (editingItemRef.current && keyExtractor(editingItemRef.current) === id) {
                setShowForm(false);
              }
            },
          });
        },
      });
    },
    [confirm, deleteWithUndo, viewingItemRef, editingItemRef, setViewingItem, setShowForm, keyExtractor, rawDataRef],
  );

  const handleStatusChange = useCallback(
    (item: Employee) => {
      let selectedStatus: Employee['trang_thai'] = item.trang_thai;

      confirm({
        title: txt('employee.statusChangeTitle'),
        message: (
          <div className="space-y-4 text-left py-2">
            <p className="text-sm">
              {txt('employee.statusChangeMessage')} <strong>{item.ho_ten}</strong>:
            </p>
            <Combobox
              value={item.trang_thai}
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
          await statusMutation.mutateAsync({ ids: [item.id], status: selectedStatus });
        },
      });
    },
    [confirm, statusMutation],
  );

  const handleDeleteMany = useCallback(
    (ids: string[]) => {
      const emps = rawData.filter((e) => ids.includes(keyExtractor(e)));
      confirm({
        title: txt('employee.bulkDeleteTitle'),
        message: txt('employee.bulkDeleteMessage', { count: ids.length }),
        variant: 'danger',
        confirmText: CONFIRM_DELETE_ALL(),
        onConfirm: async () => {
          await deleteWithUndo(emps, { onDone: clearSelection });
        },
      });
    },
    [rawData, confirm, deleteWithUndo, clearSelection, keyExtractor],
  );

  const handleStatusChangeMany = useCallback(
    (ids: string[], status: string) => {
      confirm({
        title: txt('employee.bulkStatusTitle'),
        message: `${txt('employee.bulkStatusMessage', { count: ids.length })} "${status}"?`,
        variant: 'warning',
        confirmText: CONFIRM_YES(),
        onConfirm: async () => {
          await statusMutation.mutateAsync({ ids, status: status as TrangThaiNhanVien });
          clearSelection();
        },
      });
    },
    [confirm, statusMutation, clearSelection],
  );

  const handleAdd = useCallback(() => {
    startTransition(() => {
      setFormOrigin('list');
      setShowForm(true);
    });
  }, [setFormOrigin, setShowForm]);

  return {
    handleEdit,
    handleView,
    handleDelete,
    handleDeleteMany,
    handleStatusChange,
    handleStatusChangeMany,
    closeForm,
    closeDetail,
    handleAdd,
  };
}
