---
alwaysApply: true
description: Scope, execution, verification and reporting contract.
---

# Execution

1. Read the nearest entrypoint/index and inspect only context relevant to the request.
2. Lock explicit deliverables. For multi-module, ambiguous or high-risk work, use a reviewable plan and execute in slices.
3. Trace affected interfaces and downstream consumers before changing shared behavior.
4. Implement the complete in-scope outcome; do not stop at recommendations when execution was requested.
5. Verify with the strongest available evidence appropriate to risk: lint/typecheck/build/tests, browser flow, database/permission checks or artifact rendering.
6. Re-run impacted checks after fixes. A compile pass alone does not prove UI, data or permission correctness.
7. Final reports state scope completion, files/layers changed, verification evidence and status. Never present unverified assumptions as facts.

Use `finish-to-completion` for execution tasks. Use `researcher` when current external behavior matters or investigation stalls. Use specialized capabilities only when their trigger matches.
