# AGENT-RULES V3.1 — EXTERNAL-FIRST HARDENING, SKILL/TOOL RESOLUTION & CLEANUP LIFECYCLE

## 0. Mission

Continue from the completed `codex/v3-decision-fabric` migration.

Do **not** reopen, regenerate or reinterpret the completed V3 goal merely because this plan contains additional refinements.

The V3 execution/trust foundation is retained unless a failing regression proves otherwise:

* WorkRequest / WorkSpec / TaskPacket;
* generation-aware execution authority;
* supersession;
* stale-result rejection;
* SemanticStateValidator;
* RepoFacts / TaskFacts / ChangeFacts;
* PhaseResolver / Decision Fabric;
* Capability Broker effect model;
* claim-driven verification;
* Evidence Ledger;
* AgentDriver;
* Control Plane canonical authority projection.

The purpose of V3.1 is different:

> **Remove remaining self-authored skill/tool/file/lifecycle entropy by resolving external solutions first, retiring obsolete compatibility surfaces, and completing the missing operational cleanup lifecycle.**

No Data Engineering scope.

---

# 1. Current-state truth that this plan starts from

The current V3 branch still exposes fourteen active top-level skills:

```text
best-of-n
browser-qa
context-evolution-protocol
docs-style
finish-to-completion
frontend-architect
master-image-generation
parity-verification
plan-and-handoff
qa-skills
quality
researcher
ui-taste
verification-router
```

The repository README still states that every skill has:

```text
SKILL.md
+
ROUTE.json
```

and the nine entries in `candidate-fabric.json` are explicitly described as planning candidates that are not installed and are not active runtime routes.

Therefore V3 solved much of the **decision infrastructure**, but it did not yet complete the actual **skill replacement/acquisition**.

The current cleanup policy is also real but incomplete as lifecycle execution. It defines authority/generated/ephemeral/history classes, ownership, retention, tombstone requirements and bounded cleanup, but this is still primarily taxonomy/policy rather than demonstrated end-to-end GC.

This follow-up must close those gaps without creating another architecture layer.

---

# 2. External-first rule — mandatory

For every proposed skill, tool, MCP, verifier, workflow helper or integration:

## Adoption level A — REFERENCE / LINK ONLY

Preferred whenever the host or user can use the upstream asset directly.

Agent-rules stores only:

```text
source repository
asset/skill name
version or compatibility range
recommended host
activation facts
installation/usage recipe
trust status
evaluation status
```

Do **not** vendor it.

Do **not** copy its `SKILL.md`.

Do **not** wrap it.

This should be the normal mode.

---

## Adoption level B — INSTALL ON DEMAND

Use when the task benefits from the asset being installed locally.

Do not preinstall the entire ecosystem.

Install only after RepoFacts + TaskFacts + phase prove relevance.

GitHub CLI now supports native skill discovery and installation:

```bash
gh skill search <query>
gh skill preview <owner/repo> <skill-or-path>
gh skill install <owner/repo> <skill-or-path> --pin <tag-or-sha>
gh skill update <skill>
```

It supports host-specific installation for Codex, Claude Code, Antigravity, Antigravity CLI, OpenCode and many other agents. It can also install by exact nested path, avoiding traversal/install of a whole large skill repository.

Therefore:

> **Do not implement an agent-rules skill package manager.**

`gh skill` is the transport/discovery mechanism.

Agent-rules owns qualification and routing.

---

## Adoption level C — THIN BINDING

Use when upstream knowledge is good but project-specific activation or restrictions are required.

A thin binding may specify:

```text
when this upstream asset applies
project-specific invariants
forbidden operations
approved version
effect permissions
required verifier
```

It must not duplicate upstream instructions.

Target:

```text
10–80 lines
```

rather than another 500-line skill.

---

## Adoption level D — PARTIAL REUSE

Allowed only when:

* upstream package is too broad;
* modular install is unavailable;
* only a small stable procedure is useful;
* licensing permits reuse;
* importing the full asset causes context/tool overhead.

The reused portion must record:

```text
upstream source
commit/tag
original path
reason full upstream was rejected
local modifications
```

Do not fork silently.

---

## Adoption level E — CUSTOM LAST RESORT

Write new skill/tool/MCP logic only if:

1. no suitable maintained upstream solution exists;
2. upstream exists but cannot satisfy project semantics;
3. thin binding is insufficient;
4. partial reuse is insufficient;
5. the capability is genuinely agent-rules-specific.

Before custom implementation, the plan must document:

```text
search performed
candidates rejected
reasons rejected
custom scope
expected maintenance cost
evaluation
```

---

# 3. Why external-first does NOT mean install everything

Skills are not free context.

SWE-Skills-Bench evaluated 49 public SWE skills on roughly 565 repository tasks and found:

* 39/49 produced no pass-rate improvement;
* average gain was only +1.2%;
* some skills increased token usage up to 451% without improving success;
* a small set of specialized skills produced meaningful gains;
* several skills decreased success because their guidance conflicted with the project/version.

SkillsBench gives the complementary result:

* curated skills can substantially improve performance overall;
* SWE gain was much smaller than many other domains;
* some tasks regress with skills;
* focused skills outperform comprehensive documentation;
* self-generated skills provide no average improvement.

Therefore V3.1 must support all three outcomes:

```text
external skill useful
→ use it

external skill unnecessary
→ link only / do not activate

no skill needed
→ skills: []
```

---

# 4. Workstream A — scaffold and architecture discipline

## Criterion 1 — Scaffolding has a half-life

Every:

```text
skill
reviewer
subagent
context reset
planner
MCP
verification stage
compatibility facade
```

must periodically prove it is still useful.

Anthropic's long-running harness work demonstrates that scaffolding that helped weaker model generations could later be removed as model capability improved.

### Codebase change

Extend existing candidate/eval metadata rather than introduce a new subsystem.

Track:

```text
last_ablation
model_family
verified_delta
token_delta
time_delta
repair_delta
status
```

### Gate

If an optional scaffold shows no measurable benefit on its representative corpus for two major model/harness revisions:

```text
demote or remove
```

---

## Criterion 2 — Clean-room does not mean rewrite

Retain V3 foundations that already pass.

Migration pattern:

```text
introduce replacement
→ shadow
→ compare
→ cut over
→ delete legacy
```

No big-bang rewrite.

---

## Criterion 3 — Bad-state elimination before fallback

