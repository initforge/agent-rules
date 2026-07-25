# UI Parity and Delivery Gates

**Scope:** All 5fedu projects using the shared UI template.  
**Source:** Extracted from `projects/5fedu/domains/ui-delivery.md`.

## Vocabulary

| Term | Meaning |
|---|---|
| **Surface** | A user-facing interaction with its own lifecycle (CRUD list, form drawer, etc.) |
| **Shell** | Chrome, layout, primitives, behavior, state, motion, responsive from reference |
| **Variable slot** | Business content: fields, filters, columns, KPIs, actions from project schema |
| **Reference** | Local template code verified to match surface + behavior |
| **Parity packet** | Evidence: template identity, surface map, shell/state/motion map, variable map, deviations, verification |

## Local-template workflow

1. Find template in workspace using inventory anchors (package identity, `features/he-thong/nhan-vien`, `GenericToolbar`, `GenericDrawer`).
2. Record template identity + Git commit (or deterministic anchor hash).
3. Map shell (behavior, state, motion, responsive) and variable slots (from project schema/spec).
4. Apply clone or audit checklist from `domains/ui/module-mapping.md`.

## Decision precedence

1. Custom behavior approved by owner/spec
2. Schema/spec for variable business content
3. Verified local template for shell/behavior/state/motion/responsive
4. Compatible app primitive when template lacks the behavior

## Deviation rule

Default: exact reference fidelity outside variable slots.  
Custom requires explicit owner or spec approval.  
A project custom NEVER becomes a domain rule without a separate context decision.

## Delivery gates

- New/edit module: load matching inventory entry → clone or audit per `module-mapping.md`.
- User reports deviation: audit all related surfaces, not just the reported control.
- No generic monolith to bypass feature structure.
- PASS requires: complete parity packet + lint/typecheck/build/tests + interaction check.
