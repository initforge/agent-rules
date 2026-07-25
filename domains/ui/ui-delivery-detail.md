# UI Delivery — Navigation, Interaction, and Proof

**Scope:** Detail for surfaces beyond the core contract.  
**Source:** Extracted from `projects/5fedu/domains/references/ui-delivery-detail.md`.

## Navigation integrity

- "Ở đâu quay lại đó": after form/drawer/detail, return user to same list/filter/context.
- Route + sidebar + breadcrumb + guard + permission + module key are ONE linked change.
- New product route: register exact path in `getRouteConfig()` with full-diacritics label + `parentPath`.

## Motion, accessibility, responsive

- Reuse reference motion primitives. Every transition respects `prefers-reduced-motion`.
- Drawer/modal: focus trap, Escape close, focus restore, backdrop, dialog semantics, accessible submit/loading/error.
- Dangerous actions: always have danger confirmation.
- Check desktop AND mobile when surface has responsive behavior.

## Verification gates

1. **Static/local:** lint/typecheck/build/tests; check runtime imports, hooks, factory.
2. **Interaction:** add drawer, row-click detail, form validation, filter/dropdown, permission, mutation sync; check export file.
3. **Parity:** compare target vs template for shell/behavior/state/motion/responsive.
4. **Production (opt-in):** only when owner requires deploy proof.

Report: Template reference, Shell parity, Variable map, Pattern fidelity, Approved deviations, Verification.