Before adding:

```text
reconciler
fallback
compatibility path
repair case
special terminal state
```

ask:

> Can the invalid state become impossible?

Armin Ronacher specifically warns that current coding agents often react to local failures by adding local defenses, fallbacks and abstractions instead of strengthening invariants; long-running loops amplify this behavior.

### Example

Bad:

```text
old goal remains dispatchable
→ reconcile stale result
```

Good:

```text
old generation becomes ineligible
→ stale result cannot land
```

### Gate

Any new fallback must state which invariant could not eliminate the bad state.

---

## Criterion 4 — Complexity Budget

Artifact count alone is not enough.

Track per task:

```text
new source files
new exported types
new state representations
new managers/factories
new adapters
new compatibility paths
new fallback branches
new packages
```

Review should flag a local feature whose architectural surface grows disproportionately.

No hard arbitrary limit.

Use delta relative to task scope.

---

## Criterion 5 — Human legibility remains a first-class invariant

The repository must remain understandable without requiring another agent to explain every abstraction.

Review cross-module additions for:

```text
discoverability
one obvious authority
explicit boundaries
clear testing command
clear failure semantics
low hidden magic
```

OpenAI's agent-first repository experience similarly emphasizes repository legibility, explicit structure and feedback loops rather than simply increasing prompt size.

---

# 5. Workstream B — planning, certainty and long-horizon state

## Criterion 6 — Plan locks outcomes, not imagined implementation

Plan early:

```text
goal
business invariants
constraints
scope
acceptance
public contracts
known architecture decisions
```

Do not prematurely lock:

```text
private helper names
class hierarchy
internal factory layout
specific file decomposition
```

unless source analysis proves those decisions.

Anthropic's long-running harness work found benefit in keeping high-level planning separate from slice-level technical implementation details.

---

## Criterion 7 — Decision certainty/provenance

Every material durable decision needs provenance:

```text
owner
source
approved design
existing API
test
external documentation
planner inference
```

and confidence:

```text
authoritative
verified
inferred
tentative
```

Planner inference must never silently become an immutable business requirement.

Use existing traceability structures.

Do not create `decision-provenance.json`.

---

## Criterion 8 — Explicit execution state beats raw interaction history

A new 2026 study on long-horizon coding agents found that maintaining explicit execution state improved Pass@1 and cut cost versus making models repeatedly infer state from raw trajectory history; attached to Codex, the reported approach improved Pass@1 while lowering cost.

V3 already moves in this direction.

Continue it.

Do not turn transcript/history back into primary state.

---

## Criterion 9 — Durable artifact updates only on information delta

Do not rewrite durable work artifacts after every successful task.

Update only when:

```text
owner contract changes
durable decision changes
known recurring failure is discovered
task DAG materially changes
approved design revision changes
```

Normal:

```text
run completed successfully
```

must not automatically trigger:

```text
rewrite plan
rewrite summary
rewrite handoff
rewrite skill
rewrite architecture map
```

---

## Criterion 10 — Negative knowledge is selective

Persist failed-path knowledge only if:

```text
likely to recur
+
rediscovery is materially expensive
```

Example durable:

```text
Project build requires kernel before engine.
```

Example runtime-only:

```text
Attempt 4 edited line 72 and failed.
```

---

# 6. Workstream C — EXPLORE vs DELIVER

## Criterion 11 — Introduce an autonomy mode, not another workflow framework

Two behavioral modes:

```text
EXPLORE
DELIVER
```

These are policy inputs, not separate systems.

### EXPLORE

Allows:

```text
temporary scripts
POCs
multiple hypotheses
parallel read-only exploration
aggressive benchmarking
scratch outputs
```

### DELIVER

Requires:

```text
bounded durable diff
strong scope
production-quality abstractions
claim verification
artifact discipline
complexity review
```

---

## Criterion 12 — Scratch is allowed during exploration

Do not overcorrect file hygiene into banning useful temporary work.

Scratch:

```text
benchmark
debug dump
prototype
temporary migration experiment
```

is allowed if:

```text
class = scratch
lifecycle = ephemeral
tracked = false
```

---

## Criterion 13 — Promotion Gate

Transition:

```text
EXPLORE
→ DELIVER
```

must ask:

```text
Which files survive?
Which experiments die?
Which findings become durable knowledge?
Which checks become permanent tests?
Which temporary dependencies disappear?
Which workaround becomes a real invariant?
```

This is the strongest point to remove AI slop before it enters production.

---

## Criterion 14 — Exploration loops and production loops have different standards

Ronacher reports autonomous loops are particularly effective for research, porting, benchmarking and security exploration, while expressing substantially more caution around loops producing long-lived production architecture.

Encode that difference.

Do not apply the same autonomy profile to both.

---

## Criterion 15 — Checkpoint/revert bounded repair

Build on existing V3 checkpoints.

Prefer:

```text
known-green checkpoint
→ attempt
→ verify
→ advance
```

or:

```text
failure
→ bounded repair
→ revert/restore if failure trajectory becomes polluted
```

Do not accumulate seven failed architectural hypotheses in one working tree.

---

# 7. Workstream D — actual current Skill Fabric migration

## Criterion 16 — Keep `docs-style`

Do **not** modify or retire `docs-style` in this phase.

There are external writing/document skills, including Vercel writing guidelines and Anthropic document workflows, but they solve different jobs. Vercel's writing guidelines are based on Vercel's own handbook; Anthropic skills include broader example/document workflows. Neither is automatically a better source of truth for agent-rules repository documentation.

Therefore:

```text
docs-style
→ KEEP
```

Possible additions remain separate and optional.

---

## Criterion 17 — Retire `finish-to-completion`

Current status:

```text
active skill
```

Target:

```text
kernel ExecutionPolicy
```

Completion semantics belong to every implementation task.

They are not optional expertise.

Migration:

```text
shadow kernel policy
→ prove equivalent behavior
→ remove ROUTE
→ archive skill source
```

---

## Criterion 18 — Retire `plan-and-handoff`

Machine planning/handoff is already represented by:

```text
WorkSpec
TaskPacket
checkpoint
AgentDriver
execution state
```

Do not maintain another runtime skill describing the same lifecycle.

Retain only an optional documentation skill if the user explicitly asks to author a human-facing implementation plan.

---

## Criterion 19 — Retire `context-evolution-protocol`

