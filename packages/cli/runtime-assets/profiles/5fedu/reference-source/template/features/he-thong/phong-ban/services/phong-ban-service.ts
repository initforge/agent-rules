import { Department } from '../core/types';
import { DepartmentFormValues } from '../core/schema';
import { MOCK_DEPARTMENTS } from '@/mocks/he-thong';
import { createRepository } from '@/lib/data/create-repository';
import { isSupabase } from '@/lib/data/config';
import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';
import {
  DEPARTMENT_RETURNING_FULL,
  DEPARTMENT_RETURNING_STATUS_ONLY,
  DEPARTMENT_SELECT_FULL,
} from '../core/supabase-select';
import { txt } from '@/lib/text';
import { DEPARTMENTS_LIST_QUERY_PARAMS } from '@/lib/query-keys';
import { runImportBatch, type ImportBatchRow, type ImportResult } from '@/lib/import';
import {
  getDepartmentParentValidationMessage,
  normalizeParentId,
  validateDepartmentParentChange,
} from '../utils/department-hierarchy';
import { DEPARTMENT_MAX_LEVEL, DEPARTMENT_ROOT_LEVEL } from '../core/constants';
import { getSupabase } from '@/lib/supabase/client';
import { handleSupabaseError } from '@/lib/supabase/errors';
import { mapDepartmentFromDb } from '../core/map-from-db';
import { getCurrentEmployeeId } from '@/lib/current-session-employee';

const repo = createRepository<Department>({
  tableName: 'var_phong_ban',
  mockData: MOCK_DEPARTMENTS,
  select: DEPARTMENT_SELECT_FULL,
  delay: 600,
  mapFromDb: mapDepartmentFromDb,
});

async function departmentHasChildren(deptId: string): Promise<boolean> {
  if (isSupabase()) {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { count, error } = await supabase
      .from('var_phong_ban')
      .select('id', { count: 'exact', head: true })
      .eq('cha_id', deptId);
    if (error) handleSupabaseError(error);
    return (count ?? 0) > 0;
  }
  const list = await repo.getAll({ orderBy: 'duong_dan', ascending: true });
  return list.some((d) => d.cha_id === deptId);
}

async function buildPathAndLevel(
  id: string,
  chaId: string | null,
): Promise<{ duong_dan: string; cap_do: number }> {
  if (!chaId) {
    return { duong_dan: `/${id}`, cap_do: 1 };
  }
  const parent = await repo.getById(chaId);
  if (!parent) {
    return { duong_dan: `/${id}`, cap_do: 1 };
  }
  return {
    duong_dan: `${parent.duong_dan}/${id}`,
    cap_do: parent.cap_do + 1,
  };
}

async function assertValidDepartmentParent(
  dept: Department | null,
  chaId: string | null | undefined,
): Promise<void> {
  const parentId = normalizeParentId(chaId);

  if (dept && parentId !== null && (await departmentHasChildren(dept.id))) {
    throw new Error(getDepartmentParentValidationMessage('cannotMoveParentWithChildren'));
  }

  if (parentId === null) {
    return;
  }

  const parent = await repo.getById(parentId);
  if (!parent || parent.cap_do !== DEPARTMENT_ROOT_LEVEL) {
    throw new Error(getDepartmentParentValidationMessage('parentMustBeRoot'));
  }

  if (parent.cap_do + 1 > DEPARTMENT_MAX_LEVEL) {
    throw new Error(getDepartmentParentValidationMessage('maxDepthExceeded'));
  }
}

/** Mock path: giữ validateDepartmentParentChange với full list (dev only). */
async function assertValidDepartmentParentMock(
  dept: Department | null,
  chaId: string | null | undefined,
): Promise<void> {
  const all = await repo.getAll();
  const error = validateDepartmentParentChange(dept, chaId, all);
  if (error) {
    throw new Error(getDepartmentParentValidationMessage(error));
  }
}

export type GetDepartmentsParams = {
  limit?: number;
  offset?: number;
  orderBy?: string;
  ascending?: boolean;
};

export type DepartmentsListResult = {
  items: Department[];
  total: number;
};

export const getDepartmentCount = async (): Promise<number> => repo.count();

export const getDepartmentsPage = async (
  params: GetDepartmentsParams = {},
): Promise<DepartmentsListResult> => {
  const limit = params.limit ?? DEPARTMENTS_LIST_QUERY_PARAMS.limit;
  const offset = params.offset ?? DEPARTMENTS_LIST_QUERY_PARAMS.offset;
  const orderBy = params.orderBy ?? DEPARTMENTS_LIST_QUERY_PARAMS.orderBy;
  const ascending = params.ascending ?? DEPARTMENTS_LIST_QUERY_PARAMS.ascending;
  const { items } = await repo.getPage({
    limit,
    offset,
    orderBy,
    ascending,
    select: DEPARTMENT_SELECT_FULL,
    includeTotal: false,
  });
  return { items, total: 0 };
};

