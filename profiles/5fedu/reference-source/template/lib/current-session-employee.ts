import { useAuthStore } from '@/store/useStore';

/** Id NV nghiệp vụ của session hiện tại — dùng service layer (không React hook). */
export function getCurrentEmployeeId(): string | null {
  return useAuthStore.getState().user?.employee_id ?? null;
}
