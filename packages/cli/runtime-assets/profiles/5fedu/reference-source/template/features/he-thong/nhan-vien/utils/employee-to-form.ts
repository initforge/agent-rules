import type { Employee } from '../core/types';
import type { EmployeeCreateFormValues, EmployeeEditFormValues, EmployeeFormValues } from '../core/schema';
import { coerceEntityId } from '@/lib/coerce-entity-id';

export function getDefaultEmployeeFormValues(): EmployeeFormValues {
  return {
    ho_ten: '',
    email: '',
    so_dien_thoai: '',
    chuc_vu_id: '',
    phong_ban_id: '',
    gioi_tinh: 'Nam',
    trang_thai: 'Đang làm việc',
    anh_dai_dien: '',
  };
}

export function getDefaultEmployeeCreateFormValues(): EmployeeCreateFormValues {
  return {
    ...getDefaultEmployeeFormValues(),
    ten_dang_nhap: '',
    mat_khau_tam: '',
  };
}

export function employeeToFormValues(emp: Employee): EmployeeFormValues {
  return {
    ho_ten: emp.ho_ten,
    email: emp.email,
    so_dien_thoai: emp.so_dien_thoai,
    chuc_vu_id: coerceEntityId(emp.chuc_vu_id),
    phong_ban_id: coerceEntityId(emp.phong_ban_id),
    gioi_tinh: emp.gioi_tinh,
    trang_thai: emp.trang_thai,
    anh_dai_dien: emp.anh_dai_dien ?? undefined,
  };
}

export function employeeToEditFormValues(emp: Employee): EmployeeEditFormValues {
  return {
    ...employeeToFormValues(emp),
    ten_dang_nhap: emp.ten_dang_nhap ?? '',
    mat_khau_tam: '',
  };
}
