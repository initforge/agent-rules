# Example PAF — Module ERP "Vật tư" (5fedu)

**Ví dụ** điền đủ PAF — clone entity quản trị nội bộ từ **Nhân viên**. Không execute từ file này.

---

## §0 Meta

```yaml
---
plan_id: tah-app-vat-tu-20260707
revision: 0
supersedes: null
workflow_mode: plan-authoring
status: READY
current_phase: P1
repo: tah-app
profile: tah-app
lane: normal
risk_flags: []
context/5fedu: installed
primary_skills: [plan-and-handoff, 5fedu-module-parity, implementation-discovery]
preferred_tier: L0
plan_author_min_tier: L2
---
```

---

## §1 Mục tiêu

**Outcome:** Module **Vật tư** CRUD đầy đủ (listview, form drawer, detail drawer, route admin) parity **Nhân viên**, lint/typecheck pass.

**OUT:** Tab Thống kê; production deploy proof; migration DB mới (dùng bảng có sẵn nếu spec chốt).

---

## §2 Scope lock

**IN:**
- D1: Scaffold + registry chain (P1)
- D2: Listview + toolbar (P2)
- D3: Form + detail drawer (P3)

**OUT:** Stats tab; redesign ngoài template; generic monolith page.

**File-count:** ≥8 files → lane `normal`.

---

## §3 Context routing map

| Domain | Files | Skill | Cấm |
|---|---|---|---|
| UI module | `context/5fedu/domains/ui-delivery.md` + `module-mapping.md` | `5fedu-module-parity` | `frontend-architect` |

**Template reference:**

| Surface | Module | Paths (template app) |
|---|---|---|
| CRUD shell | Nhân viên | `src/modules/nhan-vien/` (full tree) |
| Route chain | — | `App.tsx`, `sidebar-menu.tsx`, `admin-module-registry.ts`, `Breadcrumbs.tsx` |

Clone checklist: `module-mapping.md` §Clone checklist.

---

## §4 Phases

### Phase P1 — Scaffold + registry

```yaml
goal: Route admin + shell files, chưa logic nghiệp vụ phức tạp
preferred_tier: L0
min_tier: L0
allowed_tiers: [L0, L1]
escalate_if: [verify_fail_2x, BLOCKED]
scope_lock: [D1]
files_touched:
  - src/App.tsx (modify)
  - src/components/layout/sidebar-menu.tsx (modify)
  - src/admin/admin-module-registry.ts (modify)
  - src/components/shared/Breadcrumbs.tsx (modify)
  - src/modules/vat-tu/* (create — shell)
template_reference: Nhân viên module tree
verify_gate:
  commands: npm run typecheck
exit_criteria:
  - [ ] Clone checklist registry items ticked
  - [ ] typecheck pass
  - [ ] Template reference cited
```

### Phase P2 — Listview + toolbar

```yaml
goal: Table, toolbar, filter chip, pagination parity Nhân viên
preferred_tier: L0
min_tier: L1
allowed_tiers: [L0, L1, L2]
escalate_if: [verify_fail_2x, parity_fail]
scope_lock: [D2]
files_touched:
  - src/modules/vat-tu/vat-tu-table.tsx (create)
  - src/modules/vat-tu/vat-tu-toolbar.tsx (create)
template_reference: nhan-vien-table.tsx, nhan-vien-toolbar.tsx
verify_gate:
  commands: npm run lint && npm run typecheck
exit_criteria:
  - [ ] Audit checklist toolbar/filter/pagination
  - [ ] Pattern fidelity report
```

### Phase P3 — Form + detail drawer

```yaml
goal: Cặp form/detail drawer parity Nhân viên
preferred_tier: L0
min_tier: L1
allowed_tiers: [L0, L1, L2]
escalate_if: [verify_fail_2x, parity_fail]
scope_lock: [D3]
files_touched:
  - src/modules/vat-tu/vat-tu-form.tsx (create)
  - src/modules/vat-tu/vat-tu-detail.tsx (create)
template_reference: nhan-vien-form.tsx, nhan-vien-detail.tsx
verify_gate:
  commands: npm run lint && npm run typecheck && npm run build
exit_criteria:
  - [ ] Confirm xóa useConfirmStore
  - [ ] Detail footer Đóng/Sửa/Xóa
  - [ ] build pass
```

---

## §5 Assumptions / Known-unknowns

### Assumptions locked
- Template baseline: **Nhân viên**
- Bảng DB: `hc_vat_tu` đã có (owner chốt)
- Submenu: **Hành chính**

### Known-unknowns

| ID | Unknown | Verify | Phase |
|---|---|---|---|
| KU1 | Cột DB ↔ form field map | read service + schema | P3 |
| KU2 | Permission module key | read permissions.md + registry | P1 |

---

## §5b External research

*(none — skip section)*

---

## §6 Gates

HB-1..5; 5fedu UI gate; finish-to-completion; report contract.

---

## §7 Plan QA

- [x] Meta + tier fields
- [x] 3 phases with verify
- [x] Template paths named
- [x] P1 L0-sized

---

## §8 HANDOFF (P1)

```text
---
HANDOFF
Plan ID: tah-app-vat-tu-20260707
Execute: Phase P1 ONLY
Pivot: "làm đi phase P1"
preferred_tier: L0
min_tier: L0
allowed_tiers: [L0, L1]
Scope lock: [D1 scaffold + registry]
Template reference: Nhân viên @ src/modules/nhan-vien/
Verify: npm run typecheck
Forbidden: P2/P3, frontend-architect, scope creep
Report: Template reference | Pattern fidelity | Verification | Status | tier_used
---
```

---

## §9 Revision protocol

Nếu P2 L0 fail parity 2x → `revision: 1`, escalate executor L1, Architect patch phase notes.
