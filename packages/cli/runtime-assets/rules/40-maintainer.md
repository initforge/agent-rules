# Maintainer-Only

This rule applies only inside the agent-rules repository.
Edit canonical source first and require context evolution audits.
Delegates detailed maintenance governance to the canonical maintainer rule.

Maintainer must keep generated and installed mirrors as build outputs only; never hand-edit.
Retire replaced authorities, phase scripts and transient artifacts in the same change. Keep compatibility facades only for a named public consumer and remove them once that consumer migrates.
Agent Rules must not create `.agent/` or a replacement history store. User-level state may contain only current ownership/install/readback data, one required rollback generation per host, and non-terminal transaction lock/journal/staging state. Cleanup terminal or superseded owned state; retain ambiguous state and report `NEEDS_USER`.
Do not commit/push/deploy unless explicitly requested.

Enforcement: canonical build, focused tests, packed static lifecycle and installer readback.
