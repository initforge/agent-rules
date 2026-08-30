import { describe, it, expect } from 'vitest';
import { createEmployeeSchema, employeeSchema } from '../schema';

const validData = () => ({
  ho_ten: 'Nguyễn Văn A',
  email: 'test@company.vn',
  so_dien_thoai: '0901234567',
  chuc_vu_id: 'pos-1',
  phong_ban_id: 'dep-1',
  gioi_tinh: 'Nam' as const,
  trang_thai: 'Đang làm việc' as const,
});

const parse = (overrides: Record<string, unknown> = {}) =>
  employeeSchema.safeParse({ ...validData(), ...overrides });

describe('employeeSchema', () => {
  it('chấp nhận dữ liệu hợp lệ đầy đủ', () => {
    expect(parse().success).toBe(true);
  });

  describe('so_dien_thoai', () => {
    it('chấp nhận SĐT 10-11 số bắt đầu bằng 0', () => {
      expect(parse({ so_dien_thoai: '0901234567' }).success).toBe(true);
      expect(parse({ so_dien_thoai: '02812345678' }).success).toBe(true);
    });

    it('từ chối SĐT không bắt đầu bằng 0', () => {
      expect(parse({ so_dien_thoai: '9012345678' }).success).toBe(false);
    });

    it('từ chối rỗng', () => {
      expect(parse({ so_dien_thoai: '' }).success).toBe(false);
    });
  });

  describe('gioi_tinh', () => {
    it('chấp nhận "Nam", "Nữ", "Khác"', () => {
      expect(parse({ gioi_tinh: 'Nam' }).success).toBe(true);
      expect(parse({ gioi_tinh: 'Nữ' }).success).toBe(true);
      expect(parse({ gioi_tinh: 'Khác' }).success).toBe(true);
    });

    it('từ chối giá trị không hợp lệ', () => {
      expect(parse({ gioi_tinh: 'Male' }).success).toBe(false);
    });
  });

  describe('email', () => {
    it('chấp nhận email hợp lệ', () => {
      expect(parse({ email: 'user@domain.com' }).success).toBe(true);
    });

    it('từ chối email không hợp lệ', () => {
      expect(parse({ email: 'not-email' }).success).toBe(false);
    });
  });

  describe('trường bắt buộc', () => {
    it('ho_ten ít nhất 2 ký tự', () => {
      expect(parse({ ho_ten: 'A' }).success).toBe(false);
      expect(parse({ ho_ten: 'AB' }).success).toBe(true);
    });

    it('chuc_vu_id bắt buộc', () => {
      expect(parse({ chuc_vu_id: '' }).success).toBe(false);
    });

    it('phong_ban_id bắt buộc', () => {
      expect(parse({ phong_ban_id: '' }).success).toBe(false);
    });
  });

  describe('createEmployeeSchema position FK', () => {
    const positions = [
      {
        id: 42,
        ma_chuc_vu: 'CV-TP',
        ten_chuc_vu: 'Trưởng phòng',
        phong_ban_id: 7,
        mo_ta: null,
        thu_tu: 1,
        trang_thai: 'Đang hoạt động' as const,
        tg_tao: '',
        tg_cap_nhat: '',
      },
    ];

    it('matches position when form id is string and position id is number', () => {
      const schema = createEmployeeSchema(positions);
      const result = schema.safeParse({
        ...validData(),
        chuc_vu_id: '42',
        phong_ban_id: '7',
      });
      expect(result.success).toBe(true);
    });

    it('reads positions from getter at validation time', () => {
      const positionsRef: { current: typeof positions } = { current: [] };
      const schema = createEmployeeSchema(() => positionsRef.current);
      const fail = schema.safeParse({
        ...validData(),
        chuc_vu_id: '42',
        phong_ban_id: '7',
      });
      expect(fail.success).toBe(false);

      positionsRef.current = positions;
      const pass = schema.safeParse({
        ...validData(),
        chuc_vu_id: '42',
        phong_ban_id: '7',
      });
      expect(pass.success).toBe(true);
    });

    it('rejects position without department assignment', () => {
      const schema = createEmployeeSchema([
        {
          id: '99',
          ma_chuc_vu: 'CV-ORPHAN',
          ten_chuc_vu: 'Chức vụ chưa gán PB',
          phong_ban_id: null,
          mo_ta: null,
          thu_tu: 1,
          trang_thai: 'Đang hoạt động' as const,
          tg_tao: '',
          tg_cap_nhat: '',
        },
      ]);
      const result = schema.safeParse({
        ...validData(),
        chuc_vu_id: '99',
        phong_ban_id: '1',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('chuc_vu_id'))).toBe(true);
      }
    });
  });
});
