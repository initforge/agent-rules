# 5fedu UI contracts

This file owns shared UI parity intent. `modules.yaml` selects a reference role;
the active project schema/spec owns business variables; a parity packet binds
both to one verified source receipt.

## Source and adaptation boundary

The shared shell may be adapted only from the selected authoritative source
after its source receipt is verified. For the canonical 5fedu pack, that source
is the manifest-bound snapshot stored once in the harness and read through the
reference broker; target projects do not copy or install the template. The
receipt pins artifact identity, exact tree integrity, selected paths, and file
hashes. An absent, stale, ambiguous, or blocked receipt stops implementation
and parity claims; a remote URL, screenshot, documentation, or memory is not an
alternative. The task packet records structural mapping, accepted deviations,
and `must_not_copy`; target-native business architecture remains target-native.

## Shell versus variable slots

Shell parity is mandatory for the selected surface: navigation placement,
layout, shared primitives, interaction order, loading/error/empty states,
responsive behavior, keyboard behavior, motion, and accessibility. A variable
slot is module-specific: fields, defaults, labels, filters, columns, KPI keys,
status mapping, export transform, relation source, and allowed business action.
Copy the shell only after source verification. Derive every variable slot from
the active project schema/spec, never from an unrelated reference module.

## Shared interaction contracts

- A CRUD list keeps Back, search/filter/reset on the left and permitted
  column/import/export/create actions on the right; row click opens its detail
  drawer and toolbar filters are not form comboboxes.
- Form and detail drawers use a titled, sectioned, responsive layout and a
  sticky action footer. A form has validation/submission/error states; detail
  actions remain permission-gated and keep the list in sync after mutation.
- Row actions keep one visible permitted primary edit action, place secondary
  actions in overflow, and separate destructive actions before confirmation.
- Real hierarchy preserves ancestry and parent context. Embedded children stay
  scoped to that parent and invalidate parent summaries after mutation.
- A stats/report surface is explicit: only approved KPI, chart, drill-down,
  and export behaviors are present. It is not a substitute dashboard.
- A singleton setting is load/save for one record, not a disguised CRUD list.
- A route update changes the host route, sidebar hierarchy, module registry,
  route guard, permission matrix, and exact Vietnamese breadcrumb together.

## Permission and data-scope contract

The visible shell, route/service guard, and database policy must agree. Keep
`Xem`, `Thêm`, `Sửa`, `Xóa`, `Quản trị`, and `Tất cả` distinct; approval is not
inferred from edit. Navigation and the permission matrix mirror the visible
subsystem → group → module hierarchy. Apply the active project's `cap_bac` and
row-scope policy to list, detail, mutation, report, export, and child surfaces;
client visibility never substitutes for an authenticated database policy.

## Proof contract

Every parity packet supplies independent evidence in all four dimensions:

| Dimension | Required proof |
|---|---|
| Structural | Source-to-target component, route, data, state, and ownership map. |
| Visual | Selected shell invariants, variable-slot values, responsive screenshots or deterministic visual checks. |
| Behavioral | User flows, loading/error/empty states, permission states, mutation refresh, destructive confirmation. |
| Architectural | Target-native service/schema/state boundaries, explicit `must_not_copy`, and approved deviations. |

Required evidence also covers browser interaction and browser trace, desktop
and touch flow, keyboard/focus flow, reduced motion, responsive behavior, a
non-admin permission case, console/network errors, and every project-specific
condition that affects the selected module. An independent verifier must bind
the evidence to the exact source revision and target revision; a worker receipt
cannot attest itself. A missing source receipt, variable source, proof
dimension, packet, or revision-bound independent verification yields
`BLOCKED`/`PARTIAL`, never parity `PASS`.

## Project conditions

Tah-app transport behavior is loaded only from its active project-local
context. Nostime luxury-retail behavior is loaded only from its active
project-local context. Neither changes the shared shell contract or becomes a
default mapping for the other project.
