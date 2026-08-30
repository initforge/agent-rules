# Runtime schemas

Only externally consumed JSON contracts live here:

- `route-capsule.schema.json` — native turn routing output;
- `integration-effect.schema.json` — provider effect and approval metadata.

Internal TypeScript contracts are validated by typecheck and focused tests. The
harness does not publish schemas for native plans, tickets, ledgers, roles, model
routing, or shadow execution state.
