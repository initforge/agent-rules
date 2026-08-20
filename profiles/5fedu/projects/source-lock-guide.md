# 5fedu source-lock guide

The canonical 5fedu template is stored **once inside the agent-rules installation** at `profiles/5fedu/reference-source/template`. Target projects do not install, copy, or vendor that template.

## Default bundled source

`profiles/5fedu/projects/source-lock.json` is a verified `bundled-snapshot` receipt containing the owner-supplied archive digest, a deterministic 446-file tree digest, and the manifest path. Before implementation or parity claims, the runtime recomputes the exact file set, byte sizes, and SHA-256 values. Any drift fails closed.

A project opts in explicitly with `domain_pack: "5fedu"` (or CLI `--domain-pack 5fedu`). The harness resolves the pack from its own installation via the explicit harness root, `AGENT_RULES_HOME`, or module location. The active project does not need `profiles/5fedu/` or the reference source on disk.

## Authority order

1. Active project requirements, schema, API, and runtime behavior decide what the project actually needs.
2. Owner-authored 5fedu behavior contracts constrain the known ERP patterns.
3. The bundled template provides source-backed implementation/visual references by exact path.
4. Reference code is evidence and a pattern library, **not** a feature inventory to copy mechanically.

Visual-parity claims still require browser/runtime evidence from the active project. A verified source snapshot alone cannot prove that the rendered target UI matches.

## Validation

```text
node automation/validate-5fedu-domain-pack.mjs --require-source
```

The legacy PowerShell materializer remains for Git-based source-locks. When the lock is `bundled-snapshot`, it only validates and returns the central reference path; it never creates a project-local source cache.

```powershell
automation/14-materialize-template-source.ps1 -ProjectRoot <project>
```

## External Git source-locks

Other/private revisions may still use `sourceKind: "git"` with an exact 40-character commit SHA and deterministic integrity digest. Network fetch remains opt-in. Unverified or stale Git receipts may support planning, but implementation/parity remains BLOCKED until verified.
