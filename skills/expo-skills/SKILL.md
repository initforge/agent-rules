---
name: expo-skills
description: "Provenance projection for expo/skills (pinned dcff9e7, MIT): ROUTED on Expo project facts; never install all implicitly."
metadata:
  signals: "expo project, expo sdk, expo config plugin"
  excludes: "web-only"
  priority: "40"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# expo-skills

**Status:** MATERIALIZED_SKILL (provenance projection; skill-mcp-fabric-v1 AM-0002)
**Activation class:** ROUTED
**Content materialization:** MATERIALIZED

## Provenance (immutable lock)
- Source: https://github.com/expo/skills
- Pinned commit: dcff9e7cd61f79ee821e18b5b215d5585eaac441
- Tree (git-tree-sha1): d15f268235de3e9a4b6cc8aac963d0a423b6809c
- License: MIT (LICENSE (pinned tree, MIT 650 Industries))
- Security scan: .agent/evidence/skill-mcp-fabric-v1/provenance-scans/expo-skills — see .agent/evidence/skill-mcp-fabric-v1/provenance-scans/ (0 ELF binaries)
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status MATERIALIZED: license and scan evidence present.

## Use when
- Deterministic facts: expo project; expo sdk; expo config plugin.
- Activation is ROUTED — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove skills/expo-skills/ and revert candidate-fabric/catalog entries to the
  previous receipts; no external content was installed, so no uninstall is
  required.

## Eval status
- Benchmark: pending (WITH/WITHOUT ablation corpus, TASK-012);
  route precision recorded in ROUTE.json; acceptance stays kernel-owned.
