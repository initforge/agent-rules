import { z } from 'zod';
import { txt } from '@/lib/text';
import { isValidImageSource } from '@/lib/media/image-url';

export const companySchema = z.object({
  appName: z.string().min(2, txt('company.validation.appNameMin')),
  appDescription: z.string().max(30, txt('company.validation.appDescMax')).optional(),
  appLogo: z
    .string()
    .optional()
    .nullable()
    .refine((v) => isValidImageSource(v), txt('company.validation.logoUrlInvalid')),
  companyName: z.string().min(2, txt('company.validation.companyNameMin')),
  taxId: z.string().min(5, txt('company.validation.taxIdMin')),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email(txt('company.validation.emailInvalid')).optional().or(z.literal('')),
  website: z.string().optional(),
});
