# 5fedu module parity — references index

This index points the harness at the canonical mapping sources. None of
the references here is the source of truth on its own; the source of
truth is `profiles/5fedu/module-mapping/modules.yaml` and the
active project's parity packet.

- `modules.yaml` — canonical role mapping (CRUD baselines, surfaces,
  dependencies, source_repository pointers). Lives at
  `profiles/5fedu/module-mapping/modules.yaml`.
- `ui-contracts.md` — shell-level UI contract split between the
  reference shell owner and the variable-slot owner. Lives at
  `profiles/5fedu/module-mapping/ui-contracts.md`.
- Parity packet — the active project's per-module proof that the
  reference module is actually wired up. Lives under
  `.agent/parity-packets/` once an owner produces one.

## Failure modes the harness must surface

- The `shared-template` repository is BLOCKED until the owner supplies
  an accessible URL plus a 40-character commit and a deterministic
  tree SHA-256. The harness records this in
  `profiles/5fedu/module-mapping/modules.yaml` as
  `verification_state: BLOCKED` and refuses to claim parity.
- A bare `commit_sha: null` or `integrity_sha256: null` is the
  fail-closed default. Neither may be filled by inference from the
  vendored reference tree inside this harness worktree; that would
  attest the harness commit, not the upstream revision.