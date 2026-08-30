import { describe, expect, it } from 'vitest';
import {
  loginEmployeeNotLinkedMessage,
  loginWrongPasswordMessage,
  mapLoginUsernameStatus,
  mapSupabaseAuthError,
} from '@/lib/employee-auth/login-errors';
import { resolveLoginUsernameStatusFromEmployee } from '@/lib/employee-auth/check-login-username';
import type { Employee } from '@/features/he-thong/nhan-vien/core/types';

const baseEmployee: Employee = {
  id: '1',
  ho_ten: 'Test User',
  email: 'test@company.com',
  so_dien_thoai: '',
  phong_ban_id: null,
  chuc_vu_id: null,
  gioi_tinh: 'Nam',
  trang_thai: 'Đang làm việc',
  ten_dang_nhap: 'testuser',
  tai_khoan_dang_hoat_dong: true,
};

describe('mapLoginUsernameStatus', () => {
  it('maps not_found to Vietnamese account message', () => {
    expect(mapLoginUsernameStatus('not_found')).toContain('Tài khoản không tồn tại');
  });

  it('maps inactive to disabled message', () => {
    expect(mapLoginUsernameStatus('inactive')).toContain('vô hiệu hóa');
  });

  it('maps resigned to resigned message', () => {
    expect(mapLoginUsernameStatus('resigned')).toContain('nghỉ việc');
  });

  it('returns empty string for ok', () => {
    expect(mapLoginUsernameStatus('ok')).toBe('');
  });
});

describe('mapSupabaseAuthError', () => {
  it('maps invalid credentials to wrong password', () => {
    expect(mapSupabaseAuthError('Invalid login credentials')).toContain('Sai mật khẩu');
  });

  it('maps rate limit errors', () => {
    expect(mapSupabaseAuthError('Too many requests')).toContain('Quá nhiều lần thử');
  });

  it('falls back to generic login failed', () => {
    expect(mapSupabaseAuthError('Something unexpected')).toContain('Đăng nhập thất bại');
  });
});

describe('resolveLoginUsernameStatusFromEmployee', () => {
  it('returns not_found when employee is missing', () => {
    expect(resolveLoginUsernameStatusFromEmployee(undefined)).toBe('not_found');
  });

  it('returns inactive when account is disabled', () => {
    expect(
      resolveLoginUsernameStatusFromEmployee({
        ...baseEmployee,
        tai_khoan_dang_hoat_dong: false,
      }),
    ).toBe('inactive');
  });

  it('returns resigned for resigned employees', () => {
    expect(
      resolveLoginUsernameStatusFromEmployee({
        ...baseEmployee,
        trang_thai: 'Nghỉ việc',
      }),
    ).toBe('resigned');
  });

  it('returns ok for active employees', () => {
    expect(resolveLoginUsernameStatusFromEmployee(baseEmployee)).toBe('ok');
  });
});

describe('login message helpers', () => {
  it('exposes wrong password and employee not linked messages', () => {
    expect(loginWrongPasswordMessage()).toContain('Sai mật khẩu');
    expect(loginEmployeeNotLinkedMessage()).toContain('hồ sơ nhân viên');
  });
});
