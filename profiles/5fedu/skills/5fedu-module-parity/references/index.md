# 5fedu module-parity reference index

Load after the skill triggers, in this order:

1. `profiles/5fedu/module-mapping/modules.yaml` selects the reference role and declared dependencies.
2. `profiles/5fedu/module-mapping/ui-contracts.md`, `behavior-contract.json`, and `source-evidence.json` own shared shell/behavior invariants and their manifest-bound code pointers.
3. `profiles/5fedu/projects/source-lock.json` plus `reference-source/source-manifest.json` own the verified central snapshot identity.
4. The active project's schema/spec owns target-specific fields, routes, variable-slot values, business rules, and approved deviations.
5. The task's `parity/<module>/` packet is the worker's only target mapping authority.

Do not default-load historical archives, another project overlay, or an entire template checkout into the target. Read only the selected reference files/dependencies through `agent-rules reference` / `reference-search`; the central template is never materialized into the target merely to use the profile. A missing, stale, ambiguous, or unverified central source never falls back to a branch, screenshot, documentation, memory, or another application.

## Packet file contract

Create or update every file before a worker edits code. The packet lives with
the target work, not in the harness profile.

| File | Required record |
|---|---|
| `source.lock.yaml` | Central bundled-snapshot identity, source receipt/tree hash, manifest identity, and exact reference paths. |
| `target.yaml` | Module key, surfaces, target paths, and variable schema/spec source. |
| `structural-map.yaml` | Per-item `create`/`adapt`/`reuse` decision, nesting, and a route object keyed exactly by each canonical target route, plus state, data, and events. |
| `visual-contract.yaml` | A surface object keyed by canonical surface ID, with `shell_must`, alignment/responsive rules, and sourced variable-slot values. |
| `behavior-contract.yaml` | A surface object keyed by canonical surface ID, with required behavior, states, motion, responsive behavior, accessibility, and interaction flows. |
| `architecture-adaptation.yaml` | `preserve`, `adapt`, `must_not_copy`, target equivalents, and `accepted_deviations` object keyed by deviation ID. |
| `deviations.yaml` | Deviations object keyed by deviation ID, with affected invariants, rationale, and proof per entry. |
| `proof.yaml` | Packet integrity, `approved_deviations` object keyed by deviation ID, `target_surface_and_reference_paths` object keyed by surface ID, `variable_map_with_schema_or_spec_source` object keyed by variable slot, and executed structural, visual, behavioral, and architectural evidence. |

The packet validator requires these exact filenames and their corresponding
source-lock, target, structural-map, visual-contract, behavior-contract,
architecture-adaptation, and proof contracts. Preserve negative fixtures for
form validation, empty list/line item, and permission denial when the selected
surface exposes them.

## Canonical assets and proof gate

All packet contracts are canonical under this directory:

| Asset | Canonical path |
|---|---|
| Planner workflow | `workflow/planning-workflow.md` |
| Material-question policy | `questions/question-strategy.md` |
| No-vision worker contract | `contracts/no-vision-worker-contract.md` |
| Packet schemas | `schemas/` |
| Nhập hàng example and negative fixtures | `examples/nhap-hang/` |
| Executable packet gate | `validate-parity-packet.py` |

The canonical engine/Ajv runtime owns V3 document shape. Object-keyed identity
is the only form for routes, surfaces, behaviors, deviations, and proof records.

`structural-map.yaml.routes` is an object whose keys must exactly equal
`target.yaml.target_paths.routes`. Each key maps to a `routeDeclaration` with
`component`, `breadcrumb_label`, and optional `parent_path`, `guard`, and
`permission_key`. Object keys make duplicate route declarations
unrepresentable after duplicate-key-safe parsing.

`visual-contract.yaml.surfaces` is an object whose canonical kebab-case keys
must exactly equal `target.yaml.surfaces`. Each key maps to a
`surfaceDeclaration` with `shell_must`, `variables`, and
`responsive_breakpoints`. Duplicate surface declarations fail during
duplicate-key-safe parsing before schema validation.

`behavior-contract.yaml.behaviors` is an object keyed by canonical
kebab-case surface identity whose keys must exactly equal `target.yaml.surfaces`,
independent of mapping order. Every declaration retains non-empty
`behavior_must`, `states_must`, `motion_must`, and `responsive_must` lists;
accessibility and interaction flows remain optional closed records.

`architecture-adaptation.yaml.accepted_deviations` is an object keyed by
deviation ID whose declarations are validated against the canonical deviations
definition.

`deviations.yaml` is an object with a `deviations` member keyed by deviation
ID; each deviation carries `source`, `affected_surface`, `changed_invariant`,
`rationale`, `unchanged_invariants`, and `proof`.

`proof.yaml.approved_deviations` is an object keyed by deviation ID;
`target_surface_and_reference_paths` and
`variable_map_with_schema_or_spec_source` are objects keyed by surface and
variable-slot respectively.

Validate the packet with the canonical engine CLI after implementation:

```bash
npx @initforge/agent-rules-engine validate parity/<module>
```

The canonical engine/Ajv runtime owns JSON Schema shape authority for all 10
schemas, including object-keyed structural routes, visual surfaces, behavior
surfaces, deviations, and proof records. It also enforces cross-document
semantics: route-key equality across structural-map and target, surface-key
equality across visual/behavior and target, and deviation-key reconciliation
across architecture, deviations, and proof.

**Historical transitional note (retained for provenance):** During the staged
transition before ASN11, the Python validator `validate-parity-packet.py`
parsed the documented dependency-free YAML subset. It is now DEPRECATED
and retained only as a historical reference artifact. All validation is owned
by the canonical TypeScript engine.

`proof.yaml` must bind every evidence record to the exact source snapshot and
target commit. Structural, visual, behavioral, and architectural parity plus
browser interaction, accessibility, console, network, browser trace,
responsive states, keyboard, touch, reduced motion, permission-state matrix,
and independent revision verification must each occur exactly once with
`result: pass`, an artifact URI, and an artifact SHA-256. Worker and independent
verifier identities use distinct canonical scheme-qualified subject IDs and
explicit closed roles; display names or keyword matching never establish
independence. A worker receipt, screenshot, build result, stale revision, or
self-attestation alias is never enough.

## Planning, handoff, and repair

1. Verify the harness-bundled authoritative snapshot; inspect the complete selected reference file graph through the reference broker and the target route/feature.
2. Map shell separately from variable slots. Resolve uncertainty from source,
   target, inventory, or owner before handoff; planner-owned uncertainty is not
   implementable by a worker.
3. For a new module, reproduce the confirmed structural graph from the central source pointers into target-owned files, then adapt variables and domain logic. Do not vendor the template tree. For an audit, diff the target against the referenced source and transplant only missing shell fragments without overwriting live target business logic.
4. A worker receives the completed packet and must honor its mapping decisions,
   `must_not_copy` entries, target paths, and approved deviations. The worker
   cannot invent visual facts, alter a mapping decision, implement uncertainty,
   or add behavior outside the packet.
5. Validate packet and evidence after implementation. Reopen the packet when a
   proof dimension fails; do not declare parity from a worker summary.

## Required handoff report

Every completion report uses this exact order: `Status`, `Template
reference`, `Shell parity`, `Variable map`, `Pattern fidelity`, and
`Verification`, each linked to its packet record. For exploratory/user-flow
verification, add `qa-skills` and `browser-qa`; they add proof and never
replace source mapping or the packet.
