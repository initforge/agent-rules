# Artifact lineage reconciliation

- Plan: `agent-rules-harness-v3-rearchitecture-20260726-r1`
- Result: **PASS — artifact authority only**
- Extraction: wrapper tag lines excluded; terminal LF before closing tag preserved.
- Prior delimiter-stripped diagnostic: `af8b6d44b41efbdd3d3d3f601f4675e31571d8656b0cecc2798a4ea4c54becd2` (not authoritative).
- Original authority: `SUCCESSOR` / `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31`

## Resolution

| Source | Status | Resolution |
|---|---|---|
| A1 | CARRIED_INPUT | Carry every live non-conflicting requirement with provenance. |
| A2 | SUPERSEDED | A3 contains its base plus immutable-plan extension. |
| A3 | AUTHORITATIVE_BASE | Wins every direct A3/A4 conflict. |
| A4 | ADDITIVE_SUPPLEMENT | Additive to A3; wins A1/A2 only where A3 is silent. |
| Successor | APPROVED_ADOPTED | Executable head; preserves A3 and resolves lineage. |

Implementation reconciliation is **PENDING**. No requirement is represented as implemented by this bootstrap receipt.
