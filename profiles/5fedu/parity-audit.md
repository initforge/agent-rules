# 5fedu Module Parity Audit

**Date:** 2026-08-06
**Status:** Reference-based audit (template source private)

## Pattern Contract Reference

Every module MUST follow this pattern:
```
toolbar → listview → footer → [stats-tab] → detail-drawer → form-drawer
```

### Required Surfaces per Module

| Module | CRUD List | Form Drawer | Detail Drawer | Stats Tab | Parent-Child |
|--------|-----------|-------------|---------------|-----------|--------------|
| nhan-vien | ✅ | ✅ | ✅ | ✅ | ❌ |
| phong-ban | ✅ (hierarchy) | ✅ | ✅ | ❌ | ✅ |
| chuc-vu | ❌ (entity-in-tree) | ✅ | ✅ | ❌ | ✅ (nested) |
| phan-quyen | ✅ (matrix) | ❌ | ❌ | ❌ | ❌ |
| thong-tin-cong-ty | ❌ (single-record) | ✅ | ❌ | ❌ | ❌ |

### Shared Component Primitives

| Component | Purpose | Used By |
|-----------|---------|---------|
| GenericToolbar | Search, filter, actions | All CRUD lists |
| GenericDrawer | Form + detail containers | All modules |
| GenericTable | Data display | All lists |
| TablePaginationFooter | Page info | All lists |
| FormDrawerFooter | Submit/cancel | All forms |
| DetailToolbar | Edit/delete actions | All details |
| EmbeddedChildDataGrid | Child entities | phong-ban, chuc-vu |
| HierarchyListShell | Parent-child display | phong-ban |

## Module Audit

### 1. nhan-vien (Employee) — Reference CRUD

**Pattern:** Standard CRUD with all surfaces
**Reference files:**
- `features/he-thong/nhan-vien/index.tsx` — Main list
- `features/he-thong/nhan-vien/components/nhan-vien-form.tsx` — Form drawer
- `features/he-thong/nhan-vien/components/nhan-vien-detail.tsx` — Detail drawer
- `features/he-thong/nhan-vien/components/nhan-vien-stats.tsx` — Stats tab

**Shell contract:**
- toolbar: Back + search/filter/reset left; column manager/export/add right
- listview: GenericTable + PaginationFooter; status badges; row actions
- footer: Page count + items-per-page
- detail-drawer: Header → hero summary → sectioned cards → DetailToolbar → footer
- form-drawer: Header → sectioned FormSection + FormGrid → footer

### 2. phong-ban (Department) — Hierarchy

**Pattern:** Parent-child hierarchy with embedded child grid
**Reference files:**
- `features/he-thong/phong-ban/index.tsx` — Hierarchy list
- `features/he-thong/phong-ban/components/phong-ban-detail.tsx` — Detail drawer

**Shell contract:**
- hierarchy-list: HierarchyListShell + HierarchyTable; expandable rows
- embedded-child-grid: EmbeddedChildDataGrid; scoped to parent
- detail-drawer: Parent header → child table with columns + actions

### 3. chuc-vu (Position) — Entity-in-Tree

**Pattern:** Entity constrained by department axis
**Reference files:**
- `features/he-thong/chuc-vu/` — All files

**Shell contract:**
- entity-in-tree: Lives within phong-ban axis
- NOT independent CRUD — breaks dropdowns, filters, org relationships

### 4. phan-quyen (Permission) — Matrix

**Pattern:** Module navigation + permission matrix
**Reference files:**
- `features/he-thong/phan-quyen/index.tsx` — Main page
- `features/he-thong/phan-quyen/components/permission-matrix.tsx` — Matrix

**Shell contract:**
- Desktop: module nav + right-side matrix
- Mobile: list + detail overlay

### 5. thong-tin-cong-ty (Company Info) — Single Record

**Pattern:** Single-record settings
**Reference files:**
- `features/he-thong/thong-tin-cong-ty/index.tsx` — Main page
- `features/he-thong/thong-tin-cong-ty/components/thong-tin-cong-ty-form.tsx` — Form

**Shell contract:**
- Load/save for one record
- NOT a disguised CRUD list

## Parity Status

| Module | Status | Blocker |
|--------|--------|---------|
| nhan-vien | BLOCKED | Source repo private |
| phong-ban | BLOCKED | Source repo private |
| chuc-vu | BLOCKED | Source repo private |
| phan-quyen | BLOCKED | Source repo private |
| thong-tin-cong-ty | BLOCKED | Source repo private |

## Agent Instructions

When working on 5fedu modules:
1. Always reference `pattern-inventory.yaml` for surface definitions
2. Always reference `ui-contracts.md` for shell contracts
3. Point agents to specific files, not verbal descriptions
4. Use `nhan-vien` as the CRUD reference
5. Use `phong-ban` + `chuc-vu` for parent-child patterns
6. Do NOT flatten chuc-vu into independent CRUD
7. Verify parity packet before claiming PASS
