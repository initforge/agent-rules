# Tombstones

A tombstone records a rule or skill that was **deliberately deleted**, so that
`automation/07-import-reviewed-changes.ps1` cannot resurrect it from an installed
runtime mirror during reverse sync.

Referenced by `rules/41-harness-maintainer.md` §2 and
`docs/guides/00-system-map.md`.

One file per deletion: `<slug>.md` containing the path removed, the date, and why.
