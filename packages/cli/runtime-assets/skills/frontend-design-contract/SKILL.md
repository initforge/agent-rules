---
name: frontend-design-contract
description: "Frontend design-contract authoring and adherence: apply an approved project design contract or explicit design brief instead of generic UI defaults. Use when a design contract/brief exists; never from words like design/UI alone."
metadata:
  signals: "project design contract, design contract, design brief, brand identity direction, visual identity direction"
  excludes: "5fedu, ERP module, parity, drawer, listview, toolbar"
  priority: "35"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# frontend-design-contract

**Status:** materialized (skill-mcp-fabric-v1, AM-0002 full adoption)
**Activation class:** ROUTED (deterministic RepoFacts/TaskFacts) + EXPLICIT brief

## Use when
- A project design contract or explicit design brief exists in the workspace
  (`project-design-contract.md`, design brief, brand/visual identity
  direction).
- A frontend task must follow an existing visual identity instead of generic
  defaults.
- Creating or reviewing a design contract for a project.

## Do NOT
- Do not activate from words such as "design", "UI", or "frontend" alone.
- Do not act as a universal design-guru skill; the contract is the source.
- Do not decide PASS; browser/runtime acceptance stays with the verifier.

## Trigger facts (deterministic)
- `repo_facts: frontend stack detected` AND `design contract file exists`
- `task_facts: change_kinds contains design`
- `explicit: design brief in TaskPacket`

## Capabilities
`design.inspect`, `design.compose`, `browser.verify`, `filesystem.read`

## Provider mapping
- design contract authoring: harness-owned procedure
- visual verification: Playwright CLI (`browser.verify`)

## Conflict / removal
- Overlaps `frontend-architect` and `ui-taste`;
  precedence: an approved project design contract overrides generic
  frontend/taste defaults.
- Removal: only after design-contract routing and browser parity evidence.
