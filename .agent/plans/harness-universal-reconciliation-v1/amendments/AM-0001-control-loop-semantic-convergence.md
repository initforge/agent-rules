# AM-0001 — Control-loop and high-impact workflow convergence

Status: `OWNER_APPROVED_EFFECTIVE`

Applied to plan revision: `2`

## Source

- Owner discussion on 2026-08-12 requesting the newly reviewed batch be added
  to the implementation support files.
- Research input:
  `/home/linhnxdeveloper/.codex/attachments/071a767d-a5db-4c08-99a8-fae9b1762bbb/pasted-text.txt`
- Local audit:
  `.agent/research/harness-control-loop-skill-audit-20260812.md`

## Effective additions

1. Treat the harness as a closed-loop control system. Keep feedforward guidance,
   feedback sensors, execution authority, durable state, evidence reduction,
   recovery, and evaluation as typed concepts with one canonical owner each.
2. Extend verification metadata with direction (`feedforward` or `feedback`),
   oracle type (`computational`, `inferential`, or `human`), lifecycle timing,
   applicability, cost, independence, freshness, and escalation behavior.
3. Add a failure-to-eval flywheel. Repeated classified failures become eval
   candidates only after context-evolution placement and promotion review;
   accepted fixes replay historical cases before promotion.
4. Record model/provider assumptions on workarounds and require revalidation,
   expiry, or retirement so obsolete compensating machinery does not become a
   permanent global invariant.
5. Enforce runtime clamps so a skill or provider cannot widen active authority,
   worker count, recursion depth, owned scope, effect level, repair budget, or
   weaken required proof.
6. Audit semantics, not only syntax and route shape, for the high-impact skills:
   `plan-and-handoff`, `finish-to-completion`,
   `context-evolution-protocol`, `verification-router`, `browser-qa`,
   `quality`, `researcher`, `best-of-n`, `ui-taste`, and
   `frontend-architect`. Then run semantic fixtures over the full selected
   skill catalog.
7. Resolve known contradictions around delegation receipts, file-count work
   classification, repository worker caps, browser support loading, legacy PAF
   references, and Control Plane design precedence.
8. OpenCode has no native durable `/goal`. Before S1, execution starts from the
   bootstrap prompt. S1 must generate and install an explicit custom command at
   the OpenCode adapter boundary (project or installed host command projection),
   backed by the same canonical bundle and honestly attested as emulated.

## Control Plane sequencing

Control Plane V2 remains a separate successor goal. This phase must preserve its
candidate artifacts but must not implement, activate, or Dockerize it. After the
universal reconciliation patch passes, is reinstalled, and has an approved
closeout, the successor flow is:

1. Open Pencil desktop/editor in the foreground and use live Pencil MCP.
2. Produce desktop, tablet, and mobile design evidence and obtain owner approval.
3. Rebuild the React presentation and information architecture against the
   approved design while preserving canonical authority and evidence semantics.
4. Package a read-only-default Docker Compose preview with isolated persistence
   and a healthcheck.
5. Verify native and Docker behavior through claim-routed browser, accessibility,
   responsive, visual, failure-state, and authority evidence.

Pencil render is design evidence, not shipped-product PASS. The Control Plane
brief owns visual precedence; generic frontend taste guidance cannot override it.

## Non-goals

- Do not duplicate the nine-subsystem model into a large always-loaded rule.
- Do not mandate planner/generator/evaluator or multi-agent execution for every task.
- Do not mandate context resets for every model or host.
- Do not activate or edit the Control Plane V2 implementation in this phase.
- Do not turn OpenCode emulation into a native-capability claim.

## Impact allocation

- S1: OpenCode bootstrap and custom `/goal` projection.
- S6: typed sensors, failure-to-eval lifecycle, workaround retirement, and
  runtime authority/delegation/proof clamps.
- S7A: semantic convergence of high-impact rules/skills and cross-layer fixtures.
- S8: verify amendment coverage and preserve Control Plane V2 as the next
  unactivated successor goal in the closeout report.
