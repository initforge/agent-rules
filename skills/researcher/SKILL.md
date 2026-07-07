---
name: researcher
description: Use this skill when Codex needs structured research before coding or while a bug fix is stalled. Trigger for latest docs, release notes, changelog review, external platform behavior, codebase exploration, option comparison, source-backed decision support, or difficult bug fixes that need repo facts plus external documentation before another implementation attempt. Do NOT use when user wants a phased implementation plan — use plan-and-handoff Plan Architect instead.
---

# Researcher

Research layer — facts, compare options, research note **before** implementation plan or code.

## Trigger

Use when:
- user asks to research or compare
- latest docs or platform behavior matters
- bug loops without resolution
- decision needs evidence before coding

Do NOT use when:
- user wants phased plan / PAF → `plan-and-handoff` path A
- tiny local edit with obvious context
- final code patch ownership (hand off after note)

## Research order

1. `rg` and targeted local reads
2. Codebase Memory MCP when usable
3. `web` for latest or external facts

**Antigravity:** preferred platform for web/browser research when available.

## Output contract

Write `<working-repo>/.agent/research/<topic>.md` (gitignored):

- Summary
- Evidence
- Risks
- Recommendation
- Unknowns

End with **Hand to Plan Architect** — list items for PAF §5 (Assumptions / Known-unknowns). Research does **not** set execute tier — Architect assigns per phase.

## Do NOT load

`5fedu-module-parity`, `ui-delivery` unless research topic is ERP module UI parity.

## Escalation

- Large architecture → `plan-and-handoff` Architect after research
- Unresolved bug → `implementation-discovery` when implementing

## Related

- [`references/usage.md`](references/usage.md)
