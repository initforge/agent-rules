---
name: impeccable
description: "Provenance projection for pbakaus/impeccable (pinned c8f476b3, Apache-2.0): EXPLICIT activation only; effectful hook-aware install."
---
# impeccable

**Status:** MATERIALIZED_SKILL (provenance projection; skill-mcp-fabric-v1 AM-0002)
**Activation class:** EXPLICIT
**Content materialization:** MATERIALIZED

## Provenance (immutable lock)
- Source: https://github.com/pbakaus/impeccable
- Pinned commit: c8f476b330395031bc8f7a7aee8d848bc85c81e4
- Tree (git-tree-sha1): 4379c1abeecd7eb0046eb86e20c466a7b4115371
- License: Apache-2.0 (LICENSE (pinned tree, Apache License 2.0))
- Security scan: .agent/evidence/skill-mcp-fabric-v1/provenance-scans/impeccable — see .agent/evidence/skill-mcp-fabric-v1/provenance-scans/ (0 ELF binaries)
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status MATERIALIZED: license and scan evidence present.

## Use when
- Deterministic facts: impeccable review; impeccable install.
- Activation is EXPLICIT — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove skills/impeccable/ and revert candidate-fabric/catalog entries to the
  previous receipts; no external content was installed, so no uninstall is
  required.

## Eval status
- Benchmark: pending (WITH/WITHOUT ablation corpus, TASK-012);
  route precision recorded in ROUTE.json; acceptance stays kernel-owned.
