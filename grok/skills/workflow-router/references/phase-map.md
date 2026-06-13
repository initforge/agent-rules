# Workflow Router Phase Map

## Main mapping

- plan -> planner -> gpt-5.5 medium
- research -> researcher -> gpt-5.4 medium
- implement -> implementer -> gpt-5.3-codex medium
- bugfix -> bugfixer -> gpt-5.4 medium
- stuck bug -> bugfixer-escalated -> gpt-5.5 medium
- review -> reviewer -> gpt-5.4 medium
- high-risk review -> reviewer-highrisk -> gpt-5.5 high

## Bug loop rule

If one or two direct fixes do not converge:
- stop patching
- switch to research
- gather local + external evidence
- return to bugfix or implement with a new note
