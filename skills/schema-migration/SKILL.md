---
name: schema-migration
description: "Bounded migration procedure: migration files/schema-change claims trigger upgrade/downgrade + rollback evidence."
metadata:
  signals: "migration, migration files, schema change, schema-change claim, migration plan, upgrade/downgrade, rollback migration, database migration"
  excludes: "query-only, read-only"
  priority: "50"
  requires: "verification-router"
  platform_scope: "all"

---
# schema-migration

## Discovery

Inspect the schema owner, migration format, current migration head, generated
client contract, deployment order, seed/fixture assumptions and direct readers
of the changed data. Identify the upgrade path and the reversible alternative
before editing migration files.

## Locked boundaries

Do not silently drop, rewrite, backfill or expose data in a way that changes
retention, authorization, compatibility, availability or rollback guarantees.
Production apply, destructive backfill and irreversible data loss remain
owner-approved authority.

## Implement

Make the smallest compatible schema delta. Choose migration naming and local
helpers from repository conventions. Preserve old readers during an expand/
contract transition when deploy order requires it, and keep application code
and generated client changes aligned with the migration contract.

## Focused proof and stop

Prove upgrade on disposable state, rollback or documented irreversibility,
schema/client type compatibility and affected data behavior. Stop or ask before
production execution, destructive transformation, credential use or a change
to the accepted compatibility contract.
