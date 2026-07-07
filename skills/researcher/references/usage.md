# Researcher Usage

## Good trigger examples

- "Research the latest official docs for this platform and tell me the safest integration path."
- "This bug is still weird after two fixes. Re-research local flow and external docs before touching code again."
- "Compare these two approaches and give me a recommendation with risks."
- "Review the release notes and list breaking changes relevant to this repo."

## Note path guidance

Preferred:
- `<working-repo>/.agent/research/<topic>.md` (gitignored)

If no durable path is appropriate:
- summarize the result in chat with Evidence / Risks / Recommendation / Unknowns

## Consumption rule

Do not let research sprawl forever.

Research should end with:
- a recommendation
- a risk summary
- the next action
- **Hand to Plan Architect** — items for PAF §5 (see `plan-and-handoff/references/plan-artifact-template.md`)