Move its durable parts into:

```text
HarnessMaintenancePolicy
```

Activation must derive from touched/owned paths:

```text
rules/**
skills/**
integrations/**
platforms/**
automation/**
north-star/**
```

not phrase matching.

---

## Criterion 20 — Retire `parity-verification`

Convert its useful content into:

```text
claim types
verification profiles
required dimensions
evidence policy
```

No skill should need to remember that visual parity requires:

```text
structure
behavior
responsive
accessibility
runtime
```

Verification Graph owns proof.

---

## Criterion 21 — Retire generic `qa-skills`

QA is not one cognition mode.

Replace normal use with:

```text
claim-driven verifier planning
```

Keep only a very small optional:

```text
exploratory-qa
```

for unknown symptoms/adversarial exploration.

---

## Criterion 22 — Retire generic `quality`

Split:

```text
lint/type/static
→ deterministic

repository conventions
→ rules/project knowledge

semantic correctness
→ independent review

maintainability/architecture
→ risk-triggered reviewer
```

Do not have an AI “make code prettier” after every implementation.

---

## Criterion 23 — Keep `verification-router`

Current V3 routing has already moved toward claim/risk-based verification.

Keep this as an internal proof/decision layer if it continues to own unique semantics.

Do not turn it into generic implementation advice.

---

## Criterion 24 — `best-of-n` explicit only

Never auto-trigger.

Only use when:

```text
owner requests alternatives
evaluation requires N candidates
search/optimization problem benefits from competing solutions
```

---

## Criterion 25 — `researcher` becomes provider-neutral

Reduce it to research procedure.

It may ask for:

```text
code.search
code.semantic
docs.lookup
web.research
```

It must not name:

```text
Serena
Codebase Memory
Context7
```

as mandatory providers.

---

# 8. External frontend/web resolution

## Criterion 26 — Replace `frontend-architect` with composition

Do not write another frontend skill.

Use four distinct surfaces.

### A. Specific design truth

```text
Pencil
```

Pencil's AI integration allows agents to read and modify `.pen` through its local MCP workflow.

Use:

```text
DESIGN
→ RW

IMPLEMENT
→ RO

VERIFY
→ RO

REVIEW
→ RO
```

---

### B. Creative visual direction

Candidate:

```text
anthropics/skills
skills/frontend-design
```

Anthropic's `frontend-design` is a small focused skill intended to produce distinctive, intentional visual direction rather than generic templated UI.

Adoption:

```text
REFERENCE / ON-DEMAND
```

Example:

```bash
gh skill preview anthropics/skills skills/frontend-design
```

Do not activate for:

```text
ERP CRUD
admin tables
permission matrix
ordinary component maintenance
```

unless explicitly relevant.

---

### C. React/Next implementation

Candidate:

```text
vercel-labs/agent-skills
react-best-practices
```

Vercel currently maintains React/Next performance guidance covering dozens of prioritized rules across data fetching, rendering, bundle size and performance.

Adoption:

```text
REFERENCE
→ INSTALL ON DEMAND
```

Example:

```bash
gh skill preview vercel-labs/agent-skills skills/react-best-practices
```

Only when RepoFacts detect React/Next and task shape makes the knowledge relevant.

---

### D. UI review

Candidate:

```text
vercel-labs/agent-skills
web-design-guidelines
```

It is explicitly a review skill covering accessibility, performance and UX rules.

Adoption:

```text
REVIEW phase only
```

Do not load it while implementing every React line.

---

## Criterion 27 — `ui-taste` no longer default

Keep only:

```text
explicit
creative/marketing profile
```

if its A/B evaluation demonstrates unique value beyond:

```text
Pencil
+
task-specific design contract
+
frontend-design
+
review guidelines
```

Otherwise archive it.

---

# 9. External browser resolution

## Criterion 28 — Playwright CLI is normal proof

Microsoft currently documents `playwright-cli` specifically as a coding-agent interface designed to be token-efficient for work that must share context with large codebases.

Therefore:

```text
browser.verify
→ Playwright Test / Playwright CLI
```

---

## Criterion 29 — Playwright MCP only for exploration

Use MCP when:

```text
persistent browser state
exploratory navigation
long interactive loop
```

actually helps.

Do not auto-connect it for every frontend task.

---

## Criterion 30 — Chrome DevTools for diagnosis

Activate only on:

```text
console
network
performance
runtime/debug
```

failure classes.

---

## Criterion 31 — Shrink `browser-qa`

It should no longer own provider selection.

Keep only a small exploratory procedure if needed.

Provider routing moves to Capability Broker / verification policy.

---

# 10. External mobile resolution

## Criterion 32 — Do not author generic mobile knowledge

Expo now explicitly supplies three complementary pieces:

* Expo Skills for known-good Expo/React Native procedures;
* Expo MCP for current docs/builds/simulator/DevTools;
* project context for version-specific grounding.

This is almost exactly V3's intended separation.

---

## Criterion 33 — Expo Skills

Adoption:

```text
REFERENCE / INSTALL ON DEMAND
```

Official install support exists for Codex and Claude Code.

Do not mirror these skills inside agent-rules.

Agent-rules stores recipes and detects when the project is Expo.

---

## Criterion 34 — React Native skill options

Candidate sources:

```text
Vercel react-native-guidelines
Callstack React Native skills
```

Vercel maintains a React Native guideline set covering performance, architecture and platform-specific patterns.

A/B candidates on actual RN tasks.

Do not install both simultaneously by default.

---

## Criterion 35 — `agent-device`

Expo documents `agent-device`, maintained by Callstack, as an agent-native CLI capable of inspecting/running mobile apps and returning screenshots, logs, network data, traces and performance information; its skill is optional because the CLI can also expose current workflow help itself.

This is an important pattern:

```text
tool has excellent self-describing CLI
→ skill may not even be necessary
```

Default:

```text
mobile.explore
mobile.verify-runtime
→ agent-device candidate
```

Install recipe can remain host/environment-level.

---

## Criterion 36 — Stable E2E remains deterministic

Use:

```text
Maestro
or project-native E2E
```

for stable critical flows.

Runtime exploration MCP/CLI does not replace repeatable E2E.

---

# 11. External backend resolution

## Criterion 37 — No mega backend skill

Do not write:

```text
backend-engineer
```

and do not install a community mega-backend skill merely because one exists.

Route by actual framework and change type.

