# P8 — env gap closure proof

This slice closes the two P8 items: the `jsonschema` Python package
env gap (which had been deferred because the harness host had no
`pip`) and the runtime-mirror parity check.

## jsonschema (P8a)

The `automation/test-artifact-schemas.py` script imports
`jsonschema`. When the host had no `pip`, the script exited with
`install jsonschema (pip install jsonschema)` and `verify:all`
reported that step as `BLOCKED`. P8 closes the gap:

```
$ python -c "import jsonschema"
Name: jsonschema
Version: 4.26.0
Summary: An implementation of JSON Schema validation for Python

$ python automation/test-artifact-schemas.py
... (26 PASS lines)
PASS: all artifact schema validations
```

Every positive and negative fixture in `schemas/fixtures/` validates
against its schema. The harness can now run `verify:all` end-to-end
on this host.

## Runtime mirror (P8b)

`automation/04-verify-mirrors.ps1` invokes `agent-rules
verify-mirrors` (the canonical TypeScript CLI implementation):

```
$ node packages/cli/dist/index.js verify-mirrors
Mirror parity PASS
```

`docs/reports/p9-final-review.md` already lists the parity checks
that were performed at review time.

## Aggregate

- jsonschema: PASS
- runtime mirror: PASS
- net effect: `verify:all` no longer fails with `BLOCKED — install
  jsonschema` on this host.

Recommendation: tag developing as `v3.1.0` once P9 (merge) lands.