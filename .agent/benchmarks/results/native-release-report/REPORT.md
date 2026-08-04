# Agent quality evidence report

- Generated: 2026-07-24T02:16:01.149484+00:00
- Recommendation: **INVESTIGATE**
- Routing: 20/20 passed
- Live evidence: 1 empirical runs across 1 cases
- Synthetic contract records excluded from evidence: 0
- Known false PASS (owner-corrected PASS only): 0
- Comparable baseline/core/full triplets: 0
- Comparable cases: 0
- KEEP threshold: 6 cases and 12 triplets
- Trace: 0 records; 0 advisory warnings

## Variant comparison

| Variant | Runs | PASS | PARTIAL | BLOCKED | FAIL | Owner corrections | Average score |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 0 | 0 | 0 | 0 | 0 | 0 | — |
| core | 0 | 0 | 0 | 0 | 0 | 0 | — |
| full | 1 | 0 | 1 | 0 | 0 | 0 | 2.600 |

## Efficiency (average per empirical run)

| Variant | Main input | Total input | Total cached | Total uncached | Main output | Total output | Total reasoning | Tool calls | Turns | Tool output (chars) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | — | — | — | — | — | — | — | — | — | — |
| core | — | — | — | — | — | — | — | — | — | — |
| full | 294,606 | 294,606 | 266,496 | 28,110 | 3,654 | 3,654 | 1,056 | 10 | 1 | 43,882 |

## Friction

- expected file api.py: 1
- response contract: 1

## Decision rule

This report never promotes a rule automatically. Review repeated friction through the context evolution promotion gate.