Examples:

```text
public API
→ interface/API guidance

auth boundary
→ security procedure

transaction/concurrency
→ specialist procedure

ordinary internal CRUD
→ likely skills: []
```

---

## Criterion 38 — Prefer vendor/framework knowledge

For detected framework:

```text
official docs
official skill/plugin if maintained
maintainer-provided guide
```

before local custom knowledge.

A local binding should contain only project conventions absent upstream.

---

# 12. External database resolution

## Criterion 39 — Prisma

Prisma maintains an official `prisma/skills` repository with specialized skills covering its CLI, upgrades, database setup and product-specific workflows.

Adoption:

```text
REFERENCE / ON-DEMAND
```

Examples:

```bash
gh skill preview prisma/skills prisma-cli
gh skill preview prisma/skills prisma-upgrade-v7
```

Pin when promoted.

Do not write Prisma CLI/migration syntax ourselves.

---

## Criterion 40 — Supabase/Postgres

Supabase maintains an Agent Skills repository, including Postgres best-practice material.

But upstream itself has had concrete correctness/documentation issues reported, including a report of 13 correctness issues in the Postgres guidance.

Therefore:

```text
official source
≠ automatically trusted
```

Adoption remains:

```text
candidate
→ pin
→ review
→ A/B
```

---

## Criterion 41 — Migration remains agent-rules policy

Do not outsource to Prisma/Supabase skill:

```text
destructive detection
owner approval
rollback requirement
upgrade compatibility
verification evidence
```

These are harness trust responsibilities.

External product skill teaches:

```text
how
```

agent-rules decides:

```text
whether
under which effect
with which proof
```

---

## Criterion 42 — Disposable real DB proof

Use maintained infrastructure rather than inventing fake DB simulation.

Candidates:

```text
Testcontainers
temporary product-native database
existing project integration environment
```

Select per project/environment.

Do not make one universal DB provider mandatory.

---

# 13. External infra/DevOps resolution

## Criterion 43 — HashiCorp skills first

HashiCorp currently maintains twenty skills across Terraform and Packer, with sixteen Terraform skills and individual installation paths.

Therefore do not write generic Terraform knowledge.

Discovery:

```bash
gh skill search terraform --owner hashicorp
```

Preview exact candidate:

```bash
gh skill preview hashicorp/agent-skills <exact-skill-or-path>
```

Install only if required.

---

## Criterion 44 — Capability effect remains local

Keep:

```text
infra.inspect
infra.validate
infra.plan
infra.apply
infra.destroy
```

distinct.

Installing a Terraform skill gives knowledge.

It does not give permission.

---

## Criterion 45 — DevOps read/diagnose first

Normal failure path:

```text
inspect logs
→ diagnose
→ patch repository
→ rerun
```

Production/deployment path:

```text
inspect
→ plan
→ verify
→ approval
→ execute
```

No skill may auto-upgrade itself into write authority.

---

# 14. External security resolution

## Criterion 46 — deterministic scanners before AI review

Use project-appropriate upstream tools:

```text
Semgrep
Trivy
dependency scanner
secret scanner
IaC scanner
```

before semantic review where appropriate.

Agent skill should not reproduce scanner rules in prose.

---

## Criterion 47 — semantic security remains small

Possible custom/thin procedure:

```text
threat modeling
trust boundary reasoning
authorization assumptions
abuse paths
```

because those require project-specific semantic reasoning.

---

# 15. Tool/MCP external-first policy

## Criterion 48 — Native/CLI before MCP when sufficient

GitHub measured that a 40-tool MCP server can add roughly 10–15 KB of tool schema per turn if all definitions are supplied, even when only a tiny subset is used.

Therefore:

```text
simple deterministic operation
→ CLI/native

rich stateful exploration
→ MCP
```

Examples:

```text
Git status / PR checks
→ git / gh

browser proof
→ Playwright CLI

mobile app runtime
→ agent-device CLI

interactive external system investigation
→ MCP candidate
```

---

## Criterion 49 — MCP annotations are input, never authority

Current MCP specification states clients must treat tool annotations as untrusted unless they come from a trusted server.

Therefore fields such as:

```text
readOnlyHint
destructiveHint
idempotentHint
```

may inform agent-rules.

They never replace:

```text
Capability Broker effect
approval
trust
environment
credential scope
```

---

## Criterion 50 — Provider ergonomics

Every provider candidate should be evaluated for:

```text
p50/p95 latency
timeout behavior
hang behavior
error actionability
output noise
state observability
misuse safety
deterministic exit
cross-platform reliability
```

A smaller reliable CLI can beat a feature-rich MCP.

---

## Criterion 51 — Docker MCP Gateway is candidate only

Docker's MCP Gateway/Toolkit provides an existing management layer and catalog for MCP servers.

Evaluate whether it can replace part of custom integration lifecycle.

Do **not** make it foundation before A/B.

Its issue tracker still shows active cross-platform, stale-session and profile/secret-management problems.

---

# 16. Cleanup lifecycle — complete what V3 started

## Criterion 52 — Policy is not lifecycle

Current `.agent/cleanup-policy.json` already defines:

```text
authority
generated support
ephemeral artifacts
historical archive
ownership
retention
tombstone requirement
bounded cleanup
```

Keep it.

Now implement the missing operational lifecycle.

---

## Criterion 53 — Lifecycle states

Use the smallest necessary conceptual states:

```text
ACTIVE
SUPERSEDED
RETIRED
PURGE_ELIGIBLE
PURGED
```

Archive/tombstone is an action/storage form, not necessarily another runtime authority.

---

## Criterion 54 — Purge eligibility is graph-based

An artifact is purge-eligible only if:

```text
not current
not referenced by active WorkSpec
not referenced by active TaskPacket
not referenced by canonical ledger
not referenced by required evidence
not required for rollback/recovery
retention expired
```

Do not delete based purely on age.

---

## Criterion 55 — Superseded artifacts leave active retrieval

This is as important as deleting them.

Old plans/history may remain for audit.

They must not appear in default:

```text
context search
current work lookup
automatic retrieval
routing
```

A stale artifact that remains retrievable can resurrect old goals even if the queue is generation-safe.

---

## Criterion 56 — One cleanup command

Prefer:

```text
cleanup --dry-run
cleanup --apply
```

implemented through existing CLI/automation conventions.

Do not create:

