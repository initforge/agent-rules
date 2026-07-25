/**
 * Factory trang CRUD dạng cây (phòng ban, …): filter/sort client, drawer stack, import/export.
 */
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  Suspense,
  startTransition,
} from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { txt } from '@/lib/text';
import { useListWithFilter } from '@/lib/list-filter-utils';
import { useExportData } from '@/hooks/use-export-data';
import { useConfirmStore } from '@/store/useConfirmStore';
import { CONFIRM_DELETE, CONFIRM_DELETE_ALL, CONFIRM_YES } from '@/lib/button-labels';
import { DRAWER_WIDTH_DETAIL_SMALL, DRAWER_Z_CONTENT_BASE } from '@/lib/dialog-sizes';
import type { FormViewOrigin } from '@/lib/last-view-flow';
import ImportDialog from '@/components/shared/ImportDialog';
import type { ImportBatchRow, ImportLookupSheet, ImportMutationInput, ImportResult } from '@/lib/import';
import ExportDialog from '@/components/shared/ExportDialog';
import type { GenericState } from '@/store/createGenericStore';
import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';

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

export interface HierarchyImportColumn {
  key: string;
  label: string;
  required?: boolean;
}

export interface HierarchyExportColumn {
  key: string;
  label: string;
}

export interface HierarchyFeatureModuleConfig<T, TFilters, TFormValues> {
  useData: () => { data?: T[]; isLoading: boolean };
  useStore: () => GenericState<TFilters> & {
    selectedIds: Set<string>;
    toggleSelection: (id: string) => void;
    toggleAllSelection: (ids: string[]) => void;
    clearSelection: () => void;
    pagination: { page: number; pageSize: number };
    setPage: (page: number) => void;
    setPageSize: (size: number) => void;
    columns: { id: string; visible: boolean }[];
  };
  keyExtractor: (item: T) => string;
  filterFn: (item: T, searchTerm: string, filters: TFilters, allItems: T[]) => boolean;
  sortItems: (items: T[], sort: GenericState<TFilters>['sort'], allItems: T[]) => T[];
  exportMapFn: (item: T) => Record<string, unknown>;
  importColumns: HierarchyImportColumn[];
  exportColumns: HierarchyExportColumn[];
  exportFileName: string;
  importTemplateName: string;
  noExportDataMessage: string;
  importLookupSheets?:
    | ImportLookupSheet[]
    | ((ctx: { primary: T[] }) => ImportLookupSheet[]);
  mapImportRows: (data: Record<string, unknown>[]) => TFormValues[];
  useDeleteMutation: () => {
    mutate: (id: string, opts?: { onSuccess?: () => void }) => void;
    mutateAsync: (id: string) => Promise<unknown>;
  };
  useStatusMutation: () => {
    mutate: (
      vars: { id: string; status: TrangThaiHoatDong },
      opts?: { onSuccess?: (updated: T) => void },
    ) => void;
    mutateAsync: (vars: { id: string; status: TrangThaiHoatDong }) => Promise<T>;
  };
  useImportMutation: () => {
    mutateAsync: (input: ImportMutationInput) => Promise<ImportResult>;
  };
  getStatusToggle: (item: T) => { next: TrangThaiHoatDong; label: string };
  getDeleteTitle: () => string;
  getDeleteMessage: () => string;
  getStatusChangeTitle: () => string;
  getStatusChangeMessage: (item: T, statusLabel: string) => string;
  ToolbarComponent: React.ComponentType<{
    departments: T[];
    selectedCount: number;
    onAdd: () => void;
    onExport: () => void;
    onImport: () => void;
    onDeleteMany: () => void;
    onStatusChangeMany: (status: TrangThaiHoatDong) => void;
  }>;
  ListComponent: React.ComponentType<{
    data: T[];
    allDepartments: T[];
    columns: GenericState<TFilters>['columns'];
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onToggleAllSelection: (ids: string[]) => void;
    isLoading: boolean;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    onEdit: (item: T) => void;
    onDelete: (id: string) => void;
    onStatusChange: (item: T) => void;
    onView: (item: T) => void;
  }>;
  FormComponent: React.ComponentType<{
    initialData: T | null;
    allDepartments: T[];
    onClose: () => void;
    defaultParentId?: string;
  }>;
  DetailComponent: React.ComponentType<{
    data: T;
    allDepartments: T[];
    onClose: () => void;
    onEdit: (item: T) => void;
    onDelete: (id: string) => void;
    onStatusChange: (item: T) => void;
    onAddChild: (parent: T) => void;
    onViewChild: (child: T) => void;
    maxWidthClass?: string;
    stackLevel?: number;
  }>;
  canViewChild: (parent: T, child: T) => boolean;
  syncDetailOnFormClose: (
    wasEditing: T | null,
    formOrigin: 'list' | 'detail',
    detailRoot: T | undefined,
    allItems: T[],
  ) => T | null | undefined;
}

