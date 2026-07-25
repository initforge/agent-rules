/**
 * Cấu hình TanStack Query thống nhất cho dữ liệu từ API/Supabase:
 * - staleTime: giảm refetch không cần thiết
 * - gcTime: giữ cache trong RAM sau khi unmount (V5 dùng gcTime thay cho cacheTime)
 */
export const SERVER_STALE_TIME_MS = 1000 * 60 * 5; // 5 phút
export const SERVER_GC_TIME_MS = 1000 * 60 * 30; // 30 phút

/** Master data (phòng ban, chức vụ, …) đổi ít — stale dài hơn để giảm egress. */
export const MASTER_DATA_STALE_TIME_MS = 1000 * 60 * 30; // 30 phút

export const defaultServerQueryOptions = {
  staleTime: SERVER_STALE_TIME_MS,
  gcTime: SERVER_GC_TIME_MS,
} as const;

/** Danh sách transaction (nhân viên, …) — mặc định đồng bộ QueryClient root. */
export const listQueryOptions = {
  staleTime: SERVER_STALE_TIME_MS,
  gcTime: SERVER_GC_TIME_MS,
} as const;

export const masterDataQueryOptions = {
  staleTime: MASTER_DATA_STALE_TIME_MS,
  gcTime: SERVER_GC_TIME_MS,
} as const;

export const notificationsQueryOptions = {
  staleTime: 60_000,
  gcTime: SERVER_GC_TIME_MS,
} as const;

/**
 * Quyền session / auth-sensitive — luôn refetch khi mount để admin đổi quyền có hiệu lực sau reload.
 * Dùng cho `permissionGrants`, không dùng `masterDataQueryOptions`.
 */
export const authSensitiveQueryOptions = {
  staleTime: 0,
  gcTime: SERVER_GC_TIME_MS,
  refetchOnMount: 'always',
} as const;
