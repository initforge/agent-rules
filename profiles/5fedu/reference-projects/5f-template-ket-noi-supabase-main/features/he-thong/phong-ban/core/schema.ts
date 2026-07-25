import { z } from "zod";
import { txt } from '@/lib/text';
import { TRANG_THAI_HOAT_DONG } from '@/lib/constants/trang-thai';
import { codeFieldSchema } from '@/lib/validation/code-field';
import type { Department } from './types';
import {
  getDepartmentParentValidationMessage,
  validateDepartmentParentChange,
} from '../utils/department-hierarchy';

export const departmentSchema = z.object({
  ma_phong_ban: codeFieldSchema(),
  ten_phong_ban: z.string()
    .min(3, txt('department.validation.nameMin'))
    .max(255, txt('department.validation.nameMax')),
  mo_ta: z.string().optional(),
  cha_id: z.string().optional().nullable(),
  trang_thai: z.enum(TRANG_THAI_HOAT_DONG, {
    message: txt('department.validation.statusInvalid'),
  }),
  thu_tu: z.coerce.number().min(0, txt('department.validation.sortOrderMin')),
});

export type DepartmentFormValues = z.infer<typeof departmentSchema>;

export interface DepartmentSchemaContext {
  allDepartments: Department[];
  editingId?: string | null;
}

export function createDepartmentSchema(ctx: DepartmentSchemaContext): z.ZodType<DepartmentFormValues> {
  return departmentSchema.superRefine((data, refineCtx) => {
    const dept = ctx.editingId
      ? ctx.allDepartments.find((d) => d.id === ctx.editingId) ?? null
      : null;
    const error = validateDepartmentParentChange(dept, data.cha_id, ctx.allDepartments);
    if (error) {
      refineCtx.addIssue({
        code: 'custom',
        message: getDepartmentParentValidationMessage(error),
        path: ['cha_id'],
      });
    }
  });
}
