import { Employee, type Gender } from '../core/types';
import {
  createEmployeeCreateSchema,
  createEmployeeSchema,
  type EmployeeCreateFormValues,
  type EmployeeFormValues,
} from '../core/schema';
import { TRANG_THAI_NHAN_VIEN, type TrangThaiNhanVien } from '../core/constants';
import {
  EMPLOYEE_RETURNING_FULL,
  EMPLOYEE_RETURNING_STATUS_ONLY,
  EMPLOYEE_SELECT_FULL,
  EMPLOYEE_SELECT_STATS,
  EMPLOYEE_SELECT_TABLE,
} from '../core/supabase-select';
import { MOCK_EMPLOYEES } from '@/mocks/he-thong';
import { authEmailToLoginName } from '@/lib/auth-email';
import { createRepository } from '@/lib/data/create-repository';
import { isSupabase } from '@/lib/data/config';
import {
  provisionEmployeeAuthAccount,
  resetEmployeeAuthPassword,
  changeEmployeeLoginName,
  setEmployeeAuthActive,
  syncEmployeeAuthMetadata,
} from '@/lib/employee-auth/employee-auth-service';
import { shouldDisableAuthForStatus } from '@/lib/employee-auth/constants';
import { runImportBatch, type ImportBatchRow, type ImportResult } from '@/lib/import';
import { EMPLOYEES_LIST_QUERY_PARAMS } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase/client';
import { txt } from '@/lib/text';
import { assertAllBatchSucceeded, runInBatchesSettled } from '@/lib/async-utils';
import { getAvatarUrl } from '@/lib/utils';
import { normalizeLoginName } from '@/lib/validation/login-name';
import { getDepartments } from '@/features/he-thong/phong-ban/services/phong-ban-service';
import {
  getActivePositions,
  getPositions,
} from '@/features/he-thong/chuc-vu/services/chuc-vu-service';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import { resolveEmployeeOrgUnits } from '../utils/resolve-employee-org-units';
import { findPositionById } from '../utils/build-employee-position-options';
import { mapEmployeeFromDb } from '../core/map-from-db';
import { getCurrentEmployeeId } from '@/lib/current-session-employee';

const now = () => new Date().toISOString();

type LegacyMockEmployee = Employee & {
  ma_nhan_vien?: string;
  ngay_vao_lam?: string;
};

function toEmployee(row: LegacyMockEmployee): Employee {
  const {
    ma_nhan_vien: _ma,
    ngay_vao_lam,
    ...rest
  } = row;
  void _ma;
  return {
    ...rest,
    tg_tao: row.tg_tao ?? (ngay_vao_lam ? new Date(ngay_vao_lam).toISOString() : '2024-01-01T00:00:00.000Z'),
    tg_cap_nhat: row.tg_cap_nhat ?? '2025-01-15T08:30:00.000Z',
  };
}

const mockSeed: Employee[] = MOCK_EMPLOYEES.map((emp) => toEmployee(emp as LegacyMockEmployee));

const repo = createRepository<Employee>({
  tableName: 'var_nhan_vien',
  mockData: mockSeed,
  select: EMPLOYEE_SELECT_TABLE,
  delay: 600,
  mapFromDb: mapEmployeeFromDb,
});

export type GetEmployeesParams = {
  limit?: number;
  offset?: number;
  orderBy?: string;
  ascending?: boolean;
};

function applyEmployeeOrgUnits(emp: Employee, departments: Department[]): Employee {
  const org = resolveEmployeeOrgUnits(emp.phong_ban_id, departments);
  return {
    ...emp,
    ten_phong_ban: org.ten_phong_ban ?? emp.ten_phong_ban,
    ten_bo_phan: org.ten_bo_phan ?? null,
  };
}

function enrichEmployeeRow(
  raw: Employee,
  departments: Department[],
  positions: Position[],
): Employee {
  let emp = applyEmployeeOrgUnits(raw, departments);
  if (!isSupabase()) {
    const position = positions.find((p) => String(p.id) === String(emp.chuc_vu_id));
    emp = {
      ...emp,
      ten_chuc_vu: position?.ten_chuc_vu ?? emp.ten_chuc_vu,
      cap_bac: position?.cap_bac ?? emp.cap_bac ?? null,
    };
  }
  return emp;
}

async function enrichEmployee(raw: Employee): Promise<Employee> {
  const [departments, positions] = await Promise.all([
    getDepartments(),
    isSupabase() ? Promise.resolve([] as Position[]) : getPositions(),
  ]);
  return enrichEmployeeRow(raw, departments, positions);
}

