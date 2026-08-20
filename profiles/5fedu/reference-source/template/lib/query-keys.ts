/**
 * Query keys tập trung — tránh lệch chuỗi khi invalidate / prefetch (TanStack Query + Supabase).
 */
/** Tham số fetch danh sách nhân viên (đồng bộ với getEmployees + useEmployees). */
export const EMPLOYEES_LIST_QUERY_PARAMS = {
  limit: 500,
  offset: 0,
  orderBy: 'ho_ten',
  ascending: true,
} as const;

export const queryKeys = {
  employees: {
    all: ['employees'] as const,
    count: ['employees', 'count'] as const,
    /** Prefix để invalidate mọi query `['employees', 'page', params]` — không dùng factory function làm queryKey. */
    pagePrefix: ['employees', 'page'] as const,
    page: (params: {
      limit: number;
      offset: number;
      orderBy: string;
      ascending: boolean;
    }) => ['employees', 'page', params] as const,
    /** Danh sách có limit/offset/order — giảm refetch và khớp cache mutation. */
    list: (params: {
      limit: number;
      offset: number;
      orderBy: string;
      ascending: boolean;
    }) => ['employees', 'list', params] as const,
    /** Prefix: invalidate mọi query `['employee', id]` */
    anyDetail: ['employee'] as const,
    detail: (id: string) => ['employee', id] as const,
    statsSample: (limit: number) => ['employees', 'stats-sample', limit] as const,
  },
  notifications: {
    all: ['notifications'] as const,
  },
  departments: {
    all: ['departments'] as const,
    count: ['departments', 'count'] as const,
    pagePrefix: ['departments', 'page'] as const,
    page: (params: {
      limit: number;
      offset: number;
      orderBy: string;
      ascending: boolean;
    }) => ['departments', 'page', params] as const,
  },
  positions: {
    all: ['positions'] as const,
    /** Chức vụ đang hoạt động — picker/form gán NV, giảm egress vs `all`. */
    active: ['positions', 'active'] as const,
    count: ['positions', 'count'] as const,
    pagePrefix: ['positions', 'page'] as const,
    page: (params: {
      limit: number;
      offset: number;
      orderBy: string;
      ascending: boolean;
    }) => ['positions', 'page', params] as const,
  },
  roles: {
    /** Prefix: invalidate mọi query roles (matrix + theo module). */
    all: ['roles'] as const,
    matrixPositions: ['roles', 'matrix-positions'] as const,
    forModule: (moduleId: string) => ['roles', 'for-module', moduleId] as const,
  },
  permissionGrants: {
    /** Prefix: invalidate mọi query `['permission-grants', positionId]`. */
    all: ['permission-grants'] as const,
    byPosition: (positionId: string) => ['permission-grants', positionId] as const,
  },
  branches: {
    all: ['branches'] as const,
  },
  company: {
    info: ['company', 'info'] as const,
  },
  jobLevels: {
    all: ['job-levels'] as const,
  },
} as const;

/** Tham số list phòng ban — đồng bộ `getDepartmentsPage`. */
export const DEPARTMENTS_LIST_QUERY_PARAMS = {
  limit: 500,
  offset: 0,
  orderBy: 'duong_dan',
  ascending: true,
} as const;

/** Tham số list chức vụ — đồng bộ `getPositionsPage`. */
export const POSITIONS_LIST_QUERY_PARAMS = {
  limit: 500,
  offset: 0,
  orderBy: 'thu_tu',
  ascending: true,
} as const;
