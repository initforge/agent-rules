# Reusable Domain Patterns

**Purpose:** Domain-specific patterns reusable across multiple 5fedu projects.  
**Routing:** Auto-loaded when the matching domain trigger is detected.  
**Sync:** Canonical in agent-rules, one-way sync to project repos.

## Domains

| Directory | Scope | Trigger phrases |
|---|---|---|
| `ui/` | UI surfaces, delivery gates, module mapping | module, giao diện, UI, surface, form, list |
| `database/` | DB conventions, auth, schema rules | bảng, cột, migration, schema, RLS, trigger |
| `business/` | ERP business patterns | master-detail, duyệt, rollup, nghiệp vụ |
| `security/` | Permissions, RBAC, data scoping | phân quyền, permission, cap_bac |
| `delivery/` | Tech stack, deploy, infra | template, deploy, stack, build |

## Extraction rule

Every pattern here must:
1. Be identified as a reusable pattern (not project-specific).
2. Have project-specific names/routes/tables removed.
3. Be validated against at least one other 5fedu project.
4. Include scope and evidence of cross-project validity.

## What does NOT belong here

- Organization-wide conventions → `organization/`
- Project-specific facts → `projects/<name>/`
- Historical evidence → `evidence/`