async function mapEmployeeRows(list: Employee[]): Promise<Employee[]> {
  const [departments, positions] = await Promise.all([
    getDepartments(),
    isSupabase() ? Promise.resolve([] as Position[]) : getPositions(),
  ]);
  return list.map((raw) => enrichEmployeeRow(raw, departments, positions));
}

export const getEmployeeCount = async (): Promise<number> => repo.count();

export type EmployeesListResult = {
  items: Employee[];
  total: number;
};

export const getEmployeesPage = async (params: GetEmployeesParams = {}): Promise<EmployeesListResult> => {
  const limit = params.limit ?? EMPLOYEES_LIST_QUERY_PARAMS.limit;
  const offset = params.offset ?? EMPLOYEES_LIST_QUERY_PARAMS.offset;
  const orderBy = params.orderBy ?? EMPLOYEES_LIST_QUERY_PARAMS.orderBy;
  const ascending = params.ascending ?? EMPLOYEES_LIST_QUERY_PARAMS.ascending;
  const { items } = await repo.getPage({
    limit,
    offset,
    orderBy,
    ascending,
    select: EMPLOYEE_SELECT_TABLE,
    includeTotal: false,
  });
  return { items: await mapEmployeeRows(items), total: 0 };
};

export const getEmployees = async (params: GetEmployeesParams = {}): Promise<Employee[]> => {
  const { items } = await getEmployeesPage({
    ...params,
    limit: params.limit ?? EMPLOYEES_LIST_QUERY_PARAMS.limit,
    offset: params.offset ?? EMPLOYEES_LIST_QUERY_PARAMS.offset,
  });
  return items;
};

async function mapEmployeeStatsRows(list: Employee[]): Promise<Employee[]> {
  const departments = await getDepartments();
  return list.map((raw) => applyEmployeeOrgUnits(raw, departments));
}

/** Tab thống kê — select gọn, không tải avatar/auth/chức vụ. */
export const getEmployeesForStats = async (
  params: GetEmployeesParams = {},
): Promise<Employee[]> => {
  const limit = params.limit ?? EMPLOYEES_LIST_QUERY_PARAMS.limit;
  const offset = params.offset ?? EMPLOYEES_LIST_QUERY_PARAMS.offset;
  const orderBy = params.orderBy ?? EMPLOYEES_LIST_QUERY_PARAMS.orderBy;
  const ascending = params.ascending ?? EMPLOYEES_LIST_QUERY_PARAMS.ascending;
  const { items } = await repo.getPage({
    limit,
    offset,
    orderBy,
    ascending,
    select: EMPLOYEE_SELECT_STATS,
    includeTotal: false,
  });
  return mapEmployeeStatsRows(items);
};

export const getEmployeeById = async (id: string): Promise<Employee | undefined> => {
  const row = await repo.getById(id, { select: EMPLOYEE_SELECT_FULL });
  if (!row) return undefined;
  return enrichEmployee(row);
};

export const getEmployeeByAuthEmail = async (email: string): Promise<Employee | undefined> => {
  const loginName = authEmailToLoginName(email);
  if (!loginName) return undefined;
  return getEmployeeByLoginName(loginName);
};

export const getEmployeeByLoginName = async (
  loginName: string,
  options?: { excludeEmployeeId?: string },
): Promise<Employee | undefined> => {
  const normalized = normalizeLoginName(loginName);
  if (!normalized) return undefined;

  let employee: Employee | undefined;

  if (isSupabase()) {
    const supabase = getSupabase();
    if (!supabase) return undefined;
    const { data, error } = await supabase
      .from('var_nhan_vien')
      .select('id')
      .ilike('ten_dang_nhap', normalized)
      .maybeSingle();
    if (error || !data?.id) return undefined;
    employee = await getEmployeeById(String(data.id));
  } else {
    const all = await repo.getAll({ select: EMPLOYEE_SELECT_TABLE });
    const rows = await mapEmployeeRows(all);
    employee = rows.find((e) => e.ten_dang_nhap?.toLowerCase() === normalized);
  }

  if (!employee) return undefined;
  if (
    options?.excludeEmployeeId &&
    String(employee.id) === String(options.excludeEmployeeId)
  ) {
    return undefined;
  }
  return employee;
};

export async function assertLoginNameAvailable(
  loginName: string,
  excludeEmployeeId?: string,
): Promise<void> {
  const normalized = normalizeLoginName(loginName);
  if (!normalized) return;
  const existing = await getEmployeeByLoginName(normalized, { excludeEmployeeId });
  if (existing) {
    throw new Error(txt('employee.validation.loginNameDuplicate'));
  }
}

