# Model routing

Choose the least costly capable route; use capability rather than a fixed vendor taxonomy. Normal projects use the installed host `model-policy.json`; inside `agent-rules`, `automation/model-policy.json` is canonical source and fallback.

| Route | Typical work | Default |
|---|---|---|
| Economy | research, inventory, deterministic/mechanical edits, narrow checks | policy-resolved |
| Standard | normal implementation, planning, integration review | policy-resolved |
| Expert | architecture, adversarial review, concurrency/security/migration or repeated failure | policy-resolved |

Rules:

- The main agent selects route per slice and records the reason only when non-obvious.
- Escalate for a material unknown, two failed approaches, or an expert-risk signal; do not escalate for routine multi-file work.
- A reviewer is risk-triggered, not an automatic role. It must have read-only, independent scope and a concrete review question.
- Fail closed for denied choices. An unavailable allowed choice may use only a policy-allowed fallback and remains `PARTIAL` until resolved and observed.
