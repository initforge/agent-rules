/**
 * Register feature module UI strings before app render.
 * Import order: this file must load before any txt() usage from feature keys.
 */
import { registerModuleStrings } from '@/lib/text/register-module-strings';
import { employee } from '@/features/he-thong/nhan-vien/text';
import { department } from '@/features/he-thong/phong-ban/text';
import { position } from '@/features/he-thong/chuc-vu/text';
import { permission } from '@/features/he-thong/phan-quyen/text';
import { company } from '@/features/he-thong/thong-tin-cong-ty/text';

registerModuleStrings('employee', employee);
registerModuleStrings('department', department);
registerModuleStrings('position', position);
registerModuleStrings('permission', permission);
registerModuleStrings('company', company);

export { employee, department, position, permission, company };
