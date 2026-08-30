# Proof và Outcome

Select the smallest sufficient proof set for every task from scope, claims, risks and runtime surface; enforce six-status semantics; live claims require live proof; refactors require coverage mapping.
Prefer concise output without removing required evidence.
Model prose never creates PASS; completion comes from the focused proof result and acceptance reducer. Do not create a separate completion-grant ceremony when the proof result already establishes the outcome.
Bind evidence only to the identities needed to prevent stale or cross-scope reuse: claim, changed source, environment and proof contract. Hashes are implementation details for integrity or cache invalidation, not user-facing workflow requirements and not a reason to multiply artifacts.
Reuse fresh evidence only when claim, source/artifact hash, environment and proof contract are unchanged; otherwise invalidate it. Never execute the same unchanged proof twice merely for reassurance.
Escalate fidelity only after focused failure, a material claim/risk change, or a live/security/data-loss/public-contract requirement. Full regression and broad conformance belong to the release gate unless such a trigger fires.
P0/P1 findings block. P2 blocks only when bound to a failed acceptance, material regression, security/data loss, public contract or production runtime correctness; all other P2 and P3 findings are advisory and remain traceable.
No scanning of arbitrary JSON PASS to close another requirement.
Direct and planned execution call the same proof selector.
Proof plan records selected and omitted proof with reasons, without omitting claim-required evidence. Anti-overengineering never removes required typecheck, focused tests, live proof or fail-closed safety.
Persist state only when the host needs resume or a bounded debug readback. Diagnostics are transient; do not fan one run into parallel truth files.
Do not archive plan history, execution narration, evidence history or closure ceremony in the repository or another hidden harness directory. Keep only the current operational readback needed to diagnose the installed candidate.

Truth path: focused proof → acceptance reducer → terminal outcome
Outcome statuses: PASS/PARTIAL/BLOCKED/UNSUPPORTED/PRE-EXISTING/NEEDS_USER

Enforcement: proof-router, proof-policy, review-materiality reducer and health readback.
