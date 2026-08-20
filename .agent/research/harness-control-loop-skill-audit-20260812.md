# Harness control-loop and high-impact skill audit

## Summary

The supplied assessment is directionally strong: a dependable coding-agent
harness is a closed-loop control system, not a large prompt collection. The
current North-Star kernel already implements much of that architecture, but the
active universal-reconciliation plan does not yet require a semantic audit of
the high-impact workflow skills. Existing structural validators pass while
several rule/skill contradictions remain reachable.

Control Plane V2 should remain a separate, ordered phase after the universal
reconciliation patch. Its existing candidate handoff already specifies a live,
foreground Pencil design gate, owner approval, a full React presentation
rebuild, Docker Compose preview, and browser/runtime parity. It must be
recompiled through the canonical goal transaction after that transaction is
made generic; it must not be activated by hand.

## Evidence

### External primary sources

- OpenAI, "Harness engineering: leveraging Codex in an agent-first world"
  (2026-02-11): repository legibility, isolated per-worktree application
  instances, agent-accessible UI/logs/metrics, mechanically enforced
  architecture, and feedback loops are leverage points.
  <https://openai.com/index/harness-engineering/>
- OpenAI, "Unrolling the Codex agent loop" (2026-01-23): the harness owns the
  user/model/tool loop, context construction, tools, and compaction behavior.
  <https://openai.com/index/unrolling-the-codex-agent-loop/>
- Anthropic, "Effective context engineering for AI agents" (2025-09-29):
  context is finite; prefer the smallest high-signal context, minimally
  overlapping tools, progressive disclosure, compaction, and durable notes.
  <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- Anthropic, "Harness design for long-running application development"
  (2026-03-24): structured handoffs and independent evaluator roles improve
  long-running and subjective design work, but are techniques rather than a
  universal mandatory topology.
  <https://www.anthropic.com/engineering/harness-design-long-running-apps>
- Anthropic, "Demystifying evals for AI agents" (2026-01-09): outcomes are
  final environment state, not agent claims; task, trial, grader, trace, and
  outcome must stay distinct.
  <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>
- Thoughtworks/Martin Fowler, "Harness engineering for coding agent users"
  (2026): feedforward guides and feedback sensors should be separated;
  deterministic sensors run early while expensive inferential review is
  claim/risk selective.
  <https://martinfowler.com/articles/harness-engineering.html>
- Thoughtworks, "Feedback flywheel" (2026-04-15): repeated failures should
  improve the harness, with human review preventing noisy context promotion;
  model-era assumptions should be re-evaluated.
  <https://www.thoughtworks.com/en-us/radar/techniques/feedback-flywheel>
- DORA 2025: AI amplifies the strengths and weaknesses of the underlying
  engineering system.
  <https://dora.dev/research/2025/dora-report/>

### Local architecture alignment

- `packages/kernel/src/northstar/runtime.ts` composes contract, context,
  capability routing, bounded execution, verification, evidence reduction,
  convergence, resources, lifecycle, and durable run artifacts.
- `packages/kernel/src/northstar/evidence-ledger.ts` derives PASS from fresh,
  bound, independent evidence and excludes worker prose from acceptance.
- `packages/kernel/src/northstar/verification-graph.ts` orders proof by claim
  dependencies and cost and preserves independent oracle groups.
- `packages/kernel/src/northstar/routing.ts` models provider effects and
  structured approval, and fails closed for unavailable authority.
- The universal-reconciliation plan covers portable goal bundles, host/provider
  parity, source locks, foreground Pencil/browser behavior, deterministic
  routing, CI timeouts, compaction, dogfood, and owner-gated closeout.

### Semantic gaps that current validators miss

All four current validators pass (`validate-rule-contracts.py`,
`validate-agent-skills.py`, `validate-skill-catalog.py`, and
`validate-route-parity.py`), but they do not reject these contradictions:

1. `rules/25-task-lifecycle.md` deliberately reduces delegation tracking to
   two facts, while `adaptive-work-protocol.md`, `completion-ledger.md`, and
   `slice-gate-protocol.md` still mandate the retired seven-event receipt chain.
2. `rules/25-task-lifecycle.md` says work shape is not file-count based, while
   `rules/50-context-budget.md` says every task touching at least two files is
   medium.
3. `best-of-n` defaults to three agents and permits ten, while this repository
   caps workers at two with no recursion. The project override is prose, not a
   compiler/runtime clamp for this skill.
4. `browser-qa` says to load the smallest proof surface, but its route requires
   `qa-skills` for every browser task, including simple deterministic browser
   verification.
5. `researcher/references/usage.md` hands research to the legacy PAF section and
   template even though `portable-plan-contract.md` says the old template was
   replaced.
