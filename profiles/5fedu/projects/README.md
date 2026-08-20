# 5fedu project compatibility material

This directory contains project overlays/history retained for older 5fedu installations. It is **not** the canonical source-access path for North-Star execution.

Canonical current behavior:

```text
agent-rules/profiles/5fedu/                 reusable pack
agent-rules/profiles/5fedu/reference-source manifest-bound ERP reference
active project                              project-specific truth
```

A target project does not need the template or shared pack copied into it. Activate `domain_pack: 5fedu` (or `--domain-pack 5fedu`) and read template code through the central `reference` / `reference-search` broker.

The historical installer and `context/5fedu/` layout remain compatibility-only for repositories that already use them. Project-local facts are never overwritten or inferred from the bundled template.

Known legacy project metadata lives in `known-repos.md`; it is not an allowlist for future projects.
