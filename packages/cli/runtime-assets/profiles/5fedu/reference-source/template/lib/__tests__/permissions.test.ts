import { describe, expect, it, beforeEach } from 'vitest';
import { can, canAccessModule, canOnRecord, isGlobalPermissionSuperUser } from '@/lib/permissions';
import type { User } from '@/types';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';

const member: User = {
  id: '2',
  email: 'u@test.com',
  role: 'user',
  created_at: '',
  employee_id: 'emp-2',
};

beforeEach(() => {
  usePermissionGrantStore.getState().clearMatrix();
});

describe('can', () => {
  it('returns false when user is null', () => {
    expect(can(null, 'view', 'employees')).toBe(false);
  });

  it('member can view but not delete employees (legacy matrix off)', () => {
    expect(can(member, 'view', 'employees')).toBe(true);
    expect(can(member, 'delete', 'employees')).toBe(false);
  });

  it('member can edit profile', () => {
    expect(can(member, 'edit', 'profile')).toBe(true);
  });

  it('matrix: member with only view on nhan-vien cannot delete', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['view'],
    });
    expect(can(member, 'view', 'employees')).toBe(true);
    expect(can(member, 'edit', 'employees')).toBe(false);
    expect(can(member, 'delete', 'employees')).toBe(false);
  });

  it('matrix: member with update on nhan-vien can edit', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['view', 'update'],
    });
    expect(can(member, 'edit', 'employees')).toBe(true);
  });

  it('matrix: all grants full actions on module', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['all'],
    });
    expect(can(member, 'delete', 'employees')).toBe(true);
  });

  it('matrix: full grants do not bypass profile delete', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['all'],
    });
    expect(can(member, 'delete', 'profile')).toBe(false);
  });

  it('matrix: cap_bac=1 grants full module actions', () => {
    usePermissionGrantStore.getState().setMatrixGrants({}, 1);
    expect(isGlobalPermissionSuperUser()).toBe(true);
    expect(can(member, 'delete', 'employees')).toBe(true);
    expect(can(member, 'delete', 'departments')).toBe(true);
  });

  it('matrix: admin on module grants full actions on that module only', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['admin'],
    });
    expect(can(member, 'delete', 'employees')).toBe(true);
    expect(can(member, 'delete', 'departments')).toBe(false);
  });
});

describe('canAccessModule', () => {
  it('allows create-only access', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['create'],
    });
    expect(canAccessModule(member, 'employees')).toBe(true);
  });

  it('allows edit-only access (company / permissions modules)', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/thong-tin-cong-ty': ['update'],
    });
    expect(canAccessModule(member, 'company')).toBe(true);
  });

  it('denies when no view, create, or edit', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['delete'],
    });
    expect(canAccessModule(member, 'employees')).toBe(false);
  });
});

describe('canOnRecord', () => {
  it('creator can view and edit own row without module edit', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['view'],
    });
    const ctx = { nguoi_tao: 'emp-2' };
    expect(canOnRecord(member, 'view', 'employees', ctx)).toBe(true);
    expect(canOnRecord(member, 'edit', 'employees', ctx)).toBe(true);
  });

  it('creator cannot delete own row without module delete', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['view', 'update'],
    });
    expect(canOnRecord(member, 'delete', 'employees', { nguoi_tao: 'emp-2' })).toBe(false);
  });

  it('non-creator needs module permission', () => {
    usePermissionGrantStore.getState().setMatrixGrants({
      'he-thong/nhan-vien': ['view'],
    });
    expect(canOnRecord(member, 'edit', 'employees', { nguoi_tao: 'emp-99' })).toBe(false);
  });
});
