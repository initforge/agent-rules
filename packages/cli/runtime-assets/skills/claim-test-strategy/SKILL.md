---
name: claim-test-strategy
description: "Cheapest-sufficient evidence planning: maps claims and risk to verifier capability and escalation; never test-count-as-proof."
metadata:
  signals: "claim-based testing, test strategy, verification plan, cheapest-sufficient evidence, proof level"
  excludes: "test-count-as-proof"
  priority: "50"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# claim-test-strategy

**Status:** materialized (skill-mcp-fabric-v1, AM-0002 full adoption)
**Activation class:** ROUTED (deterministic RepoFacts/TaskFacts; never keyword-only)

## Use when
- Deterministic repo/task facts for this domain are observed (see trigger facts).
- The claim/task actually requires this capability; smallest sufficient proof.

## Do NOT
- Do not activate from generic keywords (frontend/database/design/test/UI).
- Do not decide scope, completion, PASS or acceptance; kernel owns those.
- Do not bypass or skip verifiers; missing providers are BLOCKED/NEEDS_USER.

## Trigger facts (deterministic)
- claim-based testing; test strategy; verification plan; cheapest-sufficient evidence; proof level.

## Capabilities
- filesystem.read, browser.verify, code.search

## Provider mapping
- Providers resolved by the CapabilityBroker (registry.json / integrations);
  unavailable providers yield UNAVAILABLE/BLOCKED, never fabricated PASS.

## Rollback
- Remove this skill directory and its catalog/fabric entries; restore the
  previous route receipts.

## Eval status
- Route precision: high; WITH/WITHOUT ablation corpus: pending (TASK-012).
