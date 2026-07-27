# 5fedu business rules

Route for ERP workflows: master-detail, approval, rollups, lookup autofill,
business actions, reporting, organization modules, or statistics.

1. Keep one base entity for shared identity/contact/status/audit; implement a
   specialised role by a flag, relation, or extension approved by the spec.
   Deleting that role must unlink or soft-delete it, not erase a still-used base
   record. Role lookups come filtered from the service/API.
2. Treat parent and children as one workflow. Fill and lock child foreign keys
   in parent context; for a batch create, persist parent, map its ID, then save
   children. Verify using a parent with multiple real children.
3. Keep execution status and approval status separate when the source does.
   Define parent/child cascade or aggregation, and enforce approved/locked
   state in both UI and service. Approval is its own permission, never edit by
   inference.
4. Compute totals, counts, and summaries from source records or an approved
   trigger/service. Show derived fields read-only, invalidate related cache
   after child CRUD, and use the same source for UI, reports, print, and export.
5. Autofill only fields confirmed by the linked record and source; declare
   override/read-only behavior. Missing lookup data is a visible state, never a
   fabricated value.
6. Keep side-effecting actions (approve, export, print, status change,
   cancel, lock) separate from data-entry submit, confirmed where required,
   and consistently visible across list, toolbar, detail, and mobile surfaces.
7. Treat report, print, and export as business surfaces: preserve filtered and
   computed data, numeric Excel types, Vietnamese Unicode PDF output, and the
   same company/header/summary contract as the UI.
8. For internal administration, use Employee as the CRUD/detail/stats shell;
   Department is the parent organizational axis (two levels unless the spec
   says otherwise), and Position stays within that axis. Reuse the Employee
   statistics shell rather than inventing a mini-dashboard.

Apply the permission scope matrix from `rules/permissions.md`; test more than
an administrator account.