```text
cleanup-ledger.json
cleanup-plan.md
cleanup-report.md
cleanup-progress.md
```

for every cleanup.

Human output can be generated on demand.

---

## Criterion 57 — Active artifact surface audit

Specifically classify current migration-only artifacts such as:

```text
criteria-index.yaml
architecture-map.md
closure-specific receipts
```

After V3 closure, determine:

```text
still operational?
→ keep

only migration proof?
→ historical/archive

fully derivable?
→ generate on demand
```

Do not let a one-time 101-criteria migration ceremony become permanent normal-task behavior.

---

## Criterion 58 — File creation requires lifecycle classification

Every new non-product file must resolve to:

```text
durable contract
durable knowledge
design
test/fixture
runtime evidence
generated projection
scratch
```

Unknown:

```text
deny or require explicit justification
```

No new `summary-final-v2.md`.

---

## Criterion 59 — Information-delta write rule

A durable artifact update requires an actual durable information change.

If the run merely confirms existing truth:

```text
do not rewrite artifact
```

This reduces Git churn, merge conflicts and context pollution.

---

# 17. Fix self-referential CI closure

## Criterion 60 — CI result is external attestation

Do not commit:

```text
CI passed for commit A
```

into commit B and then require CI to validate B.

That creates a recursive closure chain.

Use:

```text
Git SHA
↓
GitHub Actions / Check / signed attestation
```

as external truth.

Repository stores:

```text
required gate policy
```

not the result of its own current commit's future CI.

Control Plane may query/display external status.

---

# 18. Large-codebase performance

## Criterion 61 — Hierarchical RepoFacts

RepoFacts must scale:

```text
repo
→ workspace/service
→ package
→ module
→ public boundary
→ symbol
```

Cache by revision.

Invalidate incrementally.

Do not prompt the LLM to rediscover stack/project shape each task.

---

## Criterion 62 — Localization ladder

Use cheapest adequate method:

```text
known path
→ direct

exact lookup
→ rg

symbol/reference
→ LSP/AST

cross-file semantic
→ semantic index

open-ended architecture ambiguity
→ isolated explorer
```

No universal semantic MCP.

No universal researcher subagent.

---

## Criterion 63 — Selective delegation

GitHub's production work on Copilot CLI found that making delegation more selective improved tool/search/edit failure rates and P95 latency without a detected quality regression; their explicit policy is to keep the main agent focused when it can move faster itself and delegate only where specialists provide leverage.

Therefore:

```text
subagent
```

must earn its existence.

---

## Criterion 64 — Phase-specific search behavior

Review:

```text
diff first
→ narrow context
```

Implementation:

```text
module/interface first
→ expand as required
```

Research:

```text
broad exploration allowed
```

GitHub's production code-review team found that replacing tools without reshaping the workflow made reviews more expensive and less effective; tuning the workflow for actual review behavior reduced average review cost by roughly 20% while retaining quality.

---

## Criterion 65 — Context Capsule

Worker receives:

```text
objective
acceptance
owned scope
forbidden scope
interfaces
exact entrypoints
durable decisions
relevant design
relevant tests
prior load-bearing failure
capability/effect permissions
stop conditions
```

Not entire repository history.

---

# 19. Verification and review

## Criterion 66 — Claim-first verification

Verifier selection derives from acceptance claims.

Not extensions.

Example:

```text
.tsx modified
```

does not alone prove browser verification is required.

---

## Criterion 67 — Cheap automatic, expensive conditional

During edit loop:

```text
syntax/type/affected tests
```

At closure:

```text
claim-specific integration/runtime proof
```

At milestone/high-risk:

```text
broader regression/security/review
```

---

## Criterion 68 — Semantic-diff verification

If a change only updates:

```text
generated metadata
external attestation projection
non-behavioral derived state
```

and content-addressed product/test inputs are identical, local verification should select relevant structural/hash/schema gates rather than automatically rerun every behavioral test.

Required remote branch-protection CI remains external authority.

---

## Criterion 69 — Protect tests

Detect:

```text
required test deleted
assertion weakened
skip added
coverage reduced
verifier command weakened
fixture narrowed to avoid failure
```

A test change is allowed only when traceable to a legitimate requirement/test correction.

---

## Criterion 70 — Bounded review loop

Reviewer repair cycle requires:

```text
failure signature
attempt count
complexity delta
best-known candidate
```

Repeated identical failure:

```text
escalate
```

not infinite review/repair.

---

# 20. Cross-platform harness hardening

## Criterion 71 — Clean-room local verification

Before first remote CI:

start from:

```text
fresh dist
fresh generated output
isolated HOME/profile
known dependencies
clean package build
```

The V3 implementation transcript repeatedly surfaced bugs that local stale `dist` and ambient host state had hidden.

Add one explicit hermetic/local-CI path.

---

## Criterion 72 — Central platform seam

V3 implementation had to fix multiple separate Windows/macOS/Linux cases:

```text
path canonicalization
realpath
CRLF
signals
process tree
zombies
npm.cmd
PowerShell
HOME/AppData
```

Do not continue fixing each test individually.

Create or consolidate one existing platform utility boundary for:

```text
path equality
process liveness
process tree termination
portable executable invocation
profile/temp isolation
line-ending-sensitive canonical bytes
```

Use it everywhere.

---

# 21. AgentDriver / cross-host

## Criterion 73 — Host session is never authority

Codex/Antigravity/Claude/OpenCode conversation/session state is not current Work state.

On resume:

```text
read current work
read generation
read spec revision
compare driver session binding
refresh TaskEnvelope
verify provider availability
continue only if compatible
```

---

## Criterion 74 — Codex managed driver

For rich Codex integration prefer App Server when needed.

OpenAI built App Server as a bidirectional JSON-RPC interface for the same Codex harness used across CLI/IDE/app surfaces; they explicitly report first experimenting with Codex-as-MCP and moving away from it for richer session/diff semantics.

Do not recreate Codex orchestration.

---

## Criterion 75 — Cross-provider protocol represents common work, not common lowest capability

TaskEnvelope is common:

```text
work
generation
task
scope
acceptance
design
capabilities
effect
verification
```

Provider-specific rich features remain adapter-specific.

Do not flatten everything to MCP.

---

## Criterion 76 — Sequential specialization is normal

Example:

```text
Antigravity
→ Pencil/frontend

Codex
→ backend

Antigravity
→ UI review
```

