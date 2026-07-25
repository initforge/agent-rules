import { z } from 'zod';
import { txt } from '@/lib/text';

export function emailSchema(message?: string) {
  return z.string().email({ message: message ?? txt('employee.validation.emailInvalid') });
}

export function optionalEmailSchema(message?: string) {
  return z
    .string()
    .email({ message: message ?? txt('employee.validation.personalEmailInvalid') })
    .optional()
    .or(z.literal(''));
}
