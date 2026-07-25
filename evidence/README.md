# Evidence

**Purpose:** Archival evidence — audit results, owner feedback, source examples.  
**Routing:** NEVER auto-loaded. Read only when explicitly requested for traceability.

## What evidence is for

Evidence is **historical reference material**, not living rules. It contains:
- Audit results (coverage, migration checklists)
- Raw owner feedback (before it's distilled into domain patterns)
- Source code examples (from screenshots, chats)
- Implementation verification records

## What evidence is NOT

- NOT a rule source — never use evidence content as decision authority
- NOT a template reference — never use evidence to determine UI/behavior
- NOT auto-loaded into context

## Promotion path

Evidence → (review + validate) → `domains/<domain>/` pattern

To promote evidence to a living pattern:
1. Identify the underlying reusable rule
2. Remove project-specific names and assumptions
3. Validate against a second project
4. Create the pattern in `domains/<domain>/`
5. Update this index to note the promotion

## Sync

Evidence is static in agent-rules. Never synced to project repos.
