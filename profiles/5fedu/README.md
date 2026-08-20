# 5fedu profile

Optional ERP/Admin domain pack. It is **inactive by default** and must be selected explicitly (`domain_pack: "5fedu"` or `--domain-pack 5fedu`). Prompt keywords such as `5fedu`, `drawer`, `listview`, or `ERP` never activate it on their own.

The owner-supplied canonical template is embedded once at `reference-source/template` with a deterministic source manifest. Target projects reference it through the harness; the template is never copied into those projects.

## Load only what the task needs

| Intent | Rule | Required outcome |
|---|---|---|
| ERP workflow, master-detail, approval, rollup, export, stats | `rules/business.md` | Model the actual linked workflow and verify it with real related data. |
| Schema, migration, Supabase, login, auth | `rules/data-auth.md` | Verify the active schema before changing it; never infer database facts from the template. |
| Permission, `cap_bac`, data scope, sidebar, RLS | `rules/permissions.md` | Preserve action rights and record scope across UI, service, and database. |
| Module/UI parity | `skills/5fedu-module-parity/` + `module-mapping/behavior-contract.json` | Follow exact source anchors and runtime evidence; do not mechanically copy unrelated modules. |

Employee is the canonical CRUD shell; Department is the canonical hierarchy/related-data shell; Permission Matrix is the permission-coverage reference. Exact fields, relations, actions, and visual claims remain source/runtime-derived.

`README.md` is the small always-loaded profile entry point. Detailed rules, mappings, and reference code stay lazy. Project-specific facts and decisions remain project-scoped and are never promoted globally.
