import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('createRepository', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns mock repository that lists seed data', async () => {
    const { createRepository } = await import('./create-repository');
    type Row = { id: string; name: string };
    const repo = createRepository<Row>({
      tableName: 'test_table',
      mockData: [{ id: '1', name: 'A' }],
      delay: 0,
    });
    const rows = await repo.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('A');
  });
});
