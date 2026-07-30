# 5fedu activation

This profile is inactive unless one structured workspace fact is true:

- The repository has the explicit regular-file marker
  `.agent/profiles/5fedu.enabled`.
- The active project has the complete installed lean pack at
  `context/5fedu/README.md`, `behaviors/activation.md`, the three routed rule
  files, and the two module-mapping files. The README must identify the pack as
  `# 5fedu profile`.

The marker is an intentional profile activation and works even before a project
pack is installed. A missing directory, an empty or junk `context/5fedu/`, a
legacy `00-context-map.md` alone, symlinked files, or prompt wording such as
“5fedu” and “thiết lập 5fedu” is not activation evidence.

When active, load only the route that matches the current intent. Treat
`context/5fedu/` in the active project as the implementation source of truth;
canonical profile files are installer inputs, not project context.

The installed pack contains only `README.md`, routed rules, this behavior, and
module mapping. Project-owned facts may live under `context/5fedu/project-local/`
and survive managed updates. Global skills stay owned by the installed harness
and are never copied into project context.

The router consumes these filesystem facts before it evaluates graph signals;
signals select a route only after activation and never infer it. Therefore an
ordinary non-5fedu workspace remains isolated, ordinary 5fedu UI keeps its
existing context-node set without loading this behavior, and a setup request
loads this behavior only in an already active workspace.

If the managed pack is missing, stale, or fails this shape validation, mark the
5fedu route unverified and repair the installation before using its claims.
