import { createGenericStore, ColumnConfig } from '@/store/createGenericStore';
import { TABLE_COLUMN_PRESETS } from '@/lib/table-column-presets';
import type { PositionFilters } from '../core/types';
import { txt } from '@/lib/text';

const P = TABLE_COLUMN_PRESETS;

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'thu_tu', label: txt('position.store.orderCol'), visible: true, minWidth: 72, maxWidth: 96, order: 0 },
  { id: 'ma_chuc_vu', label: txt('position.store.codeCol'), visible: true, ...P.code, order: 1 },
  { id: 'ten_chuc_vu', label: txt('position.store.nameCol'), visible: true, ...P.titleShort, order: 2 },
  { id: 'cap_bac', label: txt('position.store.levelCol'), visible: true, minWidth: 72, maxWidth: 96, order: 3 },
  { id: 'mo_ta', label: txt('position.store.descCol'), visible: true, minWidth: 160, maxWidth: 400, order: 4 },
  { id: 'trang_thai', label: txt('position.store.statusCol'), visible: true, ...P.enumBadge, order: 5 },
  { id: 'tg_cap_nhat', label: txt('position.store.updatedCol'), visible: true, ...P.datetime, order: 6 },
];

const initialFilters: PositionFilters = {
  status: [],
  id_phong_goc: [],
  phong_ban_id: [],
  cap_bac: [],
  columnSearch: {},
};

export const usePositionStore = createGenericStore<PositionFilters>(
  initialFilters,
  DEFAULT_COLUMNS
);