6. `ui-taste` correctly makes the Control Plane brief authoritative, while
   `frontend-architect` carries generic font, dark-mode, animation, and
   markup-only rewrite mandates that conflict with the approved Control Plane
   direction unless precedence is enforced mechanically.
7. The verification graph has cost classes and oracle groups, but the profile
   contract does not yet type feedforward versus feedback or computational
   versus inferential sensors, lifecycle timing, applicability, and human
   residuals as one coherent policy.
8. Dogfood exists, but there is no explicit failure-to-eval flywheel with
   failure taxonomy, promotion review, historical replay, and retirement or
   expiry of model-specific workarounds.

### Control Plane and local environment

- `.agent/plans/control-plane-v2/` is a well-scoped CANDIDATE, not current
  authority. It requires Pencil MCP design in a foreground editor, owner design
  approval, then implementation, Docker, browser QA, and parity-gated cutover.
- Docker 29.7.2 and Compose 5.4.0 are installed.
- No Control Plane Dockerfile/Compose artifact currently exists.
- Pencil was not observed running. `~/.codex/config.toml` still points at an
  ephemeral `/tmp/.mount_*` MCP executable.
- The Control Plane server supports `HOST`, `PORT`, and `HARNESS_ROOT`, but the
  planned `CONTROL_PLANE_STORE_PATH` and `CONTROL_PLANE_READ_ONLY` boundaries
  are not wired into implementation yet. Dockerization therefore includes real
  runtime changes and tests, not packaging alone.

## Risks

- Adding the nine-subsystem model as another always-loaded prose block would
  duplicate existing kernel concepts and increase context noise.
- Mandatory multi-agent planner/generator/evaluator topology would violate the
  repository's default-zero/max-two policy and waste resources on tightly
  coupled coding work.
- Universal context resets would encode a model-specific workaround as a
  permanent invariant. Resume strategy should be capability/telemetry driven.
- Treating a Pencil render as shipped-product evidence would create false
  visual PASS. Browser behavior, accessibility, responsive, console/network,
  and data-state evidence remain required after implementation.
- Activating Control Plane V2 before generic goal/current-pointer support lands
  would collide with V3.1-hard-coded gates.

## Recommendation

Amend the universal-reconciliation plan before implementation or at S1 intake
with one additional high-impact workflow-convergence requirement. Allocate it
across S6/S7 and require:

1. A concept ownership matrix covering rules, skills, schemas, runtime owners,
   and host projections.
2. Semantic conflict fixtures for precedence, trigger, authority, lifecycle,
   state, proof, recovery, context budget, delegation budget, and terminal
   status—not only schema/route parity.
3. A focused audit and repair of `plan-and-handoff`, `finish-to-completion`,
   `context-evolution-protocol`, `verification-router`, `browser-qa`,
   `quality`, `researcher`, `best-of-n`, `ui-taste`, and
   `frontend-architect`, followed by all 16 core/profile skill route fixtures.
4. Typed sensor metadata: direction (`feedforward`/`feedback`), oracle type
   (`computational`/`inferential`/`human`), lifecycle timing, applicability,
   cost, independence, freshness, and escalation.
5. A feedback-flywheel record that turns repeated classified failures into an
   eval candidate, requires context-evolution promotion review, replays
   historical cases, and can retire model/provider-specific workarounds.
6. Runtime clamps for project delegation limits and provider effects so a skill
   cannot widen the active contract.

After the patch is complete and reinstalled across hosts, run Control Plane V2
as a separate goal in this order:

1. Live foreground Pencil design with `ui-taste` as the brief/taste lens.
2. Owner design approval.
3. React implementation with the Control Plane contract overriding generic
   frontend preferences.
4. Docker Compose read-only preview with isolated store and healthcheck.
5. `verification-router` + `browser-qa` + `parity-verification` for native and
   Docker runtime proof; independent design/semantic review only for residuals.

## Unknowns

- Whether the post-S1 goal transaction can compile the existing Control Plane
  candidate directly or requires conversion to the new portable plan schema.
- Which installed host will expose a live, connected Pencil MCP after S5
  dynamic discovery and repair.
- Whether writable Control Plane mode is needed in V2 launch or should remain a
  later opt-in profile.
- The exact eval corpus and thresholds for retiring model-specific rules.

## Hand to Plan Architect

- Add a plan amendment; do not silently edit the immutable original request.
- Add one new requirement/acceptance claim for high-impact workflow semantic
  convergence and feedback-flywheel retirement.
- Extend S6/S7 ownership and proof recipes without widening S5 Pencil or S8 Git
  closeout authority.
- Keep Control Plane V2 separate and dependent on successful patch closeout,
  installed-host reconciliation, and owner approval of the live Pencil design.
