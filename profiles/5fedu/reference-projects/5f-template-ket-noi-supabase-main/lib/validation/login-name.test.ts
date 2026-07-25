import { describe, expect, it } from 'vitest';
import { normalizeLoginName, loginNameSchema } from '@/lib/validation/login-name';
import { loginNameToSupabaseEmail } from '@/lib/auth-email';

describe('login-name validation', () => {
  it('normalizes to lowercase and strips domain', () => {
    expect(normalizeLoginName('Admin@Gmail.com')).toBe('admin');
    expect(normalizeLoginName('  nguyen.van_a  ')).toBe('nguyen.van_a');
  });

  it('accepts valid login names', () => {
    expect(loginNameSchema().safeParse('admin').success).toBe(true);
    expect(loginNameSchema().safeParse('nv_01').success).toBe(true);
  });

  it('rejects too short names', () => {
    expect(loginNameSchema().safeParse('ab').success).toBe(false);
  });
});

describe('loginNameToSupabaseEmail', () => {
  it('appends gmail suffix', () => {
    expect(loginNameToSupabaseEmail('admin')).toBe('admin@gmail.com');
  });
});
