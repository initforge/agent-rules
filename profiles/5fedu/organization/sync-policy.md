# 5fedu Sync Policy

**Purpose:** Rules for syncing context between agent-rules (canonical) and project repos.  
**Routing:** Never auto-loaded. Read when managing context state.

## Canonical source

`P:\agent-rules` is the single source of truth for organization conventions and domain patterns.

## Install to project (one-way)

`automation/08-install-5fedu-context.ps1` copies from agent-rules to project repos:

- `organization/*` → project `<repo>/context/5fedu/organization/`
- `domains/*` → project `<repo>/context/5fedu/domains/`
- `schemas/*` → project `<repo>/context/5fedu/schemas/`
- `projects/<profile>/` overlay → project `<repo>/context/5fedu/`

**Never overwrites:** `project-local/` in any project repo.

## Write-back to canonical (from project repos)

When a domain pattern is fixed in a project repo:

1. Determine if the fix is a generic pattern or project-specific.
2. Generic pattern → write-back `domains/<domain>/` to agent-rules.
3. Project-specific → keep in `project-local/`.
4. Run `automation/10-export-5fedu-writeback.ps1` for reviewed changes.
5. Run `03-validate-context.ps1` after write-back.

**Forbidden write-back targets:**
- `project-local/` from any project → agent-rules
- `evidence/` → promoted directly to `domains/` without review
- `organization/` → from project repo (org is canonical only)

## Archive and evidence

- `archive/` and `evidence/` are never synced to project repos.
- They exist only in agent-rules for historical reference.
- Evidence can be promoted to `domains/` after review and validation.
- Archive content is NOT promoted automatically.
