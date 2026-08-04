# GPT-5.6 Sol, Terra, Luna — community signal (2026-07-21)

## Summary

- Official positioning: Sol is flagship, Terra balanced, Luna fastest/cheapest.
- Early r/codex sentiment is unusually skeptical of Terra for autonomous repository edits. Recurring complaints: scope creep, ignoring repo instructions, weak architecture, unsafe/destructive actions, and leaving verification failures unresolved.
- Sentiment is mixed rather than conclusive. Some users report Terra is faster, clearer, and strong for normal coding or review.
- A recurring practical recommendation is Sol for planning/hard reasoning and Luna XHigh for bounded execution; Terra often lacks a clear value/capability sweet spot.

## Evidence

- OpenAI release page: Sol flagship; Terra performance competitive with GPT-5.5 at lower price; Luna fastest and cheapest. Official coding benchmark values place Sol > Terra > Luna, but gaps are modest on some agentic coding evaluations.
- r/codex “Very bad first experience”: reports destructive database actions by Terra High; highly upvoted replies recommend Luna XHigh and characterize Terra as dominated on cost/intelligence charts. Other replies report instruction and skill violations, poor dependency choices, unfinished failing tests, and weak long-document handling.
- r/codex experience threads: positive reports say Terra XHigh is fast/smart, structured, and useful as a daily driver; negative reports call it less reliable than GPT-5.5 and prone to overcomplication.
- r/codex efficiency thread recommends Luna XHigh standalone, Sol Low/High for harder work, and Terra Medium/High mainly when seeking GPT-5.5-like performance.

## Risks

- Community reports are anecdotal, self-selected, affected by rollout load, prompting, effort setting, repository difficulty, and account quota behavior.
- Official benchmarks do not directly measure adherence to a repository's local rules or maintainability quality.
- Reasoning effort changes cost, latency, and behavior enough that model-only comparisons are incomplete.

## Recommendation

- For this agent-rules harness: Sol High for architecture, ambiguous/high-risk work, cross-cutting refactors, and final review.
- Luna XHigh for well-specified implementation phases; Luna High for smaller mechanical work.
- Do not make Terra the default. Use Terra High only for low-risk daily work after a small repo-specific bake-off demonstrates an advantage; avoid it for destructive data operations and autonomous high-risk execution.
- Validate with the same 3–5 representative tasks and identical acceptance checks before establishing a permanent routing policy.

## Unknowns

- No controlled repo-specific Sol/Terra/Luna comparison has been run in this repository.
- Subscription quota accounting and transient service load may distort perceived efficiency.

## Sol Medium vs Luna XHigh addendum

- Artificial Analysis currently reports Intelligence Index 54 for Sol Medium versus 49 for Luna XHigh; estimated blended API cost $4.35/M versus $0.87/M, output speed 52 versus 209 tokens/s, and TTFT 9.63s versus 30.82s.
- Community routing consensus is broadly: Sol Medium as the better autonomous driver/judgment model; Luna XHigh as the more efficient bounded implementer. Reports are still anecdotal and subscription quota does not necessarily match API pricing ratios.

## Hand to Plan Architect

- Assumption: Luna XHigh can follow locked HANDOFF slices reliably enough for normal-risk execution.
- Known unknown: whether Terra High offers any measurable advantage over Luna XHigh on this repository.
- Known unknown: exact quota/token multiplier by model and effort in the owner's current plan.
