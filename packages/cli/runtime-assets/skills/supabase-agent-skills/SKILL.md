---
name: supabase-agent-skills
description: "Provenance projection for supabase/agent-skills (pinned 8331f910, MIT): ROUTED on supabase stack facts."
metadata:
  signals: "supabase project, supabase rls policy, supabase stack"
  excludes: "migration-only"
  priority: "45"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# supabase-agent-skills

**Status:** provenance-only projection
**Activation class:** ROUTED
**Content materialization:** MATERIALIZED

## Provenance (immutable lock)
- Source: https://github.com/supabase/agent-skills
- Pinned commit: 8331f910845103c08d51f6ca1d86ebb7d1f745e3
- Tree (git-tree-sha1): b375b04357d9046a6b56fe840ed8ca1e1be927b7
- License: MIT (LICENSE (pinned tree, MIT Supabase))
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status MATERIALIZED: license and scan evidence present.

## Use when
- Deterministic facts: supabase project; supabase rls policy; supabase stack.
- Activation is ROUTED — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove this skill directory; no external content or credentials are installed.
