# Slice protocol

Use for a delegated or resumable slice. It is intentionally small; the shared adaptive protocol owns routing and ledger policy.

1. **Recover:** read the current context capsule, relevant ledger row, targeted repository interfaces, and current diff.
2. **Lock ownership:** confirm owned paths, explicit exclusions, acceptance criteria, and proof. Resolve overlap before editing.
3. **Execute and prove:** implement the slice; run fresh claim-matched proof; record evidence and update the ledger when one is in use.
4. **Return receipt:** paths changed, decisions, proof run/results, risks/blockers, and next safe action. The main agent integrates and reviews.

Do not stop the owner at a phase boundary. Continue dependency-ready work after the execute pivot. A blocker affects only the blocked work; complete independent work first.
