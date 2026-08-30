# 5fedu Knowledge Architecture

## Canonical layers

| Layer | Authority | Runtime role |
|---|---|---|
| `organization/`, `domains/`, `rules/` | agent-rules | Reusable 5fedu knowledge, explicit-only |
| `reference-source/template/` | owner-supplied, manifest-bound source | Read-only behavioral/visual reference |
| `module-mapping/source-evidence.json` | agent-rules + verified source | Behavior → exact code pointer binding |
| active project | target repository | Project schema, routes, decisions, data and implementation |
| `evidence/`, `archive/` | historical | Never automatic decision authority |

## Reference access

Target projects do not vendor the template. Workers use the harness broker:

```text
agent-rules reference 5fedu <manifest-bound-path>
agent-rules reference-search 5fedu <literal-query>
```

Every emitted reference is checked against the bundled source manifest. A changed/missing/extra source file or a stale behavior pointer fails closed.

## Project-local knowledge

Project-specific information stays in the active repository. It can live in that project's normal specs/configuration or, for an older repository, its legacy `context/5fedu/project-local/` area. The harness must not require that legacy folder.

## Promotion/write-back

Only reusable patterns may be promoted from a project into the shared 5fedu domain knowledge, after review. Project-local decisions, credentials, live evidence, and app-specific schema are never automatically synced into the harness.

## Legacy installer

The old `08-install-5fedu-context.ps1` flow remains for backward compatibility. It is not the canonical North-Star activation or reference mechanism and must never be used to copy the bundled ERP source into target repositories.
