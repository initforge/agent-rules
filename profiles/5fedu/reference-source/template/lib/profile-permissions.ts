import type { User } from '@/types';
import { can } from '@/lib/permissions';

/** User can edit own profile (legacy rule via `can()` — not tied to Auth role). */
export function canEditProfile(user: User | null | undefined): boolean {
  return can(user, 'edit', 'profile');
}
