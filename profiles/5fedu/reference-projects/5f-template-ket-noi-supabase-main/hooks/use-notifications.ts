import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@/types';
import { getNotifications } from '@/features/he-thong/thong-bao/services/thong-bao-service';
import { queryKeys } from '@/lib/query-keys';
import { notificationsQueryOptions } from '@/lib/supabase/query-config';

/** @deprecated Use queryKeys.notifications.all */
export const NOTIFICATIONS_QUERY_KEY = queryKeys.notifications.all;

export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: getNotifications,
    ...notificationsQueryOptions,
  });

  const notifications = query.data ?? [];

  const setNotifications = (updater: (prev: Notification[]) => Notification[]) => {
    queryClient.setQueryData<Notification[]>(queryKeys.notifications.all, (prev) =>
      updater(prev ?? [])
    );
  };

  const add = (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setNotifications((prev) => [
      { ...n, id, read: false, createdAt: new Date().toISOString() },
      ...prev,
    ]);
  };

  const remove = (id: string) => {
    setNotifications((prev) => prev.filter((x) => x.id !== id));
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((x) => (x.id === id ? { ...x, read: true } : x))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
  };

  const clearAll = () => {
    queryClient.setQueryData<Notification[]>(queryKeys.notifications.all, []);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    isLoading: query.isLoading,
    add,
    remove,
    markAsRead,
    markAllAsRead,
    clearAll,
    unreadCount,
  };
}
