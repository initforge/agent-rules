---
name: external-skill-governance
description: "Explicit governance workflow for adding external skills/providers: pin, hash, license, security review, permission review, eval, rollback before any materialization."
metadata:
  signals: "external source reference, skill addition request, provider addition, source governance, marketplace review"
  excludes: ""
  priority: "30"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# external-skill-governance

**Status:** materialized (skill-mcp-fabric-v1, AM-0002 full adoption)
**Activation class:** EXPLICIT (deterministic RepoFacts/TaskFacts; never keyword-only)

## Use when
- Deterministic repo/task facts for this domain are observed (see trigger facts).
- The claim/task actually requires this capability; smallest sufficient proof.

## Do NOT
- Do not activate from generic keywords (frontend/database/design/test/UI).
- Do not decide scope, completion, PASS or acceptance; kernel owns those.
- Do not bypass or skip verifiers; missing providers are BLOCKED/NEEDS_USER.

## Trigger facts (deterministic)
- external source reference; skill addition request; provider addition; source governance; marketplace review.

## Capabilities
- web, filesystem.read, owner.approval

## Provider mapping
- Providers resolved by the CapabilityBroker (registry.json / integrations);
  unavailable providers yield UNAVAILABLE/BLOCKED, never fabricated PASS.

## Rollback
- Remove this skill directory and its catalog/fabric entries; restore the
  previous route receipts.

## Eval status
- Route precision: high; WITH/WITHOUT ablation corpus: pending (TASK-012).
