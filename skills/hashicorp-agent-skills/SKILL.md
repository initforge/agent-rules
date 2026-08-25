---
name: hashicorp-agent-skills
description: "Provenance projection for hashicorp/agent-skills (pinned 4451ceca, MPL-2.0): ROUTED on terraform/kubernetes facts; apply/destroy stay owner-approved."
metadata:
  signals: "terraform plan, terraform style guide, kubernetes module, vault policy"
  excludes: "apply-only"
  priority: "40"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# hashicorp-agent-skills

**Status:** MATERIALIZED_SKILL (provenance projection; skill-mcp-fabric-v1 AM-0002)
**Activation class:** ROUTED
**Content materialization:** MATERIALIZED

## Provenance (immutable lock)
- Source: https://github.com/hashicorp/agent-skills
- Pinned commit: 4451ceca5456e79cc776efee96a744f7ac96e5bf
- Tree (git-tree-sha1): a277c9357d9ec39a1b554a83e778475f88588567
- License: MPL-2.0 (LICENSE (pinned tree, Mozilla Public License 2.0))
- Security scan: .agent/evidence/skill-mcp-fabric-v1/provenance-scans/hashicorp-agent-skills — see .agent/evidence/skill-mcp-fabric-v1/provenance-scans/ (0 ELF binaries)
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status MATERIALIZED: license and scan evidence present.

## Use when
- Deterministic facts: terraform plan; terraform style guide; kubernetes module; vault policy.
- Activation is ROUTED — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove skills/hashicorp-agent-skills/ and revert candidate-fabric/catalog entries to the
  previous receipts; no external content was installed, so no uninstall is
  required.

## Eval status
- Benchmark: pending (WITH/WITHOUT ablation corpus, TASK-012);
  route precision recorded in ROUTE.json; acceptance stays kernel-owned.
