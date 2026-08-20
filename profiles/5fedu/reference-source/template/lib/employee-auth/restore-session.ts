import { buildAppUserFromSession } from '@/lib/employee-auth/session';
import { validateEmployeeCanLogin } from '@/lib/employee-auth/employee-auth-service';
import { getAuthService } from '@/lib/supabase/auth';
import { isSupabase } from '@/lib/data/config';
import { getEmployeeByAuthEmail } from '@/features/he-thong/nhan-vien/services/nhan-vien-service';
import { useAuthStore } from '@/store/useStore';
import type { User } from '@/types';

/** Build app User from Supabase auth session + employee row. */
async function buildUserForAuthSession(authUserId: string, authEmail: string): Promise<User | null> {
  const employee = await getEmployeeByAuthEmail(authEmail);
  if (!employee) return null;

  const blockReason = validateEmployeeCanLogin(employee);
  if (blockReason) return null;

  return buildAppUserFromSession(authUserId, authEmail, employee);
}

/**
 * Sync Zustand auth store with Supabase session + employee row.
 * Returns true when an authenticated session was applied.
 */
export async function syncAuthStoreFromSupabaseSession(): Promise<boolean> {
  if (!isSupabase()) return false;

  const session = await getAuthService().getSession();
  if (!session?.user) {
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      useAuthStore.getState().logout();
    }
    return false;
  }

  const user = await buildUserForAuthSession(
    session.user.id,
    session.user.email ?? '',
  );
  if (!user) {
    await getAuthService().signOut();
    useAuthStore.getState().logout();
    return false;
  }

  const { isAuthenticated, user: storedUser } = useAuthStore.getState();
  if (
    !isAuthenticated ||
    storedUser?.id !== user.id ||
    storedUser?.must_change_password !== user.must_change_password ||
    storedUser?.employee_id !== user.employee_id
  ) {
    useAuthStore.getState().login(user);
  } else {
    useAuthStore.getState().patchUser(user);
  }

  return true;
}
