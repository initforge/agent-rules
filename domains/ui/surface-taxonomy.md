# Surface Taxonomy — 5fedu UI Language

**Scope:** All 5fedu projects using the shared UI template.  
**Source:** Extracted from `projects/5fedu/domains/surface-taxonomy.md`.  
**Evidence:** Validated across Tah-app (ERP admin) and Nostime (luxury retail admin).

## Surface types

| Surface | Composition | Baseline | Distinction |
|---|---|---|---|
| **Home dashboard** | Permission-filtered cards | Home + `MainCard` | Not a landing/hero or generic module-count dashboard |
| **Subsystem dashboard** | Sidebar, group cards, route guard | Sidebar + System Dashboard | Not a CRUD toolbar or flat route registry |
| **CRUD list** | Search/filter, table, pagination, row actions | Nhân viên reference | Not form combobox in toolbar; no "Xem chi tiết" as standalone action |
| **Row actions** | Visible primary Edit + overflow menu | Nhân viên ref | Not all actions in one menu; no duplicate action drawer |
| **Form drawer** | Header, sectioned fields, sticky footer | GenericDrawer | Not a shallow one-section form or native modal |
| **Detail drawer** | Summary, sectioned cards, toolbar | GenericDrawer | Not a separate detail page when ref uses drawer |
| **Stats/report** | Toolbar, KPI, chart, grid, export | Nhân viên stats | Not a mini-tab/dashboard inside CRUD |
| **Export dialog** | Format, scope, columns, result | ExportDialog | Not mock/empty export |
| **Hierarchy list** | Parent-child tree, expand, search | Phòng ban | Not a flat list hiding relationships |
| **Entity in tree** | Child entity constrained by parent | Chức vụ in Phòng ban | Not standalone CRUD losing parent axis |
| **Embedded child grid** | DetailSection, count, scoped children | Phòng ban detail | Not a flat unscoped sub-table |
| **Permission matrix** | Module nav + permission grid | Phân quyền | Not checkbox group without real registry |
| **Single-record settings** | Back header, sectioned form | Thông tin công ty | Not CRUD list for singleton |
| **Route breadcrumb** | Registered path + parent hierarchy | Breadcrumbs + sidebar | Not slug/capitalization fallback |

## Composition rules

- A module can compose multiple surfaces (list + detail drawer + form drawer).
- Each surface keeps its own shell but shares route, permission, state.
- **Shell** = invariant chrome/layout/behavior. **Variable slot** = business data.
- Real relationships must render correctly: entities constrained by parents, child mutations refresh parent context.
- Toolbar filter chip ≠ form combobox (different UI controls for different contexts).
