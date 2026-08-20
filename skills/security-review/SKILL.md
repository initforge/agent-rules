---
name: security-review
description: "Security review procedure from threat/change-surface claims: deterministic scans plus independent review; worker prose never creates a security PASS."
---
# security-review

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
- security claim; threat model; security review; vulnerability; auth boundary analysis; secret scanning.

## Capabilities
- code.search, filesystem.read, security.scan

## Provider mapping
- Providers resolved by the CapabilityBroker (registry.json / integrations);
  unavailable providers yield UNAVAILABLE/BLOCKED, never fabricated PASS.

## Rollback
- Remove this skill directory and its catalog/fabric entries; restore the
  previous route receipts.

## Eval status
- Route precision: high; WITH/WITHOUT ablation corpus: pending (TASK-012).
