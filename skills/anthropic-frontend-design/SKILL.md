---
name: anthropic-frontend-design
description: "Provenance projection for Anthropic frontend-design (pinned f17010c9, Apache-2.0): activation on explicit design brief; content materialization license-gated."
metadata:
  signals: "frontend design contract, explicit design brief, intentional visual direction"
  excludes: "5fedu, ERP module, parity"
  priority: "45"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# anthropic-frontend-design

**Status:** MATERIALIZED_SKILL (provenance projection; skill-mcp-fabric-v1 AM-0002)
**Activation class:** ROUTED
**Content materialization:** MATERIALIZED

## Provenance (immutable lock)
- Source: https://github.com/anthropics/skills
- Pinned commit: f17010c9bb483898c1d9c9f42dde2b3a98889434
- Tree (git-tree-sha1): 0fe4c0c8372b239b13062036d08d05f79d4055a1
- License: Apache-2.0 (skills/frontend-design/LICENSE.txt (pinned tree))
- Security scan: .agent/evidence/skill-mcp-fabric-v1/provenance-scans/anthropic-frontend-design — see .agent/evidence/skill-mcp-fabric-v1/provenance-scans/ (0 ELF binaries)
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status MATERIALIZED: license and scan evidence present.

## Use when
- Deterministic facts: frontend design contract; explicit design brief; intentional visual direction.
- Activation is ROUTED — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove skills/anthropic-frontend-design/ and revert candidate-fabric/catalog entries to the
  previous receipts; no external content was installed, so no uninstall is
  required.

## Eval status
- Benchmark: pending (WITH/WITHOUT ablation corpus, TASK-012);
  route precision recorded in ROUTE.json; acceptance stays kernel-owned.
