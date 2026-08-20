# 5fedu activation

The 5fedu domain pack is **explicit-only**. It becomes active only from a
structured project/runtime fact, never from prompt wording:

- `.agent/northstar.json` sets `domain_pack` to `5fedu`;
- the current run passes `--domain-pack 5fedu`; or
- the repository has the explicit regular-file marker
  `.agent/profiles/5fedu.enabled` for legacy/profile-aware hosts.

The authoritative ERP reference source remains inside the installed harness at
`profiles/5fedu/reference-source/template`, protected by its manifest and source
receipt. Target repositories do not install/copy that template. Workers read it
through `agent-rules reference 5fedu <path>` / `reference-search`.

A legacy lean `context/5fedu/` install is supported only for older host routing
and project-local overlays; it is not required by North-Star execution and is
not an implementation source of truth. Project-owned facts may still live under
`context/5fedu/project-local/`, but shared behavior/source pointers resolve from
the central harness pack.

Signals select a route only **after** explicit activation. A missing directory,
an empty/junk context folder, a remote URL, or words such as `5fedu`, `drawer`,
`listview`, `ERP` are never activation evidence.