export async function isLoginNameTakenByOtherEmployee(
  loginName: string,
  excludeEmployeeId?: string,
): Promise<boolean> {
  const existing = await getEmployeeByLoginName(loginName, { excludeEmployeeId });
  return Boolean(existing);
}

function stripAuthFieldsFromPayload(
  data: EmployeeFormValues & Partial<{ ten_dang_nhap: string; mat_khau_tam: string }>,
): EmployeeFormValues & { ten_dang_nhap?: string } {
  const { mat_khau_tam: _pw, ten_dang_nhap, ...rest } = data as EmployeeCreateFormValues;
  void _pw;
  return {
    ...rest,
    ...(ten_dang_nhap ? { ten_dang_nhap: normalizeLoginName(ten_dang_nhap) } : {}),
  };
}

export const createEmployee = async (
  data: EmployeeFormValues & Partial<{ ten_dang_nhap: string; mat_khau_tam: string }>,
): Promise<Employee> => {
  const authLoginName = data.ten_dang_nhap ? normalizeLoginName(data.ten_dang_nhap) : '';
  const tempPassword = data.mat_khau_tam;
  const payload = stripAuthFieldsFromPayload(data);

  const timestamp = now();
  const creatorId = getCurrentEmployeeId();
  const baseRow = {
    ho_ten: payload.ho_ten,
    email: payload.email,
    ten_dang_nhap: authLoginName || null,
    so_dien_thoai: payload.so_dien_thoai,
    phong_ban_id: payload.phong_ban_id ?? null,
    chuc_vu_id: payload.chuc_vu_id ?? null,
    gioi_tinh: payload.gioi_tinh,
    trang_thai: payload.trang_thai,
    anh_dai_dien: payload.anh_dai_dien || getAvatarUrl(payload.ho_ten ?? ''),
    tai_khoan_dang_hoat_dong: true,
    must_change_password: false,
    nguoi_tao: creatorId,
    tg_tao: timestamp,
    tg_cap_nhat: timestamp,
  };

  const inserted = isSupabase()
    ? await repo.insert(baseRow as Omit<Employee, 'id'>, { returningSelect: EMPLOYEE_RETURNING_FULL })
    : await repo.insert(
        { ...baseRow, id: `EMP-${Date.now()}` } as Omit<Employee, 'id'> & { id: string },
        { returningSelect: EMPLOYEE_RETURNING_FULL },
      );
  let employee = await enrichEmployee(inserted);

  if (authLoginName && tempPassword) {
    await assertLoginNameAvailable(authLoginName);
    const authResult = await provisionEmployeeAuthAccount(employee, authLoginName, tempPassword);
    const patch = {
      must_change_password: authResult.must_change_password ?? true,
      tai_khoan_dang_hoat_dong: authResult.tai_khoan_dang_hoat_dong ?? true,
      ten_dang_nhap: authLoginName,
      tg_cap_nhat: now(),
    };
    if (isSupabase()) {
      const updated = await repo.update(employee.id, patch, {
        returningSelect: EMPLOYEE_RETURNING_FULL,
      });
      employee = await enrichEmployee(updated);
    } else {
      await repo.update(employee.id, patch, { returningSelect: 'id' });
      employee = await enrichEmployee({ ...employee, ...patch });
    }
  }

  return employee;
};

