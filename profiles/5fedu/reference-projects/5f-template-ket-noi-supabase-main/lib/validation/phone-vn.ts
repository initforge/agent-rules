import { z } from 'zod';
import { txt } from '@/lib/text';

/** SĐT Việt Nam: bắt đầu 0, theo sau 9–10 chữ số */
export const PHONE_VN_REGEX = /^0\d{9,10}$/;

export function phoneVnSchema(options?: { required?: boolean }) {
  const required = options?.required !== false;
  let schema = z.string();
  if (required) {
    schema = schema.min(1, { message: txt('employee.validation.phoneRequired') });
  }
  return schema.regex(PHONE_VN_REGEX, { message: txt('employee.validation.phoneInvalid') });
}

export function optionalPhoneVnSchema() {
  return z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || PHONE_VN_REGEX.test(val), {
      message: txt('employee.validation.emergencyPhoneInvalid'),
    });
}
