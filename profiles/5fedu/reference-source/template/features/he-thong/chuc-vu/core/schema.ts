import { z } from "zod";
import { txt } from '@/lib/text';
import { TRANG_THAI_HOAT_DONG } from '@/lib/constants/trang-thai';
import { codeFieldSchema } from '@/lib/validation/code-field';

export const positionSchema = z.object({
  ma_chuc_vu: codeFieldSchema(),
  ten_chuc_vu: z.string()
    .min(3, txt('position.validation.nameMin'))
    .max(255, txt('position.validation.nameMax')),
  cap_bac: z.coerce
    .number({ invalid_type_error: txt('position.validation.levelInvalid') })
    .int(txt('position.validation.levelInvalid'))
    .min(0, txt('position.validation.levelInvalid'))
    .max(32767, txt('position.validation.levelInvalid'))
    .optional()
    .nullable(),
  phong_ban_id: z.string().optional().nullable(),
  mo_ta: z.string().max(500, txt('position.validation.descMax')).optional().nullable(),
  thu_tu: z.coerce.number().int().min(0),
  trang_thai: z.enum(TRANG_THAI_HOAT_DONG, { message: txt('position.validation.statusInvalid') }),
});

export type PositionFormValues = z.infer<typeof positionSchema>;