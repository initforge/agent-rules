---
alwaysApply: true
description: Scope, execution, verification and reporting contract.
---

# Execution

1. Read the nearest entrypoint/index and inspect only context relevant to the request.
2. Lock explicit deliverables. For multi-module, ambiguous or high-risk work, use a reviewable plan and execute in slices.
3. Trace affected interfaces and downstream consumers before changing shared behavior; verify plan assumptions against real interfaces and scan known-unknowns (`implementation-discovery`).
4. Implement the complete in-scope outcome; do not stop at recommendations when execution was requested.
5. Verify with the strongest available evidence appropriate to risk: lint/typecheck/build/tests, source trace, API/database/permission checks, generated artifact inspection or browser flow when the active platform allows it.
6. Re-run impacted checks after fixes. A compile pass alone does not prove UI, data or permission correctness; when browser proof is skipped by platform policy, compensate with targeted non-browser evidence and report any remaining gap honestly.
7. Final reports state scope completion, files/layers changed, verification evidence and status per `25-task-lifecycle.md` (Lane, Friction, advisory `.agent/trace.jsonl` for normal/high-risk). Never present unverified assumptions as facts.
8. When `Friction` names missing rules, repeated manual steps, or conflicting sources of truth, propose promotion via `context-evolution-protocol` — do not silently edit canonical context.

Use `finish-to-completion` for execution tasks. Use `researcher` when current external behavior matters or investigation stalls. Use specialized capabilities only when their trigger matches.
