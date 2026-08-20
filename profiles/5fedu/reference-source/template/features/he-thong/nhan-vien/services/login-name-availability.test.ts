import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('login name availability', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_DATA_SOURCE', 'mock');
    await import('@/lib/text/bootstrap-module-strings');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('finds employee by login name (case-insensitive)', async () => {
    const { getEmployeeByLoginName } = await import('./nhan-vien-service');
    const employee = await getEmployeeByLoginName('ADMIN');
    expect(employee?.id).toBe('emp-000');
    expect(employee?.ten_dang_nhap).toBe('admin');
  });

  it('returns undefined when login name is not used', async () => {
    const { getEmployeeByLoginName } = await import('./nhan-vien-service');
    await expect(getEmployeeByLoginName('unused-login-xyz')).resolves.toBeUndefined();
  });

  it('excludes current employee when excludeEmployeeId matches', async () => {
    const { getEmployeeByLoginName } = await import('./nhan-vien-service');
    await expect(
      getEmployeeByLoginName('admin', { excludeEmployeeId: 'emp-000' }),
    ).resolves.toBeUndefined();
  });

  it('isLoginNameTakenByOtherEmployee is false for own login on edit', async () => {
    const { isLoginNameTakenByOtherEmployee } = await import('./nhan-vien-service');
    await expect(
      isLoginNameTakenByOtherEmployee('admin', 'emp-000'),
    ).resolves.toBe(false);
  });

  it('isLoginNameTakenByOtherEmployee is true when another employee uses login', async () => {
    const { isLoginNameTakenByOtherEmployee } = await import('./nhan-vien-service');
    await expect(
      isLoginNameTakenByOtherEmployee('admin', 'emp-001'),
    ).resolves.toBe(true);
  });

  it('assertLoginNameAvailable throws duplicate message when taken', async () => {
    const { assertLoginNameAvailable } = await import('./nhan-vien-service');
    const { txt } = await import('@/lib/text');
    await expect(assertLoginNameAvailable('admin', 'emp-001')).rejects.toThrow(
      txt('employee.validation.loginNameDuplicate'),
    );
  });

  it('assertLoginNameAvailable passes for unchanged login on edit', async () => {
    const { assertLoginNameAvailable } = await import('./nhan-vien-service');
    await expect(assertLoginNameAvailable('admin', 'emp-000')).resolves.toBeUndefined();
  });
});
