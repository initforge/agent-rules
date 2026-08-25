---
name: researcher
description: Use this skill for explicit research, latest/release/changelog documentation, unfamiliar external behavior or
  a bug stalled after repeated attempts. Do NOT trigger for ordinary comparison, local code reading, obvious fixes or a phased
  plan; use plan-and-handoff for the latter.
metadata:
  signals: "research, latest, release, changelog, external behavior, stalled, unfamiliar"
  excludes: "ordinary comparison, local code reading, obvious fix, phased plan"
  priority: "70"
  platform_scope: "all"
  source: ROUTE.json migrated

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

Web/browser research: use the active platform’s browser/MCP tools when available; otherwise CLI + docs tools.

## Output contract

Write `<working-repo>/.agent/research/<topic>.md` (gitignored):

- Summary
- Evidence
- Risks
- Recommendation
- Unknowns

End with **Hand to Plan Architect** — list items for the portable plan contract (assumptions / known-unknowns; see `plan-and-handoff/references/portable-plan-contract.md`). Research does **not** set execute tier — Architect assigns per phase.

## Do NOT load

`5fedu-module-parity`, `ui-delivery` unless research topic is ERP module UI parity.

## Escalation

- Large architecture → `plan-and-handoff` Architect after research
- Unresolved bug → use engine discovery/diagnosis before repair

## Related

- [`references/usage.md`](references/usage.md)
