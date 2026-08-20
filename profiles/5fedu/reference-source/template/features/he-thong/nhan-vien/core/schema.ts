import { z } from 'zod';
import { txt } from '@/lib/text';
import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import {
  findPositionById,
  getPositionDepartmentId,
} from '../utils/build-employee-position-options';
import { TRANG_THAI_NHAN_VIEN } from './constants';
import { emailSchema } from '@/lib/validation/email';
import { phoneVnSchema } from '@/lib/validation/phone-vn';
import { loginNameSchema, normalizeLoginName } from '@/lib/validation/login-name';

export const employeeSchema = z.object({
  ho_ten: z.string().min(2, { message: txt('employee.validation.nameMin') }),
  email: emailSchema(),
  so_dien_thoai: phoneVnSchema(),
  chuc_vu_id: z.string().min(1, { message: txt('employee.validation.positionRequired') }),
  phong_ban_id: z.string().min(1, { message: txt('employee.validation.departmentRequired') }),
  gioi_tinh: z.enum(['Nam', 'Nữ', 'Khác']),
  trang_thai: z.enum(TRANG_THAI_NHAN_VIEN),
  anh_dai_dien: z.string().optional().nullable(),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

type PositionsSource = Position[] | (() => Position[]);

function resolvePositions(source: PositionsSource): Position[] {
  return typeof source === 'function' ? source() : source;
}

export function createEmployeeSchema(positions: PositionsSource = []) {
  return employeeSchema.superRefine((data, ctx) => {
    refineEmployeePositionFields(resolvePositions(positions), data, ctx);
  });
}

export const employeeCreateAuthFieldsSchema = z.object({
  ten_dang_nhap: loginNameSchema(),
  mat_khau_tam: z
    .string()
    .min(6, { message: txt('employee.validation.tempPasswordMin') }),
});

export function createEmployeeCreateSchema(positions: PositionsSource = []) {
  return employeeSchema
    .merge(employeeCreateAuthFieldsSchema)
    .superRefine((data, ctx) => {
      refineEmployeePositionFields(resolvePositions(positions), data, ctx);
    });
}

export type EmployeeCreateFormValues = z.infer<typeof employeeCreateAuthFieldsSchema> &
  EmployeeFormValues;

export const employeeEditAuthFieldsSchema = z.object({
  ten_dang_nhap: z.union([z.literal(''), loginNameSchema()]).optional(),
  mat_khau_tam: z.string().optional(),
});

export type EmployeeEditFormValues = z.infer<typeof employeeEditAuthFieldsSchema> &
  EmployeeFormValues;

function refineEmployeePositionFields(
  positions: Position[],
  data: EmployeeFormValues,
  ctx: z.RefinementCtx,
): void {
  if (!data.chuc_vu_id) return;
  const position = findPositionById(positions, data.chuc_vu_id);
  if (!position) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chuc_vu_id'],
      message: txt('employee.validation.positionRequired'),
    });
    return;
  }
  const positionDeptId = getPositionDepartmentId(position);
  if (!positionDeptId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chuc_vu_id'],
      message: txt('employee.validation.positionNoDepartment'),
    });
    return;
  }
  if (data.phong_ban_id && String(data.phong_ban_id) !== positionDeptId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['phong_ban_id'],
      message: txt('employee.validation.departmentMismatch'),
    });
  }
}

function refineEmployeeEditAuthFields(
  initialLogin: string | null | undefined,
  data: EmployeeEditFormValues,
  ctx: z.RefinementCtx,
): void {
  const normalizedInitial = initialLogin?.trim()
    ? normalizeLoginName(initialLogin)
    : '';
  const newLogin = data.ten_dang_nhap?.trim()
    ? normalizeLoginName(data.ten_dang_nhap)
    : '';
  const loginChanged = normalizedInitial
    ? newLogin !== normalizedInitial
    : Boolean(newLogin);
  const needsPassword = loginChanged || (!normalizedInitial && Boolean(newLogin));

  if (needsPassword && (!data.mat_khau_tam || data.mat_khau_tam.length < 6)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mat_khau_tam'],
      message: txt('employee.validation.tempPasswordMin'),
    });
  }
}

export function createEmployeeEditSchema(
  positions: PositionsSource = [],
  initialLogin?: string | null,
) {
  return employeeSchema
    .merge(employeeEditAuthFieldsSchema)
    .superRefine((data, ctx) => {
      refineEmployeePositionFields(resolvePositions(positions), data, ctx);
      refineEmployeeEditAuthFields(initialLogin, data, ctx);
    });
}
