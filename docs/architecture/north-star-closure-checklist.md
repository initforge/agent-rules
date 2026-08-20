# North-Star Closure Checklist

This checklist is the release contract for Agent Rules as an **agent operating environment**, not merely a collection of modules. A gate is PASS only when there is executable or immutable evidence. Missing host capability is BLOCKED, never PASS. A worker, planner, reviewer, document, or test name cannot self-certify completion.

## A. Truth and intent

- [ ] **Intent preservation** — raw WorkRequest constraints/non-goals survive compilation; semantic drift is rejected.
- [ ] **Traceability** — every mandatory requirement has claims, every claim routes to at least one TaskPacket, and no task references unknown truth anchors.
- [ ] **Deterministic acceptance** — worker output cannot declare PASS; acceptance derives from verifier evidence.
- [ ] **Independent semantic review** — S2/S3 semantic work receives a reviewer that does not see builder reasoning and cannot upgrade deterministic failure.
- [ ] **Convergence** — after implementation, re-audit code/evidence against original WorkRequest + WorkSpec; create bounded delta work and repeat until no gap remains.

## B. Long-horizon correctness

- [ ] **Revision propagation** — changed/removed requirements and claims mark affected tasks REVALIDATE/INVALIDATED/OBSOLETE and stale evidence is not reused.
- [ ] **Crash/resume** — durable queue, checkpoint and evidence/report chains recover without duplicate side effects or truth loss.
- [ ] **Trajectory** — repeated repairs must reduce unresolved truth; oscillation/repeated reads/repeated tool calls are measured.
- [ ] **Decision consistency** — active decisions/ADRs are retrieved by pointer; a later attempt cannot silently rewrite them.

## C. Context and cognitive economy

- [ ] **Bounded initial context** — only invariants, routed requirements/claims, relevant symbols/references/decisions/skills and prior failure fit the task budget.
- [ ] **Closed-loop context** — failure/uncertainty emits targeted retrieval requests for paths/symbols/decisions; whole history is never replayed by default.
- [ ] **Ablation** — semantic retrieval, skills, compression, reviewers and other scaffold layers remain enabled only when they improve verified-task outcomes.
- [ ] **No giant instruction bible** — repository knowledge is the system of record; AGENTS.md is a map.

## D. Skills, tools and compute

- [ ] **Bounded skill surface** — deterministic mandatory routing first, optional discovery second; activation precision/recall is measured.
- [ ] **Bounded capability surface** — install != expose; explicit-only tools stay explicit; MCP is a tool/data protocol, not harness state.
- [ ] **Provider-neutral compute** — core requests logical model classes/capabilities; provider IDs resolve at the host edge.
- [ ] **Empirical routing** — provider selection uses verified success, sample size, health, cost and latency above the logical-class safety floor.
- [ ] **Resource governance** — CPU, memory, agent concurrency, browser instances, verifier parallelism, wall time and repair depth are bounded.

## E. Verification and evidence

- [ ] **Proof DAG** — claim dependencies are explicit/acyclic; cost ordering is only a fallback optimization.
- [ ] **Oracle independence** — two verifiers from the same oracle group do not count as independent evidence.
- [ ] **Funnel** — cheap deterministic checks run before expensive integration/browser/semantic gates where dependencies allow it.
- [ ] **Evidence integrity** — evidence is hash-bound, append-only and tied to spec revision/candidate epoch/artifact where applicable.
- [ ] **False-green rejection** — skipped tests, missing tools, wrong commands, empty suites, stale dist, missing browser binaries and unavailable providers are BLOCKED/FAIL, never PASS.

## F. Domain and platform completeness

- [ ] **Web** — runtime/API/browser/visual/accessibility claims use the correct oracle; Playwright CLI is preferred for normal QA and richer browser tooling only when exploration/debugging needs it.
- [ ] **Mobile** — if mobile is in release scope, emulator/simulator/device behavior has deterministic flows plus evidence; otherwise the gate is explicitly N/A, not silently absent.
- [ ] **Security/data** — destructive, auth, permission, schema and migration work uses S3 policy, explicit stop conditions and independent proof.
- [ ] **Platform materialization** — Claude/Codex/OpenCode/Cursor/Antigravity/MiMo/etc. consume the same canonical protocol without platform-specific business truth forks.
- [ ] **Domain packs** — explicit activation, provenance/hash verification, no source leakage/vendor copying, project spec overrides variable business slots.

## G. Empirical North-Star proof

- [ ] Run representative real tasks with **raw lower-tier worker**.
- [ ] Repeat with TaskPacket only.
- [ ] Add routed context.
- [ ] Add skills/capabilities.
- [ ] Add deterministic verification.
- [ ] Add repair/recovery.
- [ ] Add semantic/convergence review.
- [ ] Compare full Agent Rules against baseline using verified success, false PASS, interventions, regressions, scope violations, tokens, cost, wall time and trustworthy verified throughput.
- [ ] A scaffold layer that does not improve the verified-task objective must be simplified, demoted to explicit-only, or removed.

## Final certification rule

`FULLY CERTIFIED` is permitted only when all applicable gates above are PASS on a clean capable host. `SOURCE-COMPLETE` may be used when source-verifiable gates pass but live/provider/browser/platform gates remain BLOCKED. `PASS` must never be inferred from absence of evidence.

This policy deliberately follows current evidence: OpenAI emphasizes repository legibility and feedback loops; Anthropic emphasizes independent evaluation and simplifying stale scaffold; Vercel demonstrates that extra tools/skill indirection can reduce reliability; Spec Kit's converge phase demonstrates repeated implementation/completeness closure. These are design inputs, not external authorities that override repository evidence.
