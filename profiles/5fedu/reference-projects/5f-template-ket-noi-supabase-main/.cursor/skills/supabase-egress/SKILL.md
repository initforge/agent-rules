---
name: supabase-egress
description: Audit and implement Supabase PostgREST egress optimizations for 5F ERP modules — selective columns, returningSelect, pagination, TanStack Query cache, queryOptions factories. Use when adding a new CRUD module, reviewing data services, optimizing Supabase bandwidth, or wiring hooks + prefetch.
---

# Supabase Egress — 5F Template

Reference: [docs/supabase-egress.md](../../docs/supabase-egress.md) · rules: `04-supabase.mdc`, `02-state-data.mdc`

## When to use

- New feature module with Supabase table
- Code review of `features/*/services/*.ts`
- User asks to reduce refetch / egress / bandwidth
- Wiring TanStack Query prefetch + hooks for same query

## Audit checklist

Run mentally (or grep) before finishing:

| Check | Pass criteria |
|-------|----------------|
| Select columns | `features/<entity>/core/supabase-select.ts` exists; no bare `*` on large tables |
| Repository | `createRepository({ select: ... })` always set for Supabase |
| List vs detail | `*_SELECT_TABLE` for list/page; `*_SELECT_FULL` for getById/form; `*_SELECT_STATS` for stats tab |
| Stats tab | `getXForStats()` + slim select (≤500 NV); view/RPC when scale grows |
| Query cache | `listQueryOptions` / `masterDataQueryOptions` / `authSensitiveQueryOptions`; patch before invalidate |
| Permission grants session | `authSensitiveQueryOptions` on `permissionGrants.byPosition` — **not** `masterDataQueryOptions` |
| Mutations | `returningSelect` minimal (`id`, changed fields, small embeds) |
| Pagination | Transaction lists use `getPage` / hybrid threshold; not unbounded `getAll()` |
| Count | Separate head-only count when server pagination |
| Query keys | All keys in `lib/query-keys.ts`; prefix keys for invalidate |
| Invalidate | Use `pagePrefix`, never factory function as `queryKey` |
| queryOptions | Same query in hook + prefetch → `features/*/queries/*.ts` |
| Permission matrix | Per-module `getPhanQuyenByModule` + `roles.forModule`; not full `getRoles()` on UI |
| Position FK / picker | `getActivePositions()` + `positions.active`; full `getPositions()` for filters only |
| Position → permissions | On status/CRUD: invalidate `roles.all` + `permissionGrants.all` |
| Realtime | Only if needed; cleanup on unmount |
| Media | Cloudinary for UI images, not Storage egress |

## Anti-patterns (grep)

```bash
rg "select\\('\\*'\\)" features/ lib/data/
rg "getAll\\(\\)" features/*/services/
rg "invalidateQueries\\(\\{ queryKey: queryKeys\\.[a-z]+\\.[a-z]+ \\}\\)" features/
rg "permission-grants.*masterDataQueryOptions" features/
```

## Template: supabase-select.ts

```ts
export const ENTITY_ROW_COLUMNS = ['id', 'ma', 'ten', /* ... */].join(',');

/** List / table — columns visible in listview + filter FKs only */
export const ENTITY_SELECT_TABLE = `${ENTITY_ROW_COLUMNS},relation(ten_hien_thi)`;

/** Detail / form — full row + embeds for display */
export const ENTITY_SELECT_FULL = `${ENTITY_ROW_COLUMNS},relation(ten_hien_thi,extra)`;

/** Stats tab — minimal columns for client-side aggregate (≤500 rows) */
export const ENTITY_SELECT_STATS = 'id,fk_id,trang_thai,tg_tao,relation(ten_hien_thi)';

export const ENTITY_RETURNING_STATUS_ONLY = 'id,trang_thai,tg_cap_nhat';
export const ENTITY_RETURNING_FULL = ENTITY_SELECT_FULL;
```

## Template: service + repository

```ts
const repo = createRepository<Entity>({
  tableName: 'he_thong_entity',
  mockData: MOCK,
  select: ENTITY_SELECT_TABLE,
});

export const getEntityPage = (params) =>
  repo.getPage({ ...params, select: ENTITY_SELECT_TABLE });

export const getEntityById = (id) =>
  repo.getById(id, { select: ENTITY_SELECT_FULL });

await repo.update(id, patch, { returningSelect: ENTITY_RETURNING_STATUS_ONLY });
```

## Template: queryOptions + invalidate

```ts
// features/<domain>/queries/entities.ts
export function entityCountQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.entities.count,
    queryFn: getEntityCount,
    ...listQueryOptions,
  });
}

// lib/query-keys.ts
entities: {
  pagePrefix: ['entities', 'page'] as const,
  page: (p) => ['entities', 'page', p] as const,
}

// mutation onSuccess
queryClient.invalidateQueries({ queryKey: queryKeys.entities.pagePrefix });
```

## Permission matrix + position status

Matrix UI loads one module at a time:

```ts
// Service
getPhanQuyenByModule(moduleId, activePositionIds);
getRolesForModule(moduleId); // uses active positions only

// Hook + prefetch share queryOptions
moduleRolePermissionsQueryOptions(moduleId);
prefetchModuleRolePermissions(queryClient, moduleId);
```

When position status changes (deactivate removes row from matrix; member `can()` must refresh):

```ts
void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
void queryClient.invalidateQueries({ queryKey: queryKeys.permissionGrants.all });
for (const id of positionIds) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.permissionGrants.byPosition(id) });
}
```

Session grants — always fresh on mount (`authSensitiveQueryOptions`):

```ts
export function positionPermissionGrantsQueryOptions(positionId: string) {
  return queryOptions({
    queryKey: queryKeys.permissionGrants.byPosition(positionId),
    queryFn: () => fetchPositionPermissionGrants(positionId),
    enabled: Boolean(positionId),
    ...authSensitiveQueryOptions,
  });
}
```

## Active positions for FK validation

```ts
// ✅ Assign / import / bulk — active only (smaller payload)
const positions = await getActivePositions();

// ✅ Toolbar filter — include inactive
const positions = await getPositions();

// ✅ Edit form — keep current inactive label without full fetch
mergeActivePositionsForEmployeeForm(activePositions, employee);
```

## When to use Edge Function / RPC

Prefer client PostgREST for CRUD with selective select + RLS.

Consider Edge Function / RPC when:

- Aggregations over large tables (stats dashboards)
- Multi-step writes that today cause repeated `getAll()` in services
- Secrets or service-role operations

## Verification

After changes: `npm run lint` · `npm run test` · `npm run build`
