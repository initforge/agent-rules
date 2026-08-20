---
name: trail-of-bits-security
description: "Provenance projection for trailofbits/skills (pinned 304c81a8, CC-BY-SA-4.0): EXPLICIT security route on matching threat surface."
---
# trail-of-bits-security

**Status:** MATERIALIZED_SKILL (provenance projection; skill-mcp-fabric-v1 AM-0002)
**Activation class:** EXPLICIT
**Content materialization:** MATERIALIZED

## Provenance (immutable lock)
- Source: https://github.com/trailofbits/skills
- Pinned commit: 304c81a8cefb6e3c029ebd0d12940ccf0713eccb
- Tree (git-tree-sha1): 3eafe5afe83163d3ca1d47e92cc168f570a07ff2
- License: CC-BY-SA-4.0 (LICENSE (pinned tree, Attribution-ShareAlike 4.0))
- Security scan: .agent/evidence/skill-mcp-fabric-v1/provenance-scans/trail-of-bits-security — see .agent/evidence/skill-mcp-fabric-v1/provenance-scans/ (0 ELF binaries)
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status MATERIALIZED: license and scan evidence present.

## Use when
- Deterministic facts: trail of bits; security specialist review; security specialist skill.
- Activation is EXPLICIT — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove skills/trail-of-bits-security/ and revert candidate-fabric/catalog entries to the
  previous receipts; no external content was installed, so no uninstall is
  required.

## Eval status
- Benchmark: pending (WITH/WITHOUT ablation corpus, TASK-012);
  route precision recorded in ROUTE.json; acceptance stays kernel-owned.
