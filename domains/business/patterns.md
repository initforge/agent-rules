# ERP Business Patterns

**Scope:** Reusable across 5fedu ERP/admin projects.  
**Extraction rule:** Project-specific names (e.g., "tài xế", "vận tải") are generalized.  
**Evidence:** Validated across Tah-app (transport) and structural commonality with Nostime admin.

## 1. Shared Base Entity + Specialized Roles

When an entity serves as both a base profile and a specialized business role, do not split data into duplicate tables.

- Keep one data source for identity, contact, status, and audit.
- Specialized roles may use classification flags, link tables, or extension tables per spec.
- Specialized screens filter data by role and add separate business tabs/history.
- Deleting a specialized role = soft-delete or unlink per spec; not a physical delete of the base profile.
- Dropdowns/combo boxes for specialized roles should use filtered service/API data, not client-side filtering.

*Example: Employee is base profile; Driver is specialized role with trip history/payroll.*

## 2. Master-Detail and Nested Creation

Parent-child business flows must be treated as one linked data workflow, not two separate CRUDs.

- Detail of parent record must show related children when spec/database has a real relationship.
- Create/edit form for parent must support navigating to children or entering them inline.
- For batch create: use temporary state for children, save sequentially (insert parent → get ID → map FK → insert children).
- All FKs from children to parent must be filled and locked when opened from parent context.
- Verify with real data having multiple children; do not PASS just because parent CRUD works.

*Examples: parent ticket + line items; order + order lines; trip + trip details.*

## 3. Approval Workflow with Two Status Axes

Many business processes have both execution status AND approval status. Do not merge them into one field if the spec treats them separately.

- Execution status tracks business progress.
- Approval status tracks review/acceptance decisions.
- If approval is at parent level, define cascade to children or aggregate from children to parent.
- Approved/locked data must hide or disable edit/delete in UI and service for unauthorized users.
- Approval actions must go through the permission matrix, not inferred from regular edit permission.

*Example: Work items completed but parent ticket not yet approved.*

## 4. Derived Fields and Rollups

Aggregated or computed fields must not be hand-entered when source records exist.

- Totals/counts/status summaries must compute from source data or a committed trigger/service.
- Derived fields in UI should be read-only and show the computation source.
- After child CRUD, invalidate cache and verify parent, reports, exports, related dropdowns.
- Export/print/report uses the same computation source as UI.

*Examples: total amount, total quantity, completed count, total cost.*

## 5. Lookup Autofill

When a linked record has default configuration, forms must support auto-filling derived fields per spec.

- Look up linked data via service/API or standard lookup source.
- Only autofill fields confirmed by spec/source.
- Autofill fields may be overridable or read-only based on business rules.
- If lookup data is missing, show missing-data state; never fabricate values.

*Example: selecting a location auto-fills unit price/cost.*

## 6. Action Segregation and Confirmation

Data entry forms should only enter data. Business actions with side effects must be separate.

- Actions like approve, print, export, report, status change, cancel, lock/unlock must not be mixed into submit if they are separate workflows.
- Destructive or state-changing actions must have confirmation dialogs per project pattern.
- Toolbar/list/detail/mobile must share the same action visibility policy.
- No new actions without Pattern Fidelity Packet evidence.

## 7. Report, Print, Export Parity

Report/print/export are real business surfaces, not utilities.

- Exported files use the same filtered/computed data as UI.
- Excel must use real number types for numeric data.
- PDF Vietnamese text must use Unicode-supporting fonts verified with real output.
- Preview, print, and file export must share same company info, headers, data tables, and summaries.

## 8. Permission Scope Matrix

Permission includes both action rights AND data scope.

- Grant determines what the user can view/add/edit/delete/approve.
- Scope determines which records: all, department/group, own records, or other per spec.
- Admin role must not be the only test role.
- UI hidden/disabled state, service guard, and database/RLS policy must be verified consistently.

*Example: admin views all; manager views department; staff views own records.*

## 9. Organizational Baseline

For internal admin modules, do not treat each module as its own world.

- **Employee** is the baseline entity for CRUD, form, detail, toolbar, export, stats shell.
- **Department** is the parent organizational axis; default 2-level hierarchy unless spec confirms deeper.
- **Position** lives within the Department axis; create/edit/filter/grouping/permission scope uses Department as parent context.
- New internal admin modules → clone/adapt from Employee, change only business differences.
- Do not make Position an independent pattern, which breaks dropdowns, detail, filters, and org relationships.

## 10. Stats Shell Reuse

Statistics is a separate living pattern, not something each module draws from scratch.

- Module with statistics → reuse Employee stats shell: tab, toolbar filters, KPIs, chart, grid, drill-down, export report.
- Only replace source data, business labels, formulas, and permission scope.
- Do not insert temporary mini-stats into CRUD page if business needs a dedicated stats surface.
- Export/print stats uses the same filtered/computed data as UI stats.
