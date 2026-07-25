import { describe, expect, it } from 'vitest';
import {
  actionsToQuyenList,
  formatQuyenCsv,
  parseQuyenCsv,
  quyenListToActions,
} from './permission-db-keys';

describe('parseQuyenCsv / formatQuyenCsv', () => {
  it('parses CSV quyen string', () => {
    expect(parseQuyenCsv('xem,them,sua,xoa')).toEqual(['xem', 'them', 'sua', 'xoa']);
  });

  it('expands legacy tat_ca when mapping to UI actions', () => {
    expect(parseQuyenCsv('tat_ca')).toEqual(['tat_ca']);
    expect(quyenListToActions(['tat_ca'])).toContain('all');
  });

  it('preserves unknown quyen tokens', () => {
    expect(parseQuyenCsv('xem,duyet,xuat')).toEqual(['xem', 'duyet', 'xuat']);
    expect(formatQuyenCsv(['duyet', 'xem', 'xuat'])).toBe('xem,duyet,xuat');
  });

  it('formats quyen list to CSV', () => {
    expect(formatQuyenCsv(['sua', 'xem', 'xoa', 'them'])).toBe('xem,them,sua,xoa');
  });
});

describe('actionsToQuyenList / quyenListToActions', () => {
  it('maps all actions to CSV CRUD tokens', () => {
    expect(actionsToQuyenList(['all'])).toEqual(['xem', 'them', 'sua', 'xoa']);
    expect(formatQuyenCsv(actionsToQuyenList(['view', 'create', 'update', 'delete']))).toBe(
      'xem,them,sua,xoa',
    );
  });

  it('round-trips CSV quyen to UI actions', () => {
    const actions = quyenListToActions(['xem', 'them', 'sua', 'xoa']);
    expect(actions).toContain('view');
    expect(actions).toContain('all');
  });
});
