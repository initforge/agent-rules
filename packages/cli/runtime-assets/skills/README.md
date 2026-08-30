# Skills

Skills are lazy procedures. `SKILL.md` is the canonical source for each skill's
description, activation boundary, and workflow. The native router reads those
files through the generated context graph and selects them once per turn.

Rules own always-on behavior. Skills must not create model policies, worker
tiers, ticket systems, shadow plans, ledgers, or host-specific copies of global
behavior. Host differences belong in `platforms/`; explicit domain knowledge
belongs in `profiles/`; external tools belong in `integrations/`.

Add or change a skill only when it provides a concrete reusable procedure.
Prefer one cohesive file and load references only when the procedure genuinely
needs them. Build and focused routing tests prove reachability; installed copies
are generated projections and must not be edited by hand.