No chat transcript transfer required.

Canonical state is the bridge.

---

# 22. Parallelism

## Criterion 77 — Parallelism is a scheduling optimization

Inputs:

```text
dependency independence
path ownership
worktree isolation
shared service state
merge cost
critical path
verification cost
available compute
```

Read-only work can parallelize aggressively.

Writers require isolation/non-overlap.

Do not use:

```text
one writer forever
```

or:

```text
maximum swarm
```

as universal doctrine.

---

# 23. Control Plane follow-up

## Criterion 78 — Operator-first Vietnamese remains target

Primary operator concepts:

```text
Công việc
Hoạt động
Xác minh
Thiết kế
Hệ thống
```

Internal M11/C4/epoch vocabulary remains diagnostics.

---

## Criterion 79 — Control Plane reads authority, never constructs it

Goal switch UI must invoke the real supersession transition.

It must never merely update selection/display.

---

## Criterion 80 — Pencil dogfood

Use the redesigned Control Plane as a real external-asset test:

```text
requirements
→ Pencil design
→ design review
→ approved .pen
→ frontend implementation
→ Playwright proof
→ UI review
```

Measure:

```text
design iterations
implementation repair loops
behavior defects
visual discrepancy
time to verified UI
context/tool cost
```

---

# 24. Rules cleanup

## Criterion 81 — Rules contain invariants, not expertise

Classify current rule content into:

```text
invariant
policy
procedure
knowledge
verification
documentation
```

Only invariant/policy stays always-on.

---

## Criterion 82 — Rule/skill/verifier duplication forbidden

Same semantic cannot be separately maintained in:

```text
AGENTS
rule
skill
ROUTE
verifier
plan
```

Choose one authority.

Other surfaces reference/derive it.

---

## Criterion 83 — Use path-scoped host behavior where available

If a host supports nested/path-scoped instructions/skills, AgentDriver should map canonical routing to that host-native mechanism instead of eagerly injecting broad context.

Do not build host-specific knowledge copies.

---

# 25. External asset governance

## Criterion 84 — Existing `candidate-fabric.json` should evolve, not another registry

Use the existing candidate inventory.

Extend entries where needed:

```yaml
source:
  type: github-skill | cli | mcp | docs
  repo:
  path:
  version:

adoption:
  mode: reference | on-demand | thin-binding | partial | custom

trust:
  tier:
  reviewed:

compatibility:
  stack:
  versions:

eval:
  corpus:
  no_skill_delta:
  tokens:
  time:

status:
  candidate | approved | deprecated
```

Do not create:

```text
external-assets.json
skills-registry-v2.json
provider-catalog-v3.json
```

unless existing structures truly cannot represent it.

---

## Criterion 85 — Supply-chain review

Third-party skill content is executable influence over agent behavior.

Before promotion inspect:

```text
instructions
scripts
references
network use
write operations
installation hooks
license
source owner
version
```

Anthropic itself advises testing example skills in your environment before relying on them for critical tasks.

---

## Criterion 86 — Avoid bundle installation

Do not install an entire skill repository merely because one desired skill lives inside it.

There are real ecosystem reports of plugin packaging accidentally loading far more skills than intended and wasting large amounts of context.

Prefer exact skill/path installation.

---

# 26. Canonical external asset shortlist

| Domain             | Asset                                     | Default mode         | Purpose                           | Replaces/custom reduction         |
| ------------------ | ----------------------------------------- | -------------------- | --------------------------------- | --------------------------------- |
| Skill transport    | GitHub `gh skill`                         | USE DIRECT           | Search/preview/install/pin/update | Do not build skill manager        |
| Frontend design    | Anthropic `frontend-design`               | LINK / ON-DEMAND     | Creative visual direction         | Part of `frontend-architect`      |
| React/Next         | Vercel `react-best-practices`             | LINK / ON-DEMAND     | Implementation/perf               | Part of `frontend-architect`      |
| UI review          | Vercel `web-design-guidelines`            | LINK / REVIEW        | Accessibility/UX review           | `quality`/UI QA overlap           |
| Docs style         | Existing `docs-style`                     | KEEP                 | agent-rules docs                  | No replacement                    |
| Docs collaboration | Anthropic `doc-coauthoring`               | LINK ONLY initially  | Large RFC/spec workflow           | Complement only                   |
| Browser proof      | Playwright CLI/Test                       | USE DIRECT           | Deterministic web proof           | Provider logic out of skill       |
| Browser explore    | Playwright MCP                            | ON-DEMAND            | Stateful exploration              | browser-qa provider               |
| Browser debug      | Chrome DevTools                           | ON-DEMAND            | Runtime diagnostics               | browser-qa provider               |
| Design             | Pencil                                    | CAPABILITY           | Exact design truth                | `ui-taste`/prompt adjectives      |
| Expo               | Expo official Skills                      | LINK / ON-DEMAND     | Expo procedures                   | Avoid custom mobile skill         |
| Expo live          | Expo MCP                                  | ON-DEMAND            | Current docs/build/simulator      | Avoid custom Expo integration     |
| RN                 | Vercel RN / Callstack candidates          | A/B                  | RN specialist knowledge           | Avoid generic mobile skill        |
| Mobile runtime     | agent-device                              | USE DIRECT/ON-DEMAND | Device/runtime proof              | Avoid custom device MCP           |
| Mobile E2E         | Maestro/project E2E                       | PROJECT              | Stable flow proof                 | verifier                          |
| Prisma             | `prisma/skills`                           | LINK / ON-DEMAND     | Prisma knowledge                  | Avoid custom Prisma skill         |
| Supabase/Postgres  | `supabase/agent-skills`                   | CANDIDATE/A-B        | DB best practices                 | Avoid broad DB skill              |
| Disposable DB      | Testcontainers/project provider           | CAPABILITY           | Real integration proof            | Avoid fake verifier               |
| Terraform          | HashiCorp `agent-skills`                  | LINK / ON-DEMAND     | Terraform/Packer expertise        | No custom Terraform skill         |
| GitHub             | `git` + `gh`                              | DEFAULT              | Repo/PR/checks                    | Avoid MCP for trivial ops         |
| GitHub rich        | official GitHub MCP                       | ON-DEMAND            | Rich stateful GitHub workflows    | external provider                 |
| Security           | Semgrep/Trivy/etc.                        | DIRECT               | Deterministic scanning            | Avoid security prose rules        |
| MCP lifecycle      | Docker MCP Gateway                        | EXPERIMENT           | Potential provider manager        | Evaluate custom adapter reduction |
| Semantic code      | native LSP/index, Codebase Memory, Serena | A/B                  | Cross-file localization           | No fixed semantic provider        |
| Compression        | RTK                                       | EXPERIMENT           | Tool output compression           | Promote only if measured          |

