---
name: vercel-agent-skills
description: "Provenance projection for vercel-labs/agent-skills (pinned b8caa260): ON_DEMAND guidance pack; content BLOCKED until owner license determination."
---
# vercel-agent-skills

**Status:** MATERIALIZED_SKILL (provenance projection; skill-mcp-fabric-v1 AM-0002)
**Activation class:** ON_DEMAND
**Content materialization:** BLOCKED

## Provenance (immutable lock)
- Source: https://github.com/vercel-labs/agent-skills
- Pinned commit: b8caa260a420a73042e35521de4b5c8baf6446cc
- Tree (git-tree-sha1): 96a7470a8c0eb61db3438ec489da261b7b9eedf8
- License: unresolved (no LICENSE file in pinned tree)
- Security scan: .agent/evidence/skill-mcp-fabric-v1/provenance-scans/vercel-agent-skills — see .agent/evidence/skill-mcp-fabric-v1/provenance-scans/ (0 ELF binaries)
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status BLOCKED: no license file exists in the pinned tree; content materialization requires owner legal determination (unblock action: owner license decision).

## Use when
- Deterministic facts: vercel agent skills; react-best-practices; web-design-guidelines.
- Activation is ON_DEMAND — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove skills/vercel-agent-skills/ and revert candidate-fabric/catalog entries to the
  previous receipts; no external content was installed, so no uninstall is
  required.

## Eval status
- Benchmark: pending (WITH/WITHOUT ablation corpus, TASK-012);
  route precision recorded in ROUTE.json; acceptance stays kernel-owned.
