# 5fedu Reference and Sync Policy

**Purpose:** Define the canonical ownership boundary for 5fedu knowledge and source references.
**Routing:** Load only after the 5fedu domain pack is explicitly activated.

## Canonical ownership

- `profiles/5fedu/` inside the agent-rules installation owns reusable 5fedu rules, behavior contracts, source evidence, and the read-only reference template.
- The owner-supplied ERP template is stored once at `profiles/5fedu/reference-source/template` and is verified by `source-manifest.json` plus the source lock.
- A target repository owns its own schema, routes, decisions, credentials, data contracts, and implementation. These project facts stay in the target repository.

## Normal North-Star workflow

Do **not** install or copy the reference template into a target project.

1. Explicitly activate `domain_pack: 5fedu` or use `--domain-pack 5fedu`.
2. Read reusable rules from the harness.
3. Inspect authoritative template code through `agent-rules reference 5fedu <path>` or `agent-rules reference-search 5fedu <query>`.
4. Adapt only the behavior that is source-grounded and applicable to the active project's schema/spec.
5. Keep project-specific facts and decisions in the target repository.

The generic harness must remain usable when the 5fedu pack is inactive.

## Legacy compatibility

`automation/08-install-5fedu-context.ps1` and the historical `<repo>/context/5fedu/` layout remain only for older projects/hosts that still depend on that layout. They are **not** prerequisites for North-Star execution and must never copy `reference-source/template` into a project.

## Write-back

A reusable pattern discovered in a project may be promoted into `profiles/5fedu/domains/` only after review and cross-project validation. Project-specific data, credentials, decisions, and evidence are never promoted automatically.

`evidence/` and `archive/` are historical/reference material and are never automatic runtime context.
