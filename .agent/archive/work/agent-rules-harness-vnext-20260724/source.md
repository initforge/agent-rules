# Source contract — agent-rules harness vNext

This file preserves owner intent for resume and agent allocation. It contains no credentials.

## Original requirements

- R01 — Remove overengineering and ceremony without weakening proven behavior.
- R02 — Every plan must be executable: repositories, modules, entities, interfaces, files, tests, review, rollback and handoff must be concrete.
- R03 — Match proof to the claim. Build success never proves UI parity or runtime behavior.
- R04 — Ask only meaningful questions that change scope, behavior, safety, authority or proof; discover repo facts without asking.
- R05 — Use MCP, terminal, indexing, test runners and browser tools deliberately; benchmark tools before promotion.
- R06 — Learn selectively from strong GitHub harnesses and other domains; do not import whole frameworks by default.
- R07 — Detect expert-risk signals such as deadlocks, races, distributed consistency, memory leaks, indexing and cache freshness without imposing them on ordinary CRUD.
- R09 — Keep the harness balanced, lean and flexible; protect context and token budgets with precise language.
- R10 — Prefer agent behavior and native automation; keep execution asynchronous and decentralized where work is truly independent.
- R11 — Shadow once, then remove duplicated or low-value mechanisms.
- R12 — Use each platform's native facilities and report unsupported/unobserved capabilities truthfully.
- R13 — Keep rules concise, standardized and placed in the correct context layer.

## Locked decisions from plan collaboration

- D01 — Every task uses Plan Mode or a native plan artifact; plan detail scales with the task while behavior remains strong.
- D02 — Long work uses a roadmap plus executable session slices; no default super-plan Stop coercion.
- D03 — Research and mechanical work prefer Luna; normal implementation uses Terra medium; Sol is reserved for genuinely hard architecture or review. Effort never exceeds high.
- D04 — The main agent owns owner intent, integration, final review and terminal status.
- D05 — Independent reviewers are risk-triggered, not mandatory for tiny changes.
- D06 — UI parity/runtime claims require live desktop/mobile and interaction proof when applicable.
- D07 — Native means equivalent behavioral outcome through host-native mechanisms; portable `.agent` state remains shared.
- D08 — Shadow lasts one benchmark cycle only.
- D09 — Quality is ground-truth behavior and false-PASS prevention, not self-reported PASS or build-only scoring.
- D10 — After the owner says "execute", the main agent automatically classifies size/risk, chooses agents/models/tools/ledger/proof, runs implementation-review-fix loops and continues until PASS or a genuine blocker.

## Execution-time injections

- I01 — Ledger is required for long/resumable work and must be detailed. Medium or small work may use it when coordination, proof, rollback or interruption risk justifies it.
- I02 — The user should be able to plan, say "execute", then wait for the final result without relaying phases or managing agents.
- I03 — Do not waste agent calls or context windows. Give each agent a bounded but substantial slice with exact ownership and evidence duties.
- I04 — Sub-agents are accountable to the main agent; the main agent remains accountable to the owner and the complete original request.
- I05 — The ledger must preserve source requirements and later injections, then map them proportionally into each agent context packet.

## Terminal contract

- Complete every feasible deliverable, validate with claim-matched evidence, review the integrated diff, commit and push when authorized.
- Report only `PASS`, `PARTIAL` or `BLOCKED`. A local blocker does not stop independent work.