export const updateEmployee = async (
  id: string,
  data: EmployeeFormValues & Partial<{ ten_dang_nhap: string; mat_khau_tam: string }>,
): Promise<Employee> => {
  const existing = await repo.getById(id, { select: EMPLOYEE_SELECT_FULL });
  if (!existing) throw new Error(txt('employee.service.notFound'));
  const before = await enrichEmployee(existing);

  const authLoginName = data.ten_dang_nhap ? normalizeLoginName(data.ten_dang_nhap) : '';
  const tempPassword = data.mat_khau_tam?.trim() ?? '';
  const oldLogin = before.ten_dang_nhap ? normalizeLoginName(before.ten_dang_nhap) : '';
  const loginChanged = Boolean(oldLogin && authLoginName && authLoginName !== oldLogin);
  const addingAuth = Boolean(!oldLogin && authLoginName && tempPassword);

  const payload = stripAuthFieldsFromPayload(data);
  const updatePatch: Partial<Employee> & Record<string, unknown> = {
    ...payload,
    phong_ban_id: payload.phong_ban_id ?? null,
    chuc_vu_id: payload.chuc_vu_id ?? null,
    trang_thai: payload.trang_thai,
    tg_cap_nhat: now(),
  };

  if ((loginChanged || addingAuth) && isSupabase()) {
    delete updatePatch.ten_dang_nhap;
  } else if (authLoginName && !loginChanged) {
    updatePatch.ten_dang_nhap = authLoginName;
  }

  const updated = await repo.update(
    id,
    updatePatch,
    { returningSelect: EMPLOYEE_RETURNING_FULL },
  );
  let employee = await enrichEmployee(updated);

  if (loginChanged && tempPassword) {
    await assertLoginNameAvailable(authLoginName, id);
    await changeEmployeeLoginName(employee, authLoginName, tempPassword);
    if (!isSupabase()) {
      const authPatch = {
        ten_dang_nhap: authLoginName,
        must_change_password: true,
        tai_khoan_dang_hoat_dong: true,
        tg_cap_nhat: now(),
      };
      await repo.update(id, authPatch, {
        returningSelect: EMPLOYEE_RETURNING_FULL,
      });
      employee = await enrichEmployee({ ...employee, ...authPatch });
    } else {
      const refreshed = await getEmployeeById(id);
      if (refreshed) employee = refreshed;
    }
  }

  if (addingAuth) {
    await assertLoginNameAvailable(authLoginName, id);
    const authResult = await provisionEmployeeAuthAccount(employee, authLoginName, tempPassword);
    const authPatch = {
      must_change_password: authResult.must_change_password ?? true,
      tai_khoan_dang_hoat_dong: authResult.tai_khoan_dang_hoat_dong ?? true,
      ten_dang_nhap: authLoginName,
      tg_cap_nhat: now(),
    };
    const patched = await repo.update(id, authPatch, {
      returningSelect: EMPLOYEE_RETURNING_FULL,
    });
    employee = await enrichEmployee(patched);
  }

  if (before.ten_dang_nhap && !loginChanged) {
    const positionChanged = before.chuc_vu_id !== employee.chuc_vu_id;
    const deptChanged = before.phong_ban_id !== employee.phong_ban_id;
    const statusChanged = before.trang_thai !== employee.trang_thai;
    if (positionChanged || deptChanged || before.ho_ten !== employee.ho_ten) {
      await syncEmployeeAuthMetadata(employee);
    }
    if (statusChanged) {
      if (shouldDisableAuthForStatus(employee.trang_thai)) {
        await setEmployeeAuthActive(employee, false);
      } else if (shouldDisableAuthForStatus(before.trang_thai) && !shouldDisableAuthForStatus(employee.trang_thai)) {
        await setEmployeeAuthActive(employee, true);
      }
    }
  }

  return employee;
};

export const resetEmployeePassword = async (
  id: string,
  newPassword: string,
): Promise<void> => {
  const employee = await getEmployeeById(id);
  if (!employee) throw new Error(txt('employee.service.notFound'));
  const result = await resetEmployeeAuthPassword(employee, newPassword);
  await repo.update(
    id,
    {
      must_change_password: result.must_change_password ?? true,
      tg_cap_nhat: now(),
    },
    { returningSelect: 'id' },
  );
};

export const updateEmployeeStatus = async (
  ids: string[],
  status: TrangThaiNhanVien,
): Promise<void> => {
  const timestamp = now();
  const results = await runInBatchesSettled(ids, 5, async (id) => {
    await repo.update(
      id,
      {
        trang_thai: status,
        tg_cap_nhat: timestamp,
      },
      { returningSelect: EMPLOYEE_RETURNING_STATUS_ONLY },
    );
    const employee = await getEmployeeById(id);
    if (employee?.ten_dang_nhap) {
      if (shouldDisableAuthForStatus(status)) {
        await setEmployeeAuthActive(employee, false);
      } else {
        await setEmployeeAuthActive(employee, true);
      }
    }
  });
  assertAllBatchSucceeded(results);
};

export const bulkUpdateEmployees = async (
  ids: string[],
  fields: Record<string, unknown>,
): Promise<void> => {
  const [positions, depts] = await Promise.all([getActivePositions(), getDepartments()]);
  const timestamp = now();
  const results = await runInBatchesSettled(ids, 5, async (id) => {
    const existing = await repo.getById(id, { select: EMPLOYEE_SELECT_TABLE });
    if (!existing) {
      throw new Error(txt('employee.service.notFound'));
    }
    const updated = { ...existing, ...fields, tg_cap_nhat: timestamp };
    if (fields.chuc_vu_id) {
      const position = findPositionById(positions, fields.chuc_vu_id as string | number);
      if (!position) {
        throw new Error(txt('employee.validation.positionRequired'));
      }
      updated.ten_chuc_vu = position?.ten_chuc_vu;
      updated.cap_bac = position?.cap_bac ?? null;
    }
    if (fields.phong_ban_id) {
      updated.ten_phong_ban = depts.find((d) => d.id === fields.phong_ban_id)?.ten_phong_ban;
    }
    await repo.update(id, updated, { returningSelect: 'id' });
  });
  assertAllBatchSucceeded(results);
};

