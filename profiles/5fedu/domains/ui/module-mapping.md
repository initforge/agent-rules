# Module Mapping — UI to Template

**Scope:** All 5fedu projects using the shared UI template.  
**Source:** Extracted from `profiles/5fedu/projects/domains/module-mapping.md`.

## Reference by behavior

| Surface/behavior | Reference | When to use |
|---|---|---|
| CRUD list, form, detail, row actions | **Nhân viên** | Entity admin and standard CRUD |
| Hierarchy 2-level, embedded child grid | **Phòng ban** | Real parent-child relationship |
| Entity constrained by parent | **Chức vụ** in Phòng ban axis | Entity must stay in parent axis |
| Stats/report | **Nhân viên stats** | Has KPI/chart/report surface |
| Print/PDF/export | Reference export helper | Real data export needed |
| Permission matrix | **Phân quyền** | Registry + permission + save state |
| Single-record settings | **Thông tin công ty** | Singleton configuration |

## Chain mapping

```
spec → submenu → module → view → tab → route → breadcrumb registry → table/service
```

- Submenu: Vietnamese. View: hybrid like `nhan-vien-form`. Module key: no-diacritics slug.
- Every new product route must update: route host, sidebar, module registry, route guard, permission matrix.
- Breadcrumb: add exact path to `getRouteConfig()` with full-diacritics Vietnamese label.

## Clone checklist

1. Load matching inventory entry → verify local template identity → select reference.
2. Record template source + snapshot.
3. Copy shell structure first, then rename/adapt variable slots.
4. Add needed surfaces: list, toolbar, form, detail, row actions, stats if required.
5. Add core (types/schema/constants/select), hooks, service, store.
6. Wire full route chain → verify per `ui-delivery.md`.
7. No template source or ambiguous identity → STOP, ask owner.

## Audit checklist

1. Map surface, open template + target routes.
2. Compare code/contract for every related surface.
3. Check: list toolbar/filter/columns/pagination/export; form+detail pair; row-click; permission; danger confirm; child grid; stats; cross-module sync.
4. Check route chain when name/position/permission changes.
5. Record: template reference, shell parity, variable map, fidelity, verification, approved deviations.
