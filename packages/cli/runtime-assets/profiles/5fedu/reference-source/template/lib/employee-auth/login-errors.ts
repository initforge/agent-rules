import { txt } from '@/lib/text';

export type LoginUsernameStatus = 'not_found' | 'inactive' | 'resigned' | 'ok';

export function mapLoginUsernameStatus(status: LoginUsernameStatus): string {
  switch (status) {
    case 'not_found':
      return txt('page.login.accountNotFound');
    case 'inactive':
      return txt('page.login.accountDisabled');
    case 'resigned':
      return txt('page.login.employeeResigned');
    case 'ok':
      return '';
    default:
      return txt('page.login.loginFailed');
  }
}

/** Map Supabase Auth API messages to Vietnamese UI copy. */
export function mapSupabaseAuthError(raw: string): string {
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password')
  ) {
    return txt('page.login.wrongPassword');
  }
  if (lower.includes('email not confirmed')) {
    return 'Email chưa được xác nhận. Liên hệ quản trị.';
  }
  if (lower.includes('user banned') || lower.includes('banned')) {
    return txt('page.login.accountDisabled');
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Quá nhiều lần thử. Vui lòng đợi vài phút rồi thử lại.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.';
  }
  if (lower.includes('password should be at least')) {
    return txt('page.login.passwordMin');
  }
  if (lower.includes('user already registered')) {
    return txt('employee.validation.loginNameDuplicate');
  }

  return txt('page.login.loginFailed');
}

export function loginWrongPasswordMessage(): string {
  return txt('page.login.wrongPassword');
}

export function loginEmployeeNotLinkedMessage(): string {
  return txt('page.login.employeeNotLinked');
}

export function loginSupabaseNotConfiguredMessage(): string {
  return txt('page.login.supabaseNotConfigured');
}
