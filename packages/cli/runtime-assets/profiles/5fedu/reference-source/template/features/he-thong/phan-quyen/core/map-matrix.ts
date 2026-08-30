import {
  actionsToQuyenList,
  formatQuyenCsv,
  mapModuleKeyToApp,
  mapModuleKeyToDb,
  parseQuyenCsv,
  quyenListToActions,
} from '@/lib/permission-db-keys';
import { coerceEntityId } from '@/lib/supabase/map-entity-row';
import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import type {
  ActionType,
  ModulePermission,
  PhanQuyenRow,
  PositionPermission,
  VarPhanQuyenRow,
} from './types';

export function normalizeVarPhanQuyenRow(
  row: VarPhanQuyenRow & { id: string | number; chuc_vu_id: string | number },
): VarPhanQuyenRow {
  return {
    ...row,
    id: String(row.id),
    chuc_vu_id: coerceEntityId(row.chuc_vu_id),
  };
}

export function aggregateVarRowsToPhanQuyenRows(rows: VarPhanQuyenRow[]): PhanQuyenRow[] {
  const grouped = new Map<
    string,
    {
      id: string;
      vai_tro: string;
      module_key: string;
      quyens: string[];
      tg_cap_nhat: string;
    }
  >();

  for (const row of rows) {
    const appModuleKey = mapModuleKeyToApp(row.module_key);
    const vaiTro = String(row.chuc_vu_id);
    const groupKey = `${vaiTro}::${appModuleKey}`;
    const existing = grouped.get(groupKey);

    const rowQuyens = parseQuyenCsv(row.quyen);

    if (existing) {
      existing.quyens.push(...rowQuyens);
      if (row.tg_cap_nhat > existing.tg_cap_nhat) {
        existing.tg_cap_nhat = row.tg_cap_nhat;
      }
    } else {
      grouped.set(groupKey, {
        id: groupKey,
        vai_tro: vaiTro,
        module_key: appModuleKey,
        quyens: [...rowQuyens],
        tg_cap_nhat: row.tg_cap_nhat,
      });
    }
  }

  return [...grouped.values()].map((group) => ({
    id: group.id,
    vai_tro: group.vai_tro,
    module_key: group.module_key,
    phan_quyen: quyenListToActions(group.quyens),
    tg_cap_nhat: group.tg_cap_nhat,
  }));
}

export function splitMatrixToVarRows(
  chucVuId: string,
  moduleKeyApp: string,
  actions: ActionType[],
  now: string,
): Omit<VarPhanQuyenRow, 'id'>[] {
  const dbModuleKey = mapModuleKeyToDb(moduleKeyApp);
  const quyens = actionsToQuyenList(actions);

  if (quyens.length === 0) return [];

  return [
    {
      module_key: dbModuleKey,
      chuc_vu_id: coerceEntityId(chucVuId),
      quyen: formatQuyenCsv(quyens),
      tg_tao: now,
      tg_cap_nhat: now,
    },
  ];
}

export function normalizePhanQuyenRow(row: PhanQuyenRow & { id: string | number }): PhanQuyenRow {
  return {
    ...row,
    id: String(row.id),
    phan_quyen: Array.isArray(row.phan_quyen) ? row.phan_quyen : [],
  };
}

export function rowsToQuyenHan(
  rows: PhanQuyenRow[],
  getModuleName: (moduleKey: string) => string,
): ModulePermission[] {
  return rows.map((r) => ({
    module_id: r.module_key,
    module_name: getModuleName(r.module_key),
    actions: [...r.phan_quyen],
  }));
}

export function positionToMatrixRow(
  position: Position,
  rows: PhanQuyenRow[],
  getModuleName: (moduleKey: string) => string,
  deptOrder?: number,
): PositionPermission {
  const forPosition = rows.filter((r) => r.vai_tro === position.id);
  const latestRowTs = forPosition.reduce(
    (max, r) => (r.tg_cap_nhat > max ? r.tg_cap_nhat : max),
    '',
  );
  return {
    id: position.id,
    id_chuc_vu: position.id,
    ma_chuc_vu: position.ma_chuc_vu,
    ten_chuc_vu: position.ten_chuc_vu,
    ten_phong_ban: position.ten_phong_ban ?? '',
    phong_ban_id: position.phong_ban_id ?? null,
    thu_tu_phong_ban: deptOrder,
    thu_tu_chuc_vu: position.thu_tu,
    mo_ta: position.mo_ta,
    so_nhan_vien: 0,
    quyen_han: rowsToQuyenHan(forPosition, getModuleName),
    trang_thai: position.trang_thai,
    tg_cap_nhat: latestRowTs || position.tg_cap_nhat,
  };
}

export function phanQuyenRowsToGrants(rows: PhanQuyenRow[]): Record<string, ActionType[]> {
  const out: Record<string, ActionType[]> = {};
  for (const r of rows) {
    if (r.phan_quyen.length > 0) {
      out[r.module_key] = [...r.phan_quyen];
    }
  }
  return out;
}
