# Agent quality evidence report

- Generated: 2026-07-23T13:01:01.508656+00:00
- Recommendation: **INVESTIGATE**
- Routing: 0/0 passed
- Live evidence: 6 empirical runs across 5 cases
- Synthetic contract records excluded from evidence: 0
- Comparable baseline/core/full triplets: 0
- Comparable cases: 0
- KEEP threshold: 6 cases and 12 triplets
- Trace: 0 records; 0 advisory warnings

## Variant comparison

| Variant | Runs | PASS | PARTIAL | BLOCKED | FAIL | Owner corrections | Average score |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 0 | 0 | 0 | 0 | 0 | 0 | — |
| core | 0 | 0 | 0 | 0 | 0 | 0 | — |
| full | 6 | 4 | 0 | 0 | 2 | 0 | 3.100 |

## Efficiency (average per empirical run)

| Variant | Input | Cached input | Uncached input | Output | Tool calls | Turns | Tool output (chars) |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | — | — | — | — | — | — | — |
| core | — | — | — | — | — | — | — |
| full | 170,642 | 140,480 | 30,162 | 3,020 | 4 | 1 | 22,328 |

## Friction

- response contract: 2
- codex exec failed: 2
- workspace change scope: 1
- verification: python -m unittest -q: 1

## Decision rule

This report never promotes a rule automatically. Review repeated friction through the context evolution promotion gate.