---

# 27. Routing examples

## Ordinary local TypeScript refactor

```yaml
phase: IMPLEMENT
skills: []
capabilities:
  - code.search

verify:
  - typecheck
  - affected-tests
```

---

## React performance task

```yaml
facts:
  react: true
  nextjs: true
  change_kind: performance

skills:
  - vercel-react-best-practices

providers:
  browser.verify: playwright-cli
```

---

## ERP UI implementation from approved Pencil design

```yaml
phase: IMPLEMENT

design:
  provider: pencil
  permission: read

skills:
  project:
    - 5fedu-project

  external:
    - react-best-practices  # only if relevant

verify:
  - component
  - browser-behavior
  - project-parity-policy
```

No Anthropic creative `frontend-design` unless redesign is explicitly requested.

---

## Marketing landing page

```yaml
phase: DESIGN

skills:
  - frontend-design

capabilities:
  - design.read
  - design.edit

provider:
  Pencil
```

---

## Expo feature

```yaml
facts:
  expo: true

phase: IMPLEMENT

skills:
  external:
    - relevant Expo official skill

capabilities:
  docs:
    - Expo MCP only if current docs/runtime needed

verify:
  runtime:
    - agent-device when runtime claim exists
```

---

## Prisma schema migration

```yaml
facts:
  prisma: true
  schema_change: true

skills:
  external:
    - prisma-cli or relevant Prisma skill

policy:
  - schema-migration

capabilities:
  - database.disposable
  - database.migration.verify

effect:
  production migration requires approval
```

---

## Terraform change

```yaml
facts:
  terraform: true

phase: IMPLEMENT

skills:
  external:
    - exact HashiCorp skill for task

verify:
  - terraform validate
  - plan

effect:
  apply: denied unless explicitly authorized
```

---

# 28. Migration phases

## Phase 0 — Preserve completed V3

Do not mutate the completed V3 goal.

Create new V3.1 work.

Baseline:

```text
current active skills
routing decisions
token/context cost
verified success
file count
active artifact count
provider use
```

---

## Phase 1 — CI closure + cleanup lifecycle

Implement first:

```text
external CI attestation
cleanup dry-run/apply
purge eligibility
active retrieval retirement
migration-artifact classification
```

Reason:

These reduce entropy before adding/replacing external assets.

---

## Phase 2 — External acquisition mechanism

Do **not** build an installer.

Integrate/reference:

```text
gh skill search
preview
install
update
```

through existing capability/automation surfaces.

Extend `candidate-fabric.json` only enough to store qualification information.

---

## Phase 3 — Frontend/browser skill cutover

Evaluate:

```text
current frontend-architect
vs
no skill
vs
Anthropic design
vs
Vercel implementation
```

separately by phase.

Then migrate:

```text
frontend-architect
ui-taste
browser-qa
quality overlap
```

without bundling every external skill.

---

## Phase 4 — Mobile

Add RepoFacts bindings for:

```text
Expo
React Native
native
```

Resolve external assets.

No new mobile mega-skill.

---

## Phase 5 — Backend/database

Add framework-specific reference resolution.

Evaluate Prisma/Supabase assets.

Keep migration trust policy local.

---

## Phase 6 — Infra/DevOps/security

Resolve HashiCorp and deterministic scanners.

Extend effects only where current Capability Broker cannot express actual risk.

Do not build another security/infra framework.

---

## Phase 7 — Current skill retirement

For each legacy skill:

```text
candidate replacement
→ shadow
→ no-skill comparison
→ A/B
→ consumer map
→ cutover
→ remove ROUTE
→ archive old skill
```

Do not mass-delete first.

---

## Phase 8 — Rules + ROUTE simplification

After typed resolver proves parity:

* remove redundant phrase banks;
* reduce `ROUTE.json`;
* merge rule overlap;
* move deterministic constraints into code/verifiers.

Do this **after** runtime evidence exists.

---

## Phase 9 — Large-codebase/performance hardening

Implement:

```text
clean-room local CI
hierarchical RepoFacts cache
phase-specific localization
Context Capsule
provider ergonomics
platform seam
semantic-diff verification
```

A/B semantic providers.

---

## Phase 10 — EXPLORE/DELIVER + complexity control

Add:

```text
autonomy mode
Promotion Gate
Complexity Budget
information-delta artifact writes
negative-knowledge policy
checkpoint/revert
```

Prefer fields/policies in existing structures.

Avoid new packages.

---

## Phase 11 — Control Plane dogfood and final GC

Use:

```text
Pencil
→ external frontend composition
→ Playwright
→ review
```

to redesign/validate Control Plane.

Then run cleanup lifecycle.

Retire migration-only V3/V3.1 support artifacts.

---

# 29. Required evaluation matrix

Every external skill candidate must be tested under at least:

```text
A: no skill
B: current local skill
C: external candidate
D: composition if applicable
```

Measure:

```text
verified task success
tokens
wall clock
repair attempts
wrong-file edits
scope violations
tool activations
context size
human intervention
complexity delta
```

Do not evaluate whether:

```text
output sounds expert
```

Evaluate whether:

```text
verified outcome improved
```

---

# 30. Representative domain corpus

Must contain:

```text
WEB
React local fix
complex UI flow
frontend redesign
accessibility review

MOBILE
Expo feature
RN performance
device runtime bug
critical E2E

BACKEND
API addition
auth boundary
transaction bug
cross-service integration

DATABASE
query optimization
Prisma schema
migration
permission/RLS change

INFRA
Terraform module
CI failure
Docker change
deployment plan

SECURITY
authorization regression
static finding
threat-boundary review

REVIEW
small diff
cross-module diff
frontend diff
migration diff

LONG-HORIZON
20+ file refactor
cross-package project
resume after compaction
host handoff

LIFECYCLE
goal supersession
stale result
artifact retirement
cleanup
```

No Data Engineering cases.

---

# 31. Hard truth gates

V3.1 cannot close unless:

