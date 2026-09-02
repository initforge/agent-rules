# Proof và Outcome

Model prose never creates PASS. Map every required acceptance to sufficient current evidence: static, unit, integration, live runtime or user-visible E2E according to the claim. Live, security, data-loss, public-contract and UI interaction claims require the corresponding high-fidelity proof.

Reuse PASS only for the same claim, source, environment and proof contract. Source or contract drift invalidates it. Refactors/replacements require active consumer adoption, preserved behavior and old-path retirement; deletion requires negative removal proof plus preservation outside scope.

Proof failure is evidence. Classify it as implementation, plan, source-understanding, proof, environment, dependency, context/routing or external before changing the correct layer. The same failure without evidence delta must trigger root-cause/replan, not random patching.

Completion states are PASS, PARTIAL, BLOCKED, UNSUPPORTED, PRE-EXISTING and NEEDS_USER. PASS requires every required acceptance proved. Pending work is PARTIAL. BLOCKED applies only when no required unblocked work remains. Separately reproduced legacy failure is PRE-EXISTING only after changed acceptance passes.

Keep proof summaries and freshness bindings needed by the active task; do not persist raw tool output or evidence history. Install, health and rollback receipts remain separate safety-critical state.
