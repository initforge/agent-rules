# Codex Research Usage

## Good trigger examples

- "Research the latest official docs for this platform and tell me the safest integration path."
- "This bug is still weird after two fixes. Re-research local flow and external docs before touching code again."
- "Compare these two approaches and give me a recommendation with risks."
- "Review the release notes and list breaking changes relevant to this repo."

## Note path guidance

Preferred:
- `plan/<feature>/research/<topic>.md`
- `plan/<feature>/review/<topic>.md`

If no plan exists:
- create a temporary note in the workspace
- summarize the result back into chat

## Consumption rule

Do not let research sprawl forever.

Research should end with:
- a recommendation
- a risk summary
- the next action
