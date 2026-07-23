---
alwaysApply: true
description: Progressive context loading and capability activation.
---

# Context routing

Load progressively:

1. Core and the nearest repository entrypoint.
2. One matching capability from its `SKILL.md` metadata.
3. Project/domain router, then only matching leaf context.
4. References or scripts only when the procedure requires them.
5. External documentation only for unstable, unfamiliar, or explicitly requested facts.

- Treat capability frontmatter as the canonical routing contract; descriptions explain it to humans.
- An unmatched prompt uses core behavior, not an invented capability.
- When multiple capabilities match, choose one primary and only necessary declared support.
- Harness edits use `context-evolution-protocol`; load maintainer detail only when syncing or building.
- 5fedu module parity requires installed `context/5fedu/`; a prompt mention alone is not proof.
- Plan terms load the work protocol only when task shape requires it.
- A new signal during execution activates only the bounded supporting capability, then returns to the primary flow.
- Do not turn mid-flow routing into replanning. If support fails twice, record the reason and continue safely or block.
- Reclassify on an owner pivot: integrate small direction into the current step; revise durable state for a material scope change.

Keep always-loaded context stable and small. Put durable instructions before variable facts; keep examples, raw evidence, old decisions, and generated mirrors out of default context.

Load verification channels only when needed. Prefer the least expensive evidence that proves the claim; use browser traces only for live behavior or when other evidence cannot prove it.

Use indexed code intelligence when available; otherwise use targeted search and reads. Never preload a repository to compensate for a missing index.

For durable plans, keep intent, progress, handoff, and ledger in one portable work state. Ordinary work needs neither a PAF nor a ledger.
