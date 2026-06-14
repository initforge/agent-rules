# Workflow Cases

## LOW direct edit

Trigger:
- typo
- docs
- simple UI text
- one-file obvious bug

Flow:

```text
classify LOW
-> inspect targeted file
-> edit
-> minimal verify
-> report
```

## MEDIUM planned execution

Trigger:
- feature or bug across 2-6 files
- clear scope but multiple modules
- scoped refactor

Flow:

```text
inspect
-> plan if multi-slice
-> implement slice
-> verify
-> evidence
-> next slice
-> final
```

## HIGH protected execution

Trigger:
- auth
- security
- payment
- database
- migration
- data deletion
- concurrency
- infra
- broad refactor

Flow:

```text
locked plan
-> risk register
-> reviewer gate
-> implement one slice
-> deep verify
-> pause/continue
```

## Research / crawl

Trigger:
- docs
- changelog
- external API
- library comparison
- latest best practices
- broad repo exploration
- independent second-pass review
- stalled bug fix that needs research before another patch
- platform integration docs

Flow:

```text
Codex switches to research mode
-> local context first
-> GitNexus when usable
-> web for latest/external facts
-> write research note
-> plan/decision
```

Reference:
- `docs/researcher-workflow.md`
- `docs/profile-matrix.md`

## UI QA

Trigger:
- visual flow
- browser behavior
- responsive issues
- form state coverage

Flow:

```text
Codex implements
-> local verify
-> browser or Playwright UI QA
-> review note if needed
-> Codex fixes
-> final verify
```

## Inventory update

Trigger:
- new tool installed
- new MCP configured
- new skill added
- new machine setup
- user asks to sync setup

Flow:

```text
run inventory-current-machine.ps1
-> update docs
-> sync-codex-to-p.ps1
-> final report missing items
```