```text
1. No current V3 authority regression.

2. Goal supersession/stale-result tests remain PASS.

3. Cleanup dry-run identifies retired/orphan surfaces without deleting active authority.

4. Cleanup apply cannot delete an active reference.

5. Superseded artifacts disappear from active retrieval.

6. CI success no longer requires a follow-up commit that itself requires new CI.

7. Ordinary task can route to skills: [].

8. No external skill is installed merely because it exists in candidate catalog.

9. Exact skill installation is preferred over whole-repository bundle installation.

10. Every promoted external skill is pinned/provenanced.

11. Every promoted skill has no-skill comparison.

12. docs-style remains intact unless separately proven inferior.

13. frontend-architect has a measurable retirement path.

14. finish-to-completion can be removed without completion regression.

15. plan-and-handoff can be removed without resume/handoff regression.

16. parity-verification can be removed without evidence regression.

17. qa-skills can be removed without QA/verification regression.

18. quality can be removed without review/correctness regression.

19. Browser verification does not auto-load browser MCP.

20. Expo task can use upstream Expo knowledge without copying Expo instructions into agent-rules.

21. Prisma task can use upstream Prisma knowledge.

22. Terraform task can use exact HashiCorp specialist skill.

23. External skill cannot grant write/destructive permission.

24. MCP annotations cannot override agent-rules effect policy.

25. Provider unavailable produces explicit fallback/blocker.

26. Clean-room local verification catches stale-dist dependency bugs.

27. Platform behavior is routed through shared portability seam.

28. EXPLORE scratch does not leak into DELIVER commit.

29. Promotion Gate removes temporary complexity.

30. Review loop is bounded.

31. Required tests cannot be silently weakened.

32. Large-codebase worker does not receive whole-repo context by default.

33. Explorer is not spawned when direct/index lookup is sufficient.

34. Cross-host resume requires no transcript.

35. Control Plane goal switch uses canonical supersession.

36. Completed migration-only artifacts are retired from active surface.

37. No new duplicate semantic authority is introduced.

38. No new package/subsystem exists without replacing measurable complexity.
```

---

# 32. Metrics

Primary:

```text
Verified Task Success
Time To Verified Slice
Human Intervention Rate
Regression Rate
```

Skill:

```text
Skill Precision
Skill Recall
Zero-Skill Correctness
External Skill Improvement
Unnecessary Skill Rate
```

Tool:

```text
Provider Activation Precision
Tool Schema/Context Cost
Provider Error Rate
p95 Tool Latency
Fallback Rate
```

Large repo:

```text
Localization Precision
Localization Recall
Search Tokens
Search Time
Context Capsule Size
Explorer Handoff Failure
```

Artifact:

```text
Files Created / Verified Task
Committed Harness Artifacts / Task
Active-context Artifact Count
Orphan Artifact Count
Cleanup Debt
Durable Artifact Rewrite Rate
```

Execution:

```text
Repair Loops
Repeated Failure Signatures
Goal Switch Latency
Stale Result Accepted = 0
```

Architecture:

```text
New Persistent Abstractions / Task
Compatibility Surface Count
Scaffolds Failing Ablation
```

Cross-host:

```text
Resume Accuracy
Wrong Task After Handoff
Transcript Dependency = 0
```

---

# 33. Required Codex planning output

Before implementation, Codex must return:

```text
A. Exact current skill consumer map.

B. Exact rule/skill/verifier overlap map.

C. Current cleanup lifecycle gaps.

D. Exact artifact active/retrieval graph.

E. External CI attestation redesign.

F. Current candidate-fabric schema delta.

G. External asset matrix with adoption mode.

H. Exact frontend candidate sources and A/B corpus.

I. Exact mobile candidate sources and A/B corpus.

J. Backend framework discovery policy.

K. Prisma/Supabase DB bindings.

L. HashiCorp infra bindings.

M. Security deterministic/provider matrix.

N. Current ROUTE cutover path.

O. Existing skill retirement gates.

P. Cleanup dry-run/apply design.

Q. Purge/reference algorithm.

R. Large-codebase benchmark.

S. Clean-room local CI design.

T. Cross-platform utility consolidation map.

U. EXPLORE/DELIVER integration.

V. Complexity/Promotion policy.

W. Control Plane Pencil dogfood acceptance.

X. Exact files to KEEP / MODIFY / ARCHIVE / DELETE.

Y. Phase-by-phase rollback boundaries.

Z. Metrics baseline and final comparison.
```

Do not write code before these are tied to real source paths.

---

# 34. Abstraction admission rule

Any proposed new abstraction must answer:

```text
What current problem does it solve?

What existing abstraction cannot solve it?

Why can an upstream project not solve it?

Why can a thin binding not solve it?

What competing legacy abstraction will be deleted?

How will we verify it?

How will we know when it is no longer necessary?
```

If the answers are weak:

```text
DO NOT ADD IT.
```

---

# 35. Final target

The end state should not look like:

```text
agent-rules
+
50 vendored skills
+
25 MCP servers
+
new registries
+
more reports
+
more lifecycle files
```

It should look like:

```text
agent-rules trusted kernel
        │
        ▼
typed Decision Fabric
        │
        ├─ most ordinary tasks → no skill
        │
        ├─ specialist task → external asset reference
        │                      ↓
        │                install/use only when needed
        │
        ├─ capability → smallest sufficient provider
        │
        └─ proof → deterministic verifier
```

with:

```text
project-specific knowledge
→ thin local binding

industry/framework knowledge
→ upstream maintainer

external tool capability
→ upstream tool/MCP/CLI

permissions/effects
→ agent-rules

proof/acceptance
→ agent-rules

current work authority
→ agent-rules
```

The operating philosophy is:

> **Do not own knowledge somebody better already maintains.
> Do not install knowledge that the current task does not need.
> Do not wrap a tool when its native interface is already agent-friendly.
> Do not write an MCP because a CLI already solves the job.
> Do not persist an artifact because a run occurred.
> Do not add a reconciler when an invalid state can be made impossible.
> Do not keep scaffolding after it stops improving measured outcomes.**

The success criterion for V3.1 is therefore not the number of new integrations.

It is:

> **less custom code, fewer active skills, fewer active artifacts, fewer tool schemas, fewer competing authorities, faster verified work, and a wider latent capability surface that is pulled in only when facts prove it is useful.**
