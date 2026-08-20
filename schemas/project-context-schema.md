# Project Context Package Schema

**Purpose:** Define what a project-local context package must contain.  
**Routing:** Never auto-loaded. Read when creating or validating a project context.

## Required sections

A complete project context package (`projects/<name>/`) must include:

| Section | Required | Content |
|---|---|---|
| `README.md` | Yes | Project identity, stack, domain, install path |
| `decisions.md` | Yes | Project-specific owner decisions with status |
| `tech-deviations.md` | Recommended | Deviations from org-wide tech stack |
| `database-specs.md` | When DB differs | Project-specific tables, schemas, migrations |
| `routing.md` | When routes differ | Product-specific route map |
| `source-examples.md` | When spec exists | Source maps, sheet mappings, screenshots |
| `project-local/README.md` | Yes | Statement that installer never overwrites this |
| `project-local/` | Optional | Sheets, specs, E2E data — never synced |

## Decision status conventions

| Status | Meaning |
|---|---|
| `DA_CHOT` | Owner confirmed — use as implementation basis |
| `CHUA_CHOT` | Default / insufficient — ask before risky work |
| `CAN_HOI_THEM` | Missing data — record in open questions |

## Staleness detection

Each context package should track:
- `last_reviewed`: ISO timestamp
- `template_version`: Version of the template that last installed
- `source_commit`: Git hash of source files