export const getDepartments = async (params: GetDepartmentsParams = {}): Promise<Department[]> => {
  const { items } = await getDepartmentsPage(params);
  return items;
};

async function resolveCapDoForInsert(chaId: string | null): Promise<number> {
  if (!chaId) return DEPARTMENT_ROOT_LEVEL;
  const parent = await repo.getById(chaId);
  return parent ? parent.cap_do + 1 : DEPARTMENT_ROOT_LEVEL;
}

export const createDepartment = async (data: DepartmentFormValues): Promise<Department> => {
  const chaId = data.cha_id === '' || data.cha_id == null ? null : data.cha_id;
  if (isSupabase()) {
    await assertValidDepartmentParent(null, chaId);
  } else {
    await assertValidDepartmentParentMock(null, chaId);
  }

  const now = new Date().toISOString();
  const thuTu = data.thu_tu ?? 1;

  if (isSupabase()) {
    const capDo = await resolveCapDoForInsert(chaId);
    const creatorId = getCurrentEmployeeId();
    const inserted = await repo.insert(
      {
        ma_phong_ban: data.ma_phong_ban,
        ten_phong_ban: data.ten_phong_ban,
        mo_ta: data.mo_ta,
        cha_id: chaId,
        trang_thai: data.trang_thai,
        thu_tu: thuTu,
        duong_dan: '',
        cap_do: capDo,
        nguoi_tao: creatorId,
        tg_tao: now,
        tg_cap_nhat: now,
      } as Omit<Department, 'id'>,
      { returningSelect: DEPARTMENT_RETURNING_FULL },
    );
    const { duong_dan, cap_do } = await buildPathAndLevel(inserted.id, chaId);
    if (duong_dan !== inserted.duong_dan || cap_do !== inserted.cap_do) {
      return repo.update(
        inserted.id,
        { duong_dan, cap_do, tg_cap_nhat: now },
        { returningSelect: DEPARTMENT_RETURNING_FULL },
      );
    }
    return inserted;
  }

  const id = `dep-${Date.now()}`;
  const { duong_dan, cap_do } = await buildPathAndLevel(id, chaId);
  const creatorId = getCurrentEmployeeId();
  return repo.insert(
    {
      id,
      ma_phong_ban: data.ma_phong_ban,
      ten_phong_ban: data.ten_phong_ban,
      mo_ta: data.mo_ta,
      cha_id: chaId,
      trang_thai: data.trang_thai,
      thu_tu: thuTu,
      duong_dan,
      cap_do,
      nguoi_tao: creatorId,
      tg_tao: now,
      tg_cap_nhat: now,
    } as Omit<Department, 'id'> & { id: string },
    { returningSelect: DEPARTMENT_RETURNING_FULL },
  );
};

export const updateDepartment = async (id: string, data: DepartmentFormValues): Promise<Department> => {
  const existing = await repo.getById(id);
  if (!existing) throw new Error(txt('department.service.notFound'));

  const chaId = data.cha_id === '' || data.cha_id == null ? null : data.cha_id;
  if (isSupabase()) {
    await assertValidDepartmentParent(existing, chaId);
  } else {
    await assertValidDepartmentParentMock(existing, chaId);
  }

  let { duong_dan, cap_do } = await buildPathAndLevel(id, chaId);
  if (chaId === existing.cha_id) {
    duong_dan = existing.duong_dan;
    cap_do = existing.cap_do;
  }

  return repo.update(
    id,
    {
      ...data,
      cha_id: chaId,
      trang_thai: data.trang_thai,
      duong_dan,
      cap_do,
      tg_cap_nhat: new Date().toISOString(),
    },
    { returningSelect: DEPARTMENT_RETURNING_FULL },
  );
};

export const updateDepartmentStatus = async (id: string, status: TrangThaiHoatDong): Promise<Department> => {
  const existing = await repo.getById(id);
  if (!existing) throw new Error(txt('department.service.notFound'));
  return repo.update(
    id,
    { trang_thai: status, tg_cap_nhat: new Date().toISOString() },
    { returningSelect: DEPARTMENT_RETURNING_STATUS_ONLY },
  );
};

export const deleteDepartment = async (id: string): Promise<void> => {
  if (await departmentHasChildren(id)) {
    throw new Error(txt('department.service.hasChildren'));
  }
  await repo.remove([id]);
};

/** Import nhiều phòng ban (chỉ thêm mới, cha_id = null hoặc id có sẵn) */
export const importDepartments = async (
  rows: ImportBatchRow[],
  options?: { onProgress?: (done: number, total: number) => void },
): Promise<ImportResult> => {
  return runImportBatch(
    rows,
    async (raw) => {
      const data = raw as DepartmentFormValues;
      const idCha = data.cha_id === '' || data.cha_id == null ? null : data.cha_id;
      if (idCha) {
        const parent = await repo.getById(idCha);
        if (!parent) {
          throw new Error('Phòng cha không tồn tại');
        }
      }
      await createDepartment({ ...data, cha_id: idCha ?? undefined });
    },
    options,
  );
};
