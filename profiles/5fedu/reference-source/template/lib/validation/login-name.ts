import { z } from 'zod';
import { txt } from '@/lib/text';

/** Local part for Supabase Auth fake email — lowercase alphanumeric, dot, underscore, hyphen. */
export const LOGIN_NAME_REGEX = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$|^[a-z0-9]{3,32}$/;

export function normalizeLoginName(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return t;
  return t.includes('@') ? t.split('@')[0]!.trim() : t;
}

export function loginNameSchema(): z.ZodString {
  return z
    .string()
    .min(1, { message: txt('employee.validation.loginNameRequired') })
    .transform(normalizeLoginName)
    .refine((val) => LOGIN_NAME_REGEX.test(val), {
      message: txt('employee.validation.loginNameInvalid'),
    });
}

export function optionalLoginNameSchema(): z.ZodOptional<z.ZodNullable<z.ZodString>> {
  return z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val?.trim() ? normalizeLoginName(val) : val ?? undefined))
    .refine((val) => val === undefined || val === null || val === '' || LOGIN_NAME_REGEX.test(val), {
      message: txt('employee.validation.loginNameInvalid'),
    });
}
