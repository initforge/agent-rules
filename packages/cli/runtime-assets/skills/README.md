# Skills

Skills are lazy concrete procedures. `SKILL.md` is the canonical source for
each selectable skill's description, activation boundary, and workflow. The
native router reads those files through the generated context graph and selects
them once per turn.

Rules own always-on behavior. Skills must not create model policies, worker
tiers, ticket systems, task history, or host-specific copies of global
behavior. The single Agent Rules-owned `.agent/current` may mirror the accepted
active plan/frontier; a new plan replaces it and explicit close removes it.
Host differences belong in `platforms/`; explicit domain knowledge
belongs in `profiles/`; external tools belong in `integrations/`.

Plans lock semantic change and preservation boundaries while implementation
skills retain local autonomy. Model switches require a cold-start-complete
native plan; blockers affect only dependent slices; terminal status comes from
implemented and proved acceptance, not completion prose.

Add or change a skill only when it provides a concrete reusable procedure.
External provenance and lifecycle belong in `registry/skills.yaml`. Active
upstream skills keep exact pinned folders; blocked/retired records are not
selectable. Only active implicit skills are globally projected by default;
explicit-only skills remain in the packaged canonical library and are projected
transactionally into a supported repository-local surface when selected by the
accepted task. Prefer one cohesive file and
load references only when the procedure genuinely needs them. Build and focused
routing tests prove reachability; installed copies are generated projections and
must not be edited by hand.
