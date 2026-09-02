---
name: security-review
description: "Security review for changed threat surfaces: auth/secret/data boundaries, deterministic scans."
metadata:
  signals: "security claim, threat model, security review, vulnerability, auth boundary analysis, secret scanning"
  excludes: "prose-only, checklist-only"
  priority: "55"
  requires: "verification-router"
  platform_scope: "all"

---
# security-review

## Discovery

Inspect the changed trust boundary, entrypoints, authentication and
authorization checks, secret/config handling, data classification, external
calls, logs and direct consumers. State the concrete abuse case the review must
rule out instead of applying a generic checklist.

## Locked boundaries

Do not weaken authorization, validation, rate limiting, auditability, secret
handling, encryption, tenant isolation or data retention to make a change pass.
Treat production credentials, penetration testing and destructive probes as
owner-approved authority.

## Review and repair

Use deterministic source scans, affected tests and boundary/contract proof
first. Add runtime or independent specialist review only when risk, public
exposure, data loss or a failed focused check requires it. Repair the smallest
cause and preserve the accepted product behavior.

## Focused proof and stop

PASS requires current evidence for the stated threat surface, not prose. Stop
or ask before changing security policy, permission model, public exposure,
credentials, production data or acceptance.
