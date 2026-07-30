# Harness lifecycle policy

Canonical plan lifecycle: `DRAFT → APPROVED → ADOPTED → SUPERSEDED | ACTIVE`

Canonical run lifecycle: `DISCOVERING → PLANNED → VALIDATED → DISPATCHING → EXECUTING → VERIFYING → REVIEWING → COMPLETED | PARTIAL | BLOCKED | FAILED | CANCELLED`

Remediation loop: `ADOPT ORIGINAL → EXECUTE + SHADOW TRACKING → VERIFY → INDEPENDENT REVIEW → RECONCILE`.

Mutation is forbidden before ADOPTED. Verification and reconciliation must complete before COMPLETED. No false COMPLETED states from timeout, context loss, or worker self-attestation.
