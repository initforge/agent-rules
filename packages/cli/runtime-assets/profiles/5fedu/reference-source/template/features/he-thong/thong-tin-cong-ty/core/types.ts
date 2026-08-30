import type { z } from 'zod';
import type { companySchema } from './schema';

export type CompanyFormValues = z.infer<typeof companySchema>;
