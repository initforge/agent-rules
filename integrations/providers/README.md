# integrations/providers — provider-neutral verification capability adapters

This directory holds the lifecycle adapters for the named verification
capabilities (REQ-009 / original.md §8). Each provider is a replaceable
capability edge: the harness routes by **logical capability class**, never by
hard-coded model/provider IDs, and a provider is activated **only** when an
actual claim needs it (claim-class driven), never globally.

## Model

Every adapter is a `manifest.json` binding:

- `capabilityClass` — the provider-neutral logical capability (e.g.
  `dependencies.ephemeral`, `contracts.consumer-provider`).
- `effect` — the canonical effect contract (`schemas/integration-effect.schema.json`):
  effect level, environment, approval, reversibility, network, credentials,
  bounded timeout, and provider evidence kind. Availability never grants
  authority.
- `prerequisites` — what must hold before activation.
- `health` — health proof command and expected exit codes.
- `timeout_ms` — bounded lifetime (inside `effect`).
- `rollback` — how a provider's effects are undone.
- `evidence_kinds` — evidence kinds this provider can produce (must exist in
  `automation/evidence-profiles.json`).
- `hosts` — host support (local host ids from `platforms/platform-contracts.json`;
  `ci` marks CI-only providers such as CodeQL).
- `claim_classes` — claim keywords that activate this provider.

## Failure semantics (invariants)

- A missing optional provider never becomes PASS: it yields explicit
  `UNAVAILABLE` evidence with a reason.
- Performance providers (k6) require explicit thresholds/SLO claims.
- Telemetry evidence (OpenTelemetry) never substitutes product acceptance.

Fixtures (positive / important negative / unavailable-recovery per provider)
live in `automation/verification-profiles.json` under `provider_adapters` and
are exercised deterministically by `automation/select-verification.py fixtures`.
