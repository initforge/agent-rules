import { z } from 'zod';
import { txt } from '@/lib/text';

/** Mã chuẩn: chữ in hoa, số, gạch dưới — 2–50 ký tự */
export const CODE_FIELD_REGEX = /^[A-Z0-9_]+$/;

export function codeFieldSchema() {
  return z
    .string()
    .min(2, txt('department.validation.codeMin'))
    .max(50, txt('department.validation.codeMax'))
    .regex(CODE_FIELD_REGEX, txt('department.validation.codeFormat'));
}