export const deleteEmployee = async (id: string): Promise<void> => {
  await repo.remove([id]);
};

export const deleteEmployees = async (ids: string[]): Promise<void> => {
  await repo.remove(ids);
};

function resolveByMaOrId<T extends { id: string; ma?: string | null }>(
  items: T[],
  raw: unknown,
  maKey: keyof T,
): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  const byId = items.find((item) => item.id === s);
  if (byId) return byId.id;
  const up = s.toUpperCase();
  const byMa = items.find((item) => {
    const ma = item[maKey];
    return typeof ma === 'string' && ma.toUpperCase() === up;
  });
  return byMa?.id ?? null;
}

function parseEmployeeGender(raw: unknown): Gender {
  if (raw == null || String(raw).trim() === '') return 'Nam';
  const s = String(raw).trim();
  if (s === 'Nam' || s === 'Nữ' || s === 'Khác') return s;
  throw new Error(txt('employee.validation.genderInvalid'));
}

function parseEmployeeStatus(raw: unknown): TrangThaiNhanVien {
  if (raw == null || String(raw).trim() === '') return 'Đang làm việc';
  const s = String(raw).trim();
  const found = TRANG_THAI_NHAN_VIEN.find((v) => v === s);
  if (!found) throw new Error(txt('employee.validation.statusInvalid'));
  return found;
}

export const importEmployees = async (
  rows: ImportBatchRow[],
  options?: { onProgress?: (done: number, total: number) => void },
): Promise<ImportResult> => {
  const [positions, depts] = await Promise.all([getActivePositions(), getDepartments()]);

  return runImportBatch(
    rows,
    async (row) => {
      const ho_ten = String(row.ho_ten ?? '').trim();
      const email = String(row.email ?? '').trim();
      if (!ho_ten || !email) {
        throw new Error(txt('employee.import.missingRequired'));
      }

      const chucVuRaw = row.chuc_vu_id ?? row.ma_chuc_vu;
      const chuc_vu_id = resolveByMaOrId(
        positions.map((p) => ({ ...p, ma: p.ma_chuc_vu })),
        chucVuRaw,
        'ma',
      );
      if (!chuc_vu_id) {
        throw new Error(txt('employee.validation.positionRequired'));
      }

      const position = findPositionById(positions, chuc_vu_id);
      const deptRaw = row.phong_ban_id ?? row.ma_phong_ban;
      const phong_ban_id =
        resolveByMaOrId(
          depts.map((d) => ({ ...d, ma: d.ma_phong_ban })),
          deptRaw,
          'ma',
        ) ??
        position?.phong_ban_id ??
        '';
      if (!phong_ban_id) {
        throw new Error(txt('employee.validation.departmentRequired'));
      }

      const ten_dang_nhap = row.ten_dang_nhap != null ? String(row.ten_dang_nhap).trim() : '';
      const mat_khau_tam = row.mat_khau_tam != null ? String(row.mat_khau_tam) : '';
      if (ten_dang_nhap && !mat_khau_tam.trim()) {
        throw new Error(txt('employee.validation.tempPasswordMin'));
      }

      const payload = {
        ho_ten,
        email,
        so_dien_thoai: String(row.so_dien_thoai ?? '').trim(),
        chuc_vu_id,
        phong_ban_id,
        gioi_tinh: parseEmployeeGender(row.gioi_tinh),
        trang_thai: parseEmployeeStatus(row.trang_thai),
        ...(ten_dang_nhap
          ? { ten_dang_nhap: normalizeLoginName(ten_dang_nhap), mat_khau_tam }
          : {}),
      };

      const schema = ten_dang_nhap
        ? createEmployeeCreateSchema(positions)
        : createEmployeeSchema(positions);
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const msg = parsed.error.flatten().formErrors[0] ?? parsed.error.message;
        throw new Error(msg);
      }

      await createEmployee(parsed.data);
    },
    options,
  );
};

export const restoreEmployees = async (employees: Employee[]): Promise<void> => {
  for (const emp of employees) {
    const {
      ten_phong_ban: _ten_phong_ban,
      ten_chuc_vu: _ten_chuc_vu,
      cap_bac: _cap_bac,
      ...row
    } = emp;
    await repo.insert(row as Omit<Employee, 'id'> & { id: string }, {
      returningSelect: EMPLOYEE_RETURNING_FULL,
    });
  }
};
