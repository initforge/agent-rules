---
name: prisma-skills
description: "Provenance projection for prisma/skills (pinned 808913c1, MIT): ROUTED on prisma schema/client facts."
metadata:
  signals: "prisma schema, prisma client, prisma cli, prisma database setup"
  excludes: "migration-only"
  priority: "45"
  platform_scope: "all"
  source: ROUTE.json migrated

---
# prisma-skills

**Status:** provenance-only projection
**Activation class:** ROUTED
**Content materialization:** MATERIALIZED

## Provenance (immutable lock)
- Source: https://github.com/prisma/skills
- Pinned commit: 808913c1dac11dc425631c2454f7fcb2d5ade5ca
- Tree (git-tree-sha1): e0b9088f7d8a5f2613d67e5274aa1ed153f24a1c
- License: MIT (LICENSE (pinned tree, MIT Prisma))
- Permission review: NONE granted; execution authority NONE
- Install authority: owner-approved-plan only; never @latest; never implicit

## Materialization model
- This SKILL.md is a harness-owned projection (metadata + route). Upstream
  content is never copied into the repository.
- Content status MATERIALIZED: license and scan evidence present.

## Use when
- Deterministic facts: prisma schema; prisma client; prisma cli; prisma database setup.
- Activation is ROUTED — never from generic keywords.

## Do NOT
- Do not run install commands without install authority.
- Do not treat this projection as acceptance; verification stays kernel.

## Rollback
- Remove this skill directory; no external content or credentials are installed.
