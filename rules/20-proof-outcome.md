# Proof, No-Worker-PASS và Outcome

Select the smallest sufficient proof set for every task from scope, claims, risks and runtime surface; enforce six-status semantics; live claims require live proof; refactors require coverage mapping.
Prefer concise output without removing required evidence.
Workers never author PASS; completion is derived from verifier evidence and acceptance audit.
Evidence must be bound to exact requirement/claim, spec revision, candidate, platform, stage and artifact hash.
No scanning of arbitrary JSON PASS to close another requirement.
`--contract`, direct task and planned task must call same planProofRoute.
Proof plan records selected and omitted proof.
Only RunStore may write run.json, events.jsonl, result.json, artifacts/. No direct writeJsonAtomic outside RunStore.

Truth path: EvidenceLedger → AcceptanceAudit → OutcomeReducer → OutcomeReceipt
Outcome statuses: PASS/PARTIAL/BLOCKED/UNSUPPORTED/PRE-EXISTING/NEEDS_USER

Enforcement: proof-router-and-proof-selection, response-policy, evidence-ledger, outcome-reducer.
