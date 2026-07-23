# Model routing

Choose the least costly capable route; use capability rather than a fixed vendor taxonomy.

| Route | Typical work | Default |
|---|---|---|
| Economy | research, inventory, deterministic/mechanical edits, narrow checks | Codex Luna when available; otherwise cheapest capable model |
| Standard | normal implementation, planning, integration review | Codex Terra at medium effort |
| Expert | architecture, adversarial review, concurrency/security/migration or repeated failure | Codex Sol at medium effort; high only when the risk demands it |

Rules:

- Effort is capped at `high`.
- The main agent selects route per slice and records the reason only when non-obvious.
- Escalate for a material unknown, two failed approaches, or an expert-risk signal; do not escalate for routine multi-file work.
- A reviewer is risk-triggered, not an automatic role. It must have read-only, independent scope and a concrete review question.
- If a named model is unavailable, select the closest available route and say so only if it affects outcome or cost.