export function createHierarchyFeatureModule<T, TFilters, TFormValues>(
  config: HierarchyFeatureModuleConfig<T, TFilters, TFormValues>,
): React.FC {
  const {
    useData,
    useStore,
    keyExtractor,
    filterFn,
    sortItems,
    exportMapFn,
    importColumns,
    exportColumns,
    exportFileName,
    importTemplateName,
    noExportDataMessage,
    importLookupSheets,
    mapImportRows,
    useDeleteMutation,
    useStatusMutation,
    useImportMutation,
    getStatusToggle,
    getDeleteTitle,
    getDeleteMessage,
    getStatusChangeTitle,
    getStatusChangeMessage,
    ToolbarComponent,
    ListComponent,
    FormComponent,
    DetailComponent,
    canViewChild,
    syncDetailOnFormClose,
  } = config;

  const HierarchyPage: React.FC = () => {
    const confirm = useConfirmStore((s) => s.confirm);
    const store = useStore();
    const {
      searchTerm,
      filters,
      resetState,
      selectedIds,
      columns,
      sort,
      clearSelection,
      toggleSelection,
      toggleAllSelection,
      pagination,
      setPage,
      setPageSize,
    } = store;
    const { page, pageSize } = pagination;

    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState<T | null>(null);
    const [detailStack, setDetailStack] = useState<T[]>([]);
    const [addChildOf, setAddChildOf] = useState<T | null>(null);
    const [formOrigin, setFormOrigin] = useState<FormViewOrigin>('list');
    const [showExport, setShowExport] = useState(false);
    const [showImport, setShowImport] = useState(false);

    const { data: allItems = [], isLoading } = useData();
    const deleteMutation = useDeleteMutation();
    const statusMutation = useStatusMutation();
    const importMutation = useImportMutation();

    useEffect(() => () => resetState(), [resetState]);

    useEffect(() => {
      queueMicrotask(() => {
        setDetailStack((stack) => {
          if (stack.length === 0) return stack;
          return stack
            .map((d) => allItems.find((x) => keyExtractor(x) === keyExtractor(d)))
            .filter((x): x is T => x != null);
        });
      });
    }, [allItems]);

    const stableFilterFn = useCallback(
      (item: T, term: string, f: TFilters) => filterFn(item, term, f, allItems),
      [allItems],
    );

    const filtered = useListWithFilter(allItems, searchTerm, filters, stableFilterFn);
    const sortedFiltered = useMemo(
      () => sortItems([...filtered], sort, allItems),
      [filtered, sort, allItems],
    );

    useEffect(() => {
      queueMicrotask(() => setPage(1));
    }, [sortedFiltered.length, setPage]);

    const maxPage = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
    useEffect(() => {
      if (page > maxPage) {
        queueMicrotask(() => setPage(maxPage));
      }
    }, [page, pageSize, maxPage, setPage]);

    const exportPagination = useMemo(
      () => ({ page: 1, pageSize: Math.max(sortedFiltered.length, 1) }),
      [sortedFiltered.length],
    );

    const stableExportMapFn = useCallback((item: T) => exportMapFn(item), []);
    const { exportData, paginatedData, selectedData } = useExportData({
      data: sortedFiltered,
      isOpen: showExport,
      mapFn: stableExportMapFn,
      pagination: exportPagination,
      selectedIds,
      keyExtractor,
    });

    const visibleColumnKeys = useMemo(
      () => exportColumns.map((c) => c.key),
      [],
    );

    const handleEdit = (item: T, origin: FormViewOrigin) => {
      setFormOrigin(origin);
      if (origin === 'list') {
        setDetailStack([]);
      } else {
        setDetailStack((s) => (s.length ? [s[0]] : []));
      }
      setEditingItem(item);
      startTransition(() => setShowForm(true));
    };

    const handleDelete = (id: string) => {
      if (detailStack.length > 1) setDetailStack((s) => (s.length ? [s[0]] : []));
      confirm({
        title: getDeleteTitle(),
        message: getDeleteMessage(),
        variant: 'danger',
        confirmText: CONFIRM_DELETE(),
        onConfirm: async () => {
          deleteMutation.mutate(id, {
            onSuccess: () => {
              setDetailStack((s) => {
                const idx = s.findIndex((d) => keyExtractor(d) === id);
                if (idx < 0) return s;
                return s.slice(0, idx);
              });
            },
          });
        },
      });
    };

    const handleStatusChange = (item: T) => {
      const { next, label } = getStatusToggle(item);
      confirm({
        title: getStatusChangeTitle(),
        message: getStatusChangeMessage(item, label),
        variant: 'warning',
        confirmText: CONFIRM_YES(),
        onConfirm: async () => {
          statusMutation.mutate(
            { id: keyExtractor(item), status: next },
            {
              onSuccess: (updated) => {
                setDetailStack((s) =>
                  s.map((d) => (keyExtractor(d) === keyExtractor(updated) ? updated : d)),
                );
              },
            },
          );
        },
      });
    };

    const handleDeleteMany = () => {
      const ids = Array.from(selectedIds);
      confirm({
        title: getDeleteTitle(),
        message: txt('common.deleteManyConfirm', { count: ids.length }),
        variant: 'danger',
        confirmText: CONFIRM_DELETE_ALL(),
        onConfirm: async () => {
          for (const id of ids) {
            await deleteMutation.mutateAsync(id).catch(() => {});
          }
          clearSelection();
          setDetailStack((s) => s.filter((d) => !ids.includes(keyExtractor(d))));
        },
      });
    };

    const handleStatusChangeMany = (status: TrangThaiHoatDong) => {
      const ids = Array.from(selectedIds);
      const statusLabel =
        status === 'Đang hoạt động' ? txt('department.active') : txt('department.inactive');
      confirm({
        title: getStatusChangeTitle(),
        message: txt('common.statusChangeManyConfirm', { count: ids.length, status: statusLabel }),
        variant: 'warning',
        confirmText: CONFIRM_YES(),
        onConfirm: async () => {
          for (const id of ids) {
            await statusMutation.mutateAsync({ id, status }).catch(() => {});
          }
          clearSelection();
        },
      });
    };

    const resolvedLookupSheets = useMemo((): ImportLookupSheet[] => {
      if (!importLookupSheets) return [];
      if (typeof importLookupSheets === 'function') {
        return importLookupSheets({ primary: allItems });
      }
      return importLookupSheets;
    }, [allItems]);

    const handleImportData = async (
      rows: ImportBatchRow[],
      ctx?: { onProgress?: (done: number, total: number) => void },
    ): Promise<ImportResult> => {
      const mapped = mapImportRows(rows.map((r) => r.data));
      const batchRows: ImportBatchRow[] = rows.map((row, index) => ({
        rowNumber: row.rowNumber,
        data: mapped[index] as unknown as Record<string, unknown>,
      }));
      return importMutation.mutateAsync({ rows: batchRows, onProgress: ctx?.onProgress });
    };

    const handleCloseForm = () => {
      const wasEditing = editingItem;
      const origin = formOrigin;
      setShowForm(false);
      setAddChildOf(null);

      if (origin === 'list') {
        setDetailStack([]);
      } else if (origin === 'detail' && detailStack[0]) {
        if (wasEditing) {
          const fresh = syncDetailOnFormClose(
            wasEditing,
            origin,
            detailStack[0],
            allItems,
          );
          setDetailStack((s) => {
            if (s.length === 0) return s;
            if (fresh === undefined) return [];
            if (fresh === null) return s;
            return [fresh, ...s.slice(1)];
          });
        }
      }

      setEditingItem(null);
      setFormOrigin('list');
    };

    const handleAddChild = (parent: T) => {
      setDetailStack((s) => (s.length ? [s[0]] : []));
      setAddChildOf(parent);
      setEditingItem(null);
      setFormOrigin('detail');
      startTransition(() => setShowForm(true));
    };

    const handleExport = () => {
      if (sortedFiltered.length === 0) {
        toast.warning(noExportDataMessage);
        return;
      }
      setShowExport(true);
    };

    return (
      <div className="flex flex-col h-page relative">
        <div className="flex-1 min-h-0 flex flex-col mt-1.5 rounded-xl border border-border bg-card shadow-sm overflow-hidden relative z-0">
          <ToolbarComponent
            departments={allItems}
            selectedCount={selectedIds.size}
            onAdd={() => {
              setFormOrigin('list');
              startTransition(() => setShowForm(true));
            }}
            onExport={handleExport}
            onImport={() => setShowImport(true)}
            onDeleteMany={handleDeleteMany}
            onStatusChangeMany={handleStatusChangeMany}
          />
          <div className="flex-1 min-h-0 flex flex-col">
            <ListComponent
              data={sortedFiltered}
              allDepartments={allItems}
              columns={columns}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
              onToggleAllSelection={toggleAllSelection}
              isLoading={isLoading}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              onEdit={(item) => handleEdit(item, 'list')}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onView={(d) => startTransition(() => setDetailStack([d]))}
            />
          </div>
        </div>

        <AnimatePresence>
          {showForm && (
            <Suspense fallback={<DrawerLazyFallback />}>
              <FormComponent
                initialData={editingItem}
                allDepartments={allItems}
                onClose={handleCloseForm}
                defaultParentId={addChildOf ? keyExtractor(addChildOf) : undefined}
              />
            </Suspense>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {detailStack.length > 0 && !showForm ? (
            <Suspense fallback={<DrawerLazyFallback />}>
              <>
                {detailStack.map((item, index) => (
                  <DetailComponent
                    key={`${keyExtractor(item)}-${index}`}
                    data={item}
                    allDepartments={allItems}
                    onClose={() => setDetailStack((s) => s.slice(0, index))}
                    onEdit={(item) => handleEdit(item, 'detail')}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                    onAddChild={handleAddChild}
                    onViewChild={(child) => {
                      setDetailStack((s) => {
                        const last = s[s.length - 1];
                        if (!last || !canViewChild(last, child)) return s;
                        return [...s, child];
                      });
                    }}
                    maxWidthClass={index > 0 ? DRAWER_WIDTH_DETAIL_SMALL : undefined}
                    stackLevel={index}
                  />
                ))}
              </>
            </Suspense>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {showExport && (
            <ExportDialog
              open={showExport}
              onClose={() => setShowExport(false)}
              columns={exportColumns}
              data={exportData}
              paginatedData={paginatedData}
              selectedData={selectedData}
              fileName={exportFileName}
              visibleColumnKeys={visibleColumnKeys}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showImport && (
            <ImportDialog
              open={showImport}
              onClose={() => setShowImport(false)}
              columns={importColumns}
              onImport={handleImportData}
              templateFileName={importTemplateName}
              lookupSheets={resolvedLookupSheets}
            />
          )}
        </AnimatePresence>
      </div>
    );
  };

  return HierarchyPage;
}
