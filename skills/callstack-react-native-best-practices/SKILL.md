---
name: callstack-react-native-best-practices
description: "Provenance projection for callstack RN best practices (pinned 2766baa4, MIT): ROUTED on react-native facts."
metadata:
  signals: "react native best practices, react native migration, native module guidance"
  excludes: "web-only"
  priority: "40"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# callstack-react-native-best-practices

**Status:** MATERIALIZED_SKILL (provenance projection; skill-mcp-fabric-v1 AM-0002)
**Activation class:** ROUTED
**Content materialization:** MATERIALIZED

## Provenance (immutable lock)
- Source: https://github.com/callstackincubator/agent-skills
- Pinned commit: 2766baa46ca0fe7c16cc5ab4d0077ccec2e95fb9
- Tree (git-tree-sha1): 4fc1d02d24003c8120ae20b59dbd41ae5478753d
- License: MIT (LICENSE (pinned tree, MIT Callstack Incubator))
- Security scan: .agent/evidence/skill-mcp-fabric-v1/provenance-scans/callstack-react-native-best-practices — see .agent/evidence/skill-mcp-fabric-v1/provenance-scans/ (0 ELF binaries)
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status MATERIALIZED: license and scan evidence present.

## Use when
- Deterministic facts: react native best practices; react native migration; native module guidance.
- Activation is ROUTED — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove skills/callstack-react-native-best-practices/ and revert candidate-fabric/catalog entries to the
  previous receipts; no external content was installed, so no uninstall is
  required.

## Eval status
- Benchmark: pending (WITH/WITHOUT ablation corpus, TASK-012);
  route precision recorded in ROUTE.json; acceptance stays kernel-owned.
