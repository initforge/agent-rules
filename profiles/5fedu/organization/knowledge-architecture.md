# 5fedu Knowledge Architecture

**Purpose:** Explain the new information hierarchy. This document answers:
- What is canonical vs generated?
- What is evidence for?
- What is project context for?
- When is reverse sync allowed?
- Why archive is not runtime context?

## What is canonical?

The following directories in agent-rules are the single source of truth:

| Directory | Canonical for | Owner |
|---|---|---|
| `organization/` | Org-wide conventions | 5fedu org maintainer |
| `domains/` | Reusable domain patterns | Domain experts |
| `rules/`, `guides/` | Agent-rules core | Harness maintainer |

## What is generated?

`generated/` contains machine-generated context packages. They:
- Are never hand-edited
- Identify their source files and version
- Can be detected as stale
- Are safe to delete and regenerate

## What is evidence for?

`evidence/` holds historical reference material:
- Audit results (coverage checks, migration checklists)
- Raw owner feedback before it's distilled into patterns
- Source code examples from screenshots/chats
- Implementation verification records

Evidence is NEVER:
- A rule source (never use as decision authority)
- Auto-loaded into context
- Synced to project repos

## What is project context for?

`projects/<name>/` holds facts specific to one project:
- Project-specific decisions and open questions
- Database schemas that deviate from domain conventions
- Route maps unique to the project
- Module tables that only exist in this project

## What is archive for?

`archive/` preserves historical project data:
- Completed project overlays
- Stale or superseded content retained for traceability

Archive is NOT runtime context because it:
- Contains superseded facts
- Has project-specific names that no longer apply
- Has not been validated against current state

## When is reverse sync allowed?

| Direction | Allowed? | Conditions |
|---|---|---|
| agent-rules → project repos | Yes | Via `08-install-5fedu-context.ps1` |
| project repos → agent-rules | Limited | Only domain patterns via `10-export-5fedu-writeback.ps1` |
| project-local → agent-rules | Never | Project-local is never synced up |
| evidence → domains | After review | Must validate as cross-project pattern first |
| archive → runtime | Never | Archive is final; patterns extracted separately |

## Sync ownership

| Layer | Source of truth | Sync direction |
|---|---|---|
| `organization/` | agent-rules | One-way to projects |
| `domains/` | agent-rules | One-way to projects |
| `projects/<name>/` | agent-rules (shared) + repo (project-local) | Two-tier: template overwrites shared, never project-local |
| `evidence/` | agent-rules | Static |
| `archive/` | agent-rules | Static |
