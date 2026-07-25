# Context Routing — Organization

**Purpose:** Routing rules for the new knowledge hierarchy.  
**Supersedes:** `profiles/5fedu/projects/00-context-map.md` for org-level routing.

## Routing table

| Path | Auto-load? | Trigger | Notes |
|---|---|---|---|
| `organization/` | Never | Org-level policy questions | Meta-conventions |
| `domains/ui/` | Yes | UI task detected | Surface, module, delivery patterns |
| `domains/database/` | Yes | DB/schema task | Conventions, auth |
| `domains/business/` | Yes | Business pattern task | ERP patterns |
| `domains/security/` | Yes | Permission task | RBAC, data scoping |
| `domains/delivery/` | Yes | Deploy/infra task | Tech stack, optimization |
| `projects/<name>/` | Yes | When project is active | Project-specific facts |
| `evidence/` | Never | Only explicit request | Archival |
| `archive/` | Never | Only explicit request | Historical |
| `schemas/` | Never | Only when building/validating | Meta-schemas |
| `generated/` | Never | Only when matching project active | Machine-generated |

## Project-specific routing

- `projects/tah-app/` loads only when working on Tah-app.
- `projects/nostime/` loads only when working on Nostime.
- Multiple projects are never loaded simultaneously.

## Staleness detection

Generated context in `generated/` includes a manifest (`generated_at`, `source_commit`, `version`).  
Router must check staleness before loading:

```text
if manifest.source_commit != HEAD of source:
    context is STALE → do not load, trigger regeneration
```
