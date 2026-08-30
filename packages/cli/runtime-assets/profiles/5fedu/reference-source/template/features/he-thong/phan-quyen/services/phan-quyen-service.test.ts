import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('getPhanQuyenByModule', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns empty array when moduleId or vaiTroIds missing', async () => {
    const { getPhanQuyenByModule } = await import('./phan-quyen-service');
    await expect(getPhanQuyenByModule('', ['pos-1'])).resolves.toEqual([]);
    await expect(getPhanQuyenByModule('he-thong/nhan-vien', [])).resolves.toEqual([]);
  });

  it('filters mock rows by module_key and vai_tro', async () => {
    const { getPhanQuyenByModule } = await import('./phan-quyen-service');
    const rows = await getPhanQuyenByModule('he-thong/nhan-vien', ['pos-1', 'pos-99']);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.module_key === 'he-thong/nhan-vien')).toBe(true);
    expect(rows.every((r) => r.vai_tro === 'pos-1')).toBe(true);
  });

  it('returns distinct modules for same vai_tro', async () => {
    const { getPhanQuyenByModule } = await import('./phan-quyen-service');
    const employeeRows = await getPhanQuyenByModule('he-thong/nhan-vien', ['pos-1']);
    const deptRows = await getPhanQuyenByModule('he-thong/phong-ban', ['pos-1']);
    expect(employeeRows.length).toBeGreaterThan(0);
    expect(deptRows.length).toBeGreaterThan(0);
    expect(employeeRows[0]?.module_key).not.toBe(deptRows[0]?.module_key);
  });
});
