# Skill/MCP/Capability Fabric Research — 2026-08 (reconciled delta v2)

## 1. Summary / reconciliation stance

This is the reconciled research delta produced by the Principal Architect +
Research Reconciler pass. It consumes, in full:

1. `AGENTS.md` (this repository),
2. research attachment A — "skill fabric V3" analysis (Anthropic study, Vercel
   eval, Trail of Bits supply-chain findings, 5 activation classes,
   capability/provider/transport separation, evaluation model),
3. research attachment B — "integration architecture" analysis (registry
   reclassification: codebase-memory, Context7, RTK, Playwright, Chrome
   DevTools, Serena, Pencil, global MCP = none, profile composition),
4. the previous research artifact (v1 of this file),
5. the canonical contracts (`rules/manifest.yaml`, `packages/engine/src/contracts.ts`,
   `packages/engine/src/northstar/` and `packages/kernel/src/northstar/`
   including `routing.ts`, `runtime.ts`, `evidence-ledger.ts`, `trigger.ts`,
   `protocol.ts`, `decision-fabric.ts`, `pencil-routing.ts`, `eval-lab.ts`,
   `resource-governor.ts`),
6. `skills/README.md`, `skills/catalog.json`, `skills/candidate-fabric.json`,
   `schemas/skill-fabric-candidate.schema.json`, `schemas/skill-catalog.schema.json`,
   all 14 `skills/*/ROUTE.json`, the generated `context-graph.json` skill nodes,
7. `integrations/README.md`, `integrations/registry.json`, all integration
   manifests and adapters, `integrations/providers/`, `platforms/platform-contracts.json`,
   `platforms/opencode/` (including `wrappers/session-launch.mjs`),
8. the sibling research artifact
   `.agent/research/harness-control-loop-skill-audit-20260812.md`.

**Stance.** The research direction is sound and the repository already
implements a large part of it (CapabilityBroker, provider-neutral capability
names, effect contracts, decision fabric in shadow mode, claim-matched
verification graphs, append-only evidence, candidate fabric with source locks,
explicit-only manual providers, global MCP = none). The correct application is a
**compatibility-first, fail-closed migration**, not a mass deletion and not a
second registry. No runtime change is made by this document; this is a
research-first delta that hands an owner-authorized phase plan to a future
implementation slice.

Non-negotiable invariants this delta preserves: raw intent and traceability;
workers never author PASS; verification is never weakened; scope fail-closed;
bounded repair with BLOCKED/NEEDS_USER instead of invention; strong planners
compile then exit; subagents default zero (max two, non-overlapping); no
deletion of proven legacy behavior without behavioral/eval parity; no
commit/push/deploy/pointer edits without owner authorization; global MCP = none;
Pencil explicit-only; scanner/marketplace/"official" never sufficient for
trust; `requires` only for true dependencies; no semantic keyword matching for
security/verification/scope/completion/migration/permissions/acceptance.

## 2. Inputs consumed (full list)

| # | Input | Path / source | Status |
|---|---|---|---|
| 1 | Agent rules | `AGENTS.md` | read in full |
| 2 | Research attachment A | `~/.codex/attachments/a6efa8ad-.../pasted-text.txt` (802 lines) | read in full |
| 3 | Research attachment B | `~/.codex/attachments/02f57d21-.../pasted-text.txt` (729 lines) | read in full |
| 4 | Research artifact (current) | `.agent/research/skill-mcp-fabric-architecture-2026-08.md` | read in full |
| 5 | Canonical contracts | `rules/manifest.yaml`; `packages/engine/src/contracts.ts` (facade over kernel); `packages/engine/src/northstar/*` (compatibility re-export layer); `packages/kernel/src/northstar/{protocol,routing,runtime,evidence-ledger,trigger,decision-fabric,pencil-routing,verification-graph,compiler,eval-lab,resource-governor,closure-gates}.ts` | read in full |
| 6 | Skills state | `skills/README.md`, `skills/catalog.json`, `skills/candidate-fabric.json`, `schemas/skill-fabric-candidate.schema.json`, `schemas/skill-catalog.schema.json`, all `skills/*/ROUTE.json`, `generated/context-graph.json` | read in full |
| 7 | Integrations | `integrations/README.md`, `integrations/registry.json`, `integrations/{recommended,optional,manual,providers}/*`, `platforms/platform-contracts.json`, `platforms/opencode/wrappers/session-launch.mjs` | read in full |
| 8 | Sibling research | `.agent/research/harness-control-loop-skill-audit-20260812.md` | read in full |

## 3. Local repository facts (evidence anchors)

- `rules/manifest.yaml`: 13 rule contracts with owner `harness-maintainer`,
  machine-checkable `evidence`/`fixture`, fail-closed `failure` metadata. Rule
  30-context-routing is the deterministic routing invariant; rule 41 is the
  harness-maintainer invariant; rule 20 is the quality/safety invariant.
- `packages/kernel/src/northstar/routing.ts`: `CapabilityBroker` (register/
  resolve/provider/hint/manifest/route), provider effect contracts with
  structured approval (`policy` / `task-scope` / `explicit-provider` / `owner`),
  explicit-only suppression, `inferCapabilities` (keyword-based capability
  inference, explicitly NOT inferring `output.compress` or Pencil/design
  capabilities), `createStandardCapabilityBroker` compiling the provider
  surface from `integrations/registry.json` + manual explicit providers, and
  graph-bound skill routing (`routeSkills`) with source-hash integrity checks.
- `packages/kernel/src/northstar/decision-fabric.ts`: typed resolver producing
  `DecisionFabricDecision` (skills/policies/capabilities/verifiers/reviewers)
  from TaskFacts + RepoFacts, with `legacy` comparison and
  `shadow`/`active` modes. Default mode in `runtime.ts` is `shadow` — the typed
  router exists and records differences but does not yet govern.
- `packages/kernel/src/northstar/runtime.ts`: composes contracts, context,
  capability routing, bounded execution, verification graph, evidence
  reduction, convergence, resources, lifecycle, durable run artifacts; honors
  `decisionFabricMode` (shadow by default) and routes skills via the canonical
  graph.
- `packages/kernel/src/northstar/evidence-ledger.ts`: hash-chained append-only
  evidence; `deriveAcceptance` reduces over independent oracle channels,
  required kinds, required evidence stage (AM-0005), binding freshness; worker
  prose has no input to PASS.
- `packages/kernel/src/northstar/trigger.ts`: provider-neutral trigger
  envelope → immutable WorkRequest; durable TriggerQueue with execution
  generation, stale-claim recovery, supersession.
- `packages/kernel/src/northstar/pencil-routing.ts`: design capabilities
  (`design.inspect`, `design.compose`, `design.render`, `design.tokens`) are
  explicit-only; never inferred from keywords.
- `integrations/registry.json` (version 2): 7 integration records
  (`chrome-devtools-mcp`, `codebase-memory-mcp`, `context7`, `playwright-cli`,
  `playwright-mcp`, `rtk`, `serena`) with capabilities, effects, health,
  fallback, profiles (`core`, `qa`, `frontend`, `research`), pinned versions,
  and per-platform install scripts. Kinds in use: `mcp`, `cli-tool`.
- `integrations/providers/`: claim-class-driven verification adapters
  (`testcontainers`, `pact`, `schemathesis`, `semgrep`, `codeql`, `k6`,
  `maestro`, `opentelemetry`, `storybook`) as `manifest.json` bindings with
  `capabilityClass`, `effect`, `prerequisites`, `health`, `rollback`,
  `evidence_kinds`, `hosts`, `claim_classes`. Failure semantics: missing
  optional provider → `UNAVAILABLE` evidence, never PASS.
- `skills/candidate-fabric.json` (version 1, AM-010/V3.1): 8 external source
  records, all `rejected` below the 70-point threshold; selected set empty;
  `source_lock_policy` requires immutable resolution, hash before install,
  license review, rollback, shell strings forbidden, threshold 70, install to
  all detected hosts. Nine local compositional candidates (frontend design
  contract, mobile, backend, database-stack, schema-migration,
  infra-devops, security-review, claim-test-strategy, external-skill-governance).
- `skills/catalog.json`: disposition enum `retain | migrate-to-policy |
  compatibility-facade | profile-explicit`; removal gates recorded per skill.
- `generated/context-graph.json` (version 2): 16 skill nodes; `browser-qa`
  still declares `requires: ["qa-skills"]` and signals like `playwright`,
  `chrome-devtools`; `context7` integration still carries triggers `research`,
  `library-docs`, `context7`; `playwright-mcp` still carries trigger
  `playwright`. These are the semantic-dependency and keyword-trigger items the
  research wants removed; they can only change through the canonical graph
  builder (`automation/build-context-graph.ps1`), never by hand in `generated/`.
- `platforms/platform-contracts.json`: 7 hosts (codex, claude, grok,
  antigravity, cursor, opencode, retired-platform); certification requires live evidence
  on 5 of them; MCP config paths/formats per host; opencode has no hook
  lifecycle (routing via route capsule injection) — directly relevant to RTK
  middleware enforcement (opencode = plugin mode, codex = instruction mode).
- `platforms/opencode/wrappers/session-launch.mjs`: per-session OpenCode config
  builder (MCP focus guard, per-session binding) — the existing seam for
  capability-surface composition per session.
- `AGENTS.md`: Pencil explicit-only with stable launcher
  (`integrations/optional/pencil-mcp/launch.mjs`), real MCP handshake, bounded
  startup, BLOCKED/NEEDS_USER on unavailability, never
  `/tmp/.mount_Pen.*`; domain packs are explicit project context; global MCP
  profile defaults to `none`; next-phase steering (owner-authorized phase plan,
  current pointer is the only active plan source, no silent supersession).

## 4. Current-vs-target architecture delta

| Dimension | Current | Target (research) | Delta / compatibility path |
|---|---|---|---|
| Registry | `integrations/registry.json` single source; kinds `mcp`/`cli-tool` | Capability contract → provider → transport; middleware separate from MCP | Already capability-driven. Extend taxonomy as a compatibility projection (Phase 1), keep one canonical owner; add `middleware` classification for RTK without a second registry |
| Capability names | `code.semantic`, `docs.lookup`, `output.compress`, `browser.verify/explore/debug`, `design.*`, `database.disposable`, `database.migration.verify` | `code.graph`, `code.symbol`, `docs.library`, `shell.output.reduce`, `design.pen`, `mobile.device`, `security.review`, `api.contract`, `observability.integration` | Map as aliases/extensions of existing names (additive, with alias table); never rename without parity fixtures; `mobile.device` already referenced by candidates |
| Skill routing | graph signals (semantic phrase) as primary + explicit + requires/supports | 5 activation classes (NATIVE/POLICY/ROUTED/EXPLICIT/SEMANTIC), semantic only as optional discovery tail | Decision fabric (typed) exists in shadow; promotion to `active` is a measured step; policy/verification/scope gates move out of phrase routing entirely |
| `requires` | `browser-qa -> qa-skills` in graph | true dependency only (`postgres-migration-base` style) | Remove semantic requires, rebuild graph via canonical builder |
| Skill fabric | 14 core skills + 2 profile skills, dispositions already recorded | ~4–6 true skills; rest = capability/policy/platform | Catalog already encodes `migrate-to-policy`/`compatibility-facade`; keep until parity gates pass; no mass delete |
| External candidates | 8 records, all rejected, selected set empty | +5 sources (impeccable, vercel react/web split, callstack RN, Trail of Bits), reclassified providers vs skills | Additive to candidate-fabric with locks; selected set stays empty until hard gates pass |
| Provider lifecycles | `activation: automatic` for CBM/Context7/Playwright CLI/MCP/DevTools/RTK; `explicit-only` for Serena/Pencil | on-demand code.graph; docs CLI-first + MCP escalation; browser CLI default + MCP exploration + DevTools debug only; Serena routed only with evidence | Registry field changes + health/coverage metadata contracts (Phase 2/4) |
| Middleware | RTK registered as `cli-tool`, no enforcement model | shell middleware, per-host enforcement (hook/plugin hard; instruction best-effort), measured reduction | Registry classification + measurement eval; no RTK changes to evidence or failure hiding |
| Verification | verification graph + evidence ledger + AM-0005 stages; verification-router skill retained | Verification Planner in kernel; parity as verifier policy; qa-skills split into planner + domain verifiers | decision-fabric + claim-test-strategy + providers/* already the target shape; retire facades only behind parity |
| Global MCP | `none` default; profiles `core/research/qa/frontend` | `none` + capability-surface profiles composed by harness | Keep; rename/refine profiles only as compatibility projection |
| Supply chain | candidate-fabric source locks + validators (`validate-skill-fabric.py`) | pin + full-tree inspect + permission review + eval; scanner only supplemental | Already matches; extend with install authority + rollback records + host parity receipts |
| Hosts | 7 hosts, 5 certified | same + per-host enforcement metadata | `platform-contracts.json` is the anchor for RTK/Context7/middleware enforcement |

## 5. Capability / provider / transport / middleware map

Conventions: **capability** = logical contract; **provider** = implementation;
**transport** = MCP/CLI/host/hook/plugin; **middleware** = shell/output
transformation; **policy/kernel** = scope, planning, routing, verification,
completion, recovery, acceptance.

| Capability (target) | Current name | Providers (preferred → fallback) | Transport | Lifecycle | Effect class |
|---|---|---|---|---|---|
| `code.graph` (new) | `code.semantic` | `codebase-memory-mcp` → `builtin-rg` + native reads | MCP → CLI/builtin | on-demand (large repo), advisory metadata | read-only / policy |
| `code.symbol` (new) | (part of `code.semantic`) | `serena` → `builtin-rg` + native LSP | MCP → CLI | explicit-only experimental until evidence | read-only / explicit-provider |
| `docs.library` (alias of `docs.lookup`) | `docs.lookup` | `context7-cli` → `context7-mcp` → curl/manual | CLI → MCP | on-demand; MCP only escalation | read-only / task-scope |
| `browser.verify` | same | `playwright-cli` → Playwright Test → report gap | CLI | automatic, deterministic proof | interactive / task-scope |
| `browser.explore` | same | `playwright-mcp` | MCP | escalation only, exploratory state | interactive / task-scope |
| `browser.debug` | same | `chrome-devtools-mcp` | MCP | escalation only (console/network/CDP/perf); `--no-usage-statistics`; isolated profile | interactive / task-scope |
| `design.pen` | `design.inspect/compose/render/tokens` | `pencil` (manual, explicit-only) | MCP (local, launch.mjs) | explicit-only; foreground; handshake; BLOCKED/NEEDS_USER if unavailable | interactive / explicit-provider |
| `shell.output.reduce` (alias `output.compress`) | `output.compress` | `rtk` | shell middleware (proxy/hook/plugin per host) | session; measured reduction only | read-only / policy |
| `mobile.device` | (candidate only) | `agent-device` | CLI | on-demand binding, explicit mobile task | interactive / explicit-provider |
| `security.review` | (candidate `security-review`) | `semgrep` → `codeql` (CI-only) → deterministic scanners | CLI | claim/risk routed; threat-surface matched | read-only / policy (scan), review / task-scope |
| `database.migration` | `database.disposable` + `database.migration.verify` | `testcontainers` + native tooling | CLI/container | schema-impact routed; migration proof local | write (disposable) / task-scope + owner approval for production |
| `api.contract` | (candidate `claim-test-strategy`) | `pact` (consumer/provider) → `schemathesis` (property) | CLI | claim-class routed | read-only/write (test) / task-scope |
| `observability.integration` | `runtime.traces` | `opentelemetry` | CLI/SDK | claim routed; never substitutes product acceptance | read-only / task-scope |
| performance | `runtime.metrics` | `k6` | CLI | explicit thresholds/SLO claims | interactive / task-scope |
| visual baseline | `browser.verify` + parity policy | `storybook` | CLI | design-baseline evidence, not acceptance | read-only / task-scope |

Built-in (native) providers: `builtin-filesystem-read/write`, `builtin-rg`,
`safe-argv`, `git-cli`, `host-runtime-logs/metrics/traces` — kernel primitives,
priority 1–5, unchanged.

## 6. Full inventory matrix

### 6.1 Local skills — disposition matrix

Legend: KEEP / REWRITE / MOVE / DELETE / CANDIDATE / REJECT / BLOCKED, with the
parity plan for every DELETE/MOVE. `N/A` rows are skills named by research that
do not exist in this repository (host/platform-owned; not deletable here).

| Skill | Research verdict | Repository fact | This delta verdict | Parity plan / gate |
|---|---|---|---|---|
| `imagegen` | NATIVE/IGNORE, capability | not in this repo (host-level) | N/A (platform) + note: imagegen capability must be separable from master-image-generation | n/a |
| `frontend-architect` | DELETE → Anthropic frontend-design + Vercel skills + project UI contract | catalog `retain`; conflicts with `anthropic-frontend-design` unresolved | **REWRITE/MOVE** toward composition; candidate `frontend-design-contract` | catalog removal gate: project design-contract routing + frontend implementation eval parity; keep until then |
| `master-image-generation` | DELETE/MERGE → imagegen capability; image→UI = frontend reference workflow | catalog `retain`; target `core/visual-asset-capability` | **REWRITE/MOVE** to explicit asset capability + reference workflow | gate: explicit asset capability contract + provider-independent output eval |
| `ui-taste` | DELETE → Impeccable/design-review | catalog `profile-explicit`, brief-led lens (correct) | **MOVE** (keep explicit-only lens; CANDIDATE replacement Impeccable) | gate: project design-contract routing + explicit brief/eval evidence |
| `visualize` | MOVE → artifact/visualization pack, explicit-only | not in this repo | **REJECT (absent)** — no local artifact; note for host fabric | n/a |
| `browser-qa` | KEEP, REWRITE thin (exploratory browser workflow, Playwright CLI default) | catalog `retain`; graph requires `qa-skills`; signals include `playwright` | **REWRITE** — thin procedure; remove `requires: qa-skills`; CLI default; MCP/DevTools escalation only | rebuild graph via canonical builder; route fixtures + parity |
| `browser:control-in-app-browser` | NOT A SKILL → capability/provider | already capability (`browser.verify/explore/debug` via registry) | **MOVE** — confirmed already capability, not skill | n/a |
| `parity-verification` | MOVE OUT → Verification Policy + visual-diff verifier | catalog `migrate-to-policy` | **MOVE** — in progress; parity policy + claim-first dimensions | gate: claim-first parity dimensions owned by verifier policy + exploratory procedure parity |
| `qa-skills` | DELETE → Verification Planner + domain verifiers | catalog `migrate-to-policy`; map `petrkindlmann/qa-skills` upstream | **MOVE** — split: planner (kernel/decision-fabric) + domain verifiers (`providers/*`) + exploratory QA remains a real skill | gate: claim/risk verification policy replaces generic QA brain; keep bounded exploratory value |
| `verification-router` | DELETE AS SKILL → kernel Policy Resolver | catalog `retain`, consumers `kernel-verifier` | **MOVE** to kernel — decision-fabric already the typed resolver (shadow); verification graph exists | gate: typed claim/risk verifier selection canonical + provider routes evidence-bound; shadow→active via ablation |
| `quality` | DELETE → deterministic checks + focused review skills | catalog `retain` (clean-code merged) | **REWRITE** — deterministic checks (formatter/lint/typecheck/tests/static analysis) + focused semantic reviews (code/security/performance/API/migration) | gate: separate owners for deterministic checks, conventions, independent review, style |
| `finish-to-completion` | DELETE AS SKILL → ExecutionPolicy | catalog `compatibility-facade`; kernel has `execution-lifecycle.ts` | **MOVE** to kernel execution policy (bounded repair/convergence already in runtime) | gate: durable execution semantics fully owned by kernel + consumer parity |
| `best-of-n` | KEEP, explicit-only execution strategy | catalog `retain` | **KEEP** + enforce `explicit_only`; clamp worker counts to repo max (two) | ROUTE clamp (research sets 3 agents; repo cap = 2, no recursion) |
| `plan-and-handoff` | DELETE AS SKILL → compiler + durable checkpoint | catalog `compatibility-facade`; kernel `compiler.ts`/`planner-runtime.ts` | **MOVE** — compiler/checkpoint into kernel; keep a human-facing plan protocol | gate: human plan skill separated from compiler/checkpoint semantics; consumers mapped |
| `researcher` | SHRINK → external-research; code research via code-intelligence | catalog `retain`; route signals `research/latest/release/...` | **REWRITE/SHRINK** — external primary sources, source quality, conflict reconciliation, stop conditions, evidence delivery; drop code-exploration teaching | route precision evals; broker routing evaluation |
| `docs-style` | SHRINK → focused documentation skill + project docs contract | catalog `retain` | **KEEP** (focused) + add project docs contract seam | fact-parity checks |
| `documents/pdf/presentations/spreadsheets` | NATIVE → platform | not in this repo | N/A (platform) | n/a |
| `template-creator` | NATIVE/ARTIFACT → platform | not in this repo | N/A (platform) | n/a |
| `openai-docs` | NATIVE → platform | not in this repo | N/A (platform) | n/a |
| `plugin-creator` | NATIVE → platform | not in this repo | N/A (platform) | n/a |
| `skill-creator` | NATIVE → platform | not in this repo | N/A (platform) | n/a |
| `skill-installer` | NATIVE → platform / registry adapter | repo equivalent: `external-skill-governance` candidate + source-lock policy | **MOVE** to governance candidate (registry adapter), not a skill | candidate activation gate |
| `context-evolution-protocol` | REBUILD → explicit context-maintenance, explicit-only | catalog `compatibility-facade`; repo rule 41 + `audit-context-pre-commit.sh` exist | **REWRITE** — explicit-only context-maintenance; no auto-trigger from "remember"; rule promotion is controlled maintenance | consumer cutover + regression evaluation |
| `sites:sites-building` / `sites:sites-hosting` | NATIVE host capability | not in this repo | N/A (platform) | n/a |
| browser-control capability | capability/provider, not skill | registry `browser.*` + broker | **KEEP** as capability | n/a |

### 6.2 External skill/domain candidates

| Source | Domain | Recipe (reference, never auto-executed) | Status in fabric | This delta verdict |
|---|---|---|---|---|
| Anthropic frontend-design | frontend | `npx skills add https://github.com/anthropics/skills/tree/main/skills/frontend-design --list`; materialize only after lock | record exists, rejected (55/70) | **CANDIDATE** — keep; conflict with frontend-architect/ui-taste unresolved (owner decision) |
| Vercel agent-skills (repo) | frontend | `npx skills add vercel-labs/agent-skills --list` | record exists, rejected (50/70) | **CANDIDATE** — keep; split into individual skills: `vercel-react-best-practices` (70 rules, impact-ordered), `vercel-web-design-guidelines` (accessibility/performance/UX audit) |
| Impeccable | frontend (taste) | `npx impeccable install` + `/impeccable init` — effectful (hooks/provider behavior) | missing | **ADD CANDIDATE** — explicit-only; deterministic detector rules + audit/polish commands; quarantine + full-tree inspection before anything |
| Expo official skills | mobile | `npx skills@latest add expo/skills --list` | record exists, rejected (63/70) | **CANDIDATE** — keep; never install all implicitly |
| Callstack React Native skills | mobile | `npx skills add callstackincubator/agent-skills --list`; specific `--skill react-native-best-practices` | missing | **ADD CANDIDATE** — `callstack-react-native-best-practices` |
| agent-device | mobile | `npm install -g agent-device@latest`; `agent-device --version`, `agent-device help workflow` | record exists (kind `mobile-provider`), rejected (58/70) | **RECLASSIFY: provider** (mobile.device), not a skill; on-demand binding |
| Prisma skills | database | `npx skills add prisma/skills --list`; `--skill prisma-cli` / `prisma-postgres` / `prisma-database-setup` | record exists, rejected (58/70) | **CANDIDATE** — route from RepoFacts only |
| Supabase agent-skills | database | `npx skills add supabase/agent-skills --list`; exact-name skill | record exists, rejected (58/70) | **CANDIDATE** — exact skill name must be discovered before pin |
| HashiCorp agent-skills | infra | `npx skills add hashicorp/agent-skills --list`; source-locked `terraform/.../skills/...` paths | record exists, rejected (63/70) | **CANDIDATE** — Terraform facts only |
| Trail of Bits skills | security | `codex plugin marketplace add trailofbits/skills`; curated `-curated`; `codex plugin add <name>@trailofbits` | missing | **ADD CANDIDATE** — curated security; route only on matching threat/change surface; owner approval + security review; community supply-chain quarantine |
| Sentry skills / dotagents | governance | `npx skills add getsentry/skills`; `npx @sentry/dotagents init` | missing | **REJECT as install; ADOPT concept** — source-of-truth registry + lock already exist (candidate-fabric `source_lock_policy` + `selection_manifest`); no second architecture, no auto-install |
| Stripe/framework/auth vendor packs; Postgres-neutral guidance | backend | not yet inventoried (no exact recipes in research) | missing | **CANDIDATE (family)** — add only with claim-driven source + lifecycle record |
| Testcontainers / Pact / Schemathesis / Semgrep / CodeQL / k6 / Maestro / OpenTelemetry / Storybook | verification | repo-owned adapters under `integrations/providers/` | existing adapters (not in candidate-fabric; they are provider manifests) | **KEEP as provider adapters** — expose via capability map; not skills |

### 6.3 MCP / CLI / middleware / provider matrix (integrations)

| Integration | Current | Research target | Delta action |
|---|---|---|---|
| `codebase-memory-mcp` | recommended `mcp`, automatic, `code.semantic`, priority 20, fallback rg; profiles core; version 0.8.1 pinned + sha256 per platform | keep as `code.graph` provider; on-demand or default for large repos; advisory when coverage/freshness stale; fallback mandatory | Add health/coverage metadata contract (`indexed`, `revision_matches_head`, `parser_coverage`, `requested_files_covered`) + `confidence`; result advisory when insufficient; never "no references → no references exist" |
| `serena` | optional `mcp`, explicit-only, `code.semantic`, priority 40, fallback CBM+rg | audit symbol reference/rename/refactor; routed experimental only with lifecycle/fallback/permission/ablation evidence | Keep explicit-only (current fallback text already states the condition); promotion is an owner decision behind evidence (REQ-008) |
| `context7` | recommended `mcp`, automatic, `docs.lookup`, profiles core+research, triggers `research`/`library-docs`/`context7`, pinned 3.2.5 | split `docs.library` from MCP transport; CLI/skill on-demand; MCP escalation/optional; triggers only external-library/framework/version/SDK docs; remove `research`; never auto-bump pinned entry to `@latest` | Registry reclassification + trigger cleanup; CLI provider record; keep pinned MCP entry as optional |
| `rtk` | recommended `cli-tool`, automatic, `output.compress`, priority 30, no enforcement model | shell middleware (not MCP); per-host enforcement (`claude` hook hard, `opencode` plugin hard, `codex`/`antigravity` instruction best-effort); measure actual output reduction; never trust `rtk gain` self-report; never hide failure | Registry classification field (`middleware`) + per-host `enforcement`; measurement eval (raw bytes/tokens vs filtered); no evidence alteration |
| `playwright-cli` | recommended `cli-tool`, automatic, `browser.verify`, priority 10 | CLI default for deterministic browser verification | KEEP as-is |
| `playwright-mcp` | recommended `mcp`, automatic, `browser.explore`, priority 30, triggers include `playwright` | exploratory/persistent only; not activated because user said "Playwright"; remove keyword trigger | Trigger cleanup; keep `playwright` as explicit alias only |
| `chrome-devtools-mcp` | recommended `mcp`, automatic, `browser.debug`, priority 30, profiles qa+frontend | console/network/performance/CDP only; not for interaction; `--no-usage-statistics`, `--no-performance-crux` in CI/sensitive profiles; isolated browser profile; multi-tab resource caution | Capability stays `browser.debug`; add operational policy notes (flags, isolated profile) |
| `pencil` (manual) | manual explicit-only; launcher + handshake + verify scripts exist | keep; foreground-visible; bounded timeout; real MCP handshake; unavailable = BLOCKED/NEEDS_USER; never stale `/tmp/.mount_Pen.*` | Already compliant (AGENTS.md + launch.mjs); acceptance evidence required |
| global MCP | `AGENT_RULES_GLOBAL_MCP_PROFILE` default `none` | `none` | KEEP |
| `testcontainers` | provider adapter (capabilityClass-based) | disposable DB/integration proof | KEEP; map to `database.migration` |
| `pact` / `schemathesis` | provider adapters | API contract verification | KEEP; expose `api.contract` |
| `semgrep` / `codeql` | provider adapters (codeql CI-only) | security scanning, claim-routed | KEEP; expose `security.review` |
| `k6` | provider adapter | performance, explicit thresholds | KEEP |
| `maestro` | provider adapter | mobile E2E | KEEP; map to `mobile.device` |
| `opentelemetry` | provider adapter | observability evidence; never acceptance | KEEP; expose `observability.integration` |
| `storybook` | provider adapter | visual/design baseline evidence | KEEP |

### 6.4 Domain packs / profiles / adapters

- `profiles/5fedu/` (profile-owner): explicit-only domain pack; central
  reference snapshot, manifest-bound; project skills `5fedu-project` /
  `5fedu-module-parity` with `profile-explicit` disposition — unchanged by this
  research; never vendored into target projects.
- `platforms/{codex,claude,grok,antigravity,cursor,opencode,retired-platform}`:
  host adapters + `platform-contracts.json`; the seam where per-host
  enforcement (RTK), MCP config paths, and session composition land.
- `platforms/opencode/wrappers/session-launch.mjs`: per-session config builder;
  the natural home for harness-composed capability profiles per session.

## 7. Candidate-fabric reconciliation

### 7.1 Reclassification (providers are not skills)

- `agent-device` → **provider** (`mobile.device`); fabric record keeps
  `kind: mobile-provider`; adoption `on-demand-binding`.
- `chrome-devtools-mcp` → **MCP provider** (`browser.debug`); record keeps
  `kind: mcp-server`, adoption `diagnostic-only`.
- `rtk` → **middleware**, not a skill and not "just" a CLI; requires a new
  registry classification + per-host enforcement fields.
- `context7` → **docs provider** (CLI first, MCP optional).
- `playwright` (CLI+MCP) → **browser provider pair**, existing.
- `pencil` → **manual provider**, explicit-only, existing.
- `codebase-memory` / `serena` → **code-intelligence providers** with distinct
  question routing (architecture/dependency/call-graph/blast-radius →
  codebase-memory; symbol definition/reference/rename/refactor →
  Serena/native LSP).

### 7.2 Missing candidates to add (each with full lock envelope)

1. `impeccable` — source https://github.com/pbakaus/impeccable; explicit-only;
   effectful install (hooks/provider behavior); quarantine + full-tree
   inspection; source_auditable/install authority recorded.
2. `vercel-react-best-practices` — individual skill under
   https://github.com/vercel-labs/agent-skills; own immutable revision, hash,
   license, route precision (high — 70 impact-ordered rules).
3. `vercel-web-design-guidelines` — individual skill under the same source.
4. `callstack-react-native-best-practices` — individual skill under
   https://github.com/callstackincubator/agent-skills.
5. `trail-of-bits-security` — https://github.com/trailofbits/skills;
   `trust: community → curated`; security review mandatory before anything;
   route only on matching threat/change surface; owner approval required.

Every record must carry (already enforced by
`schemas/skill-fabric-candidate.schema.json`): id, source URL, source type,
immutable revision (commit/tag, never branch), tree/content hash, license,
trust state, security review, portability, trigger facts,
`never_from_keywords_alone: true`, route precision, benchmark evidence,
install authority, preview command, install command, verify command,
rollback/uninstall plan, materialization mode, host support,
selected/rejected/blocked state. Raw shell strings stay out of the schema
(`shell_strings_forbidden: true`); recipes are recorded as reference metadata
in this research document, never as executable payloads.

### 7.3 Rejection/block reasons and lock requirements

- All 8 existing records remain `rejected` — the validators recompute scores
  from lock/benchmark evidence; nothing is marked selected because it is
  "official" (invariant 13). Selected set stays empty until hard gates pass.
- Common reject reasons: `license-unreviewed`, `security-review-pending`,
  `below-threshold (score < 70)`; add `benchmark-pending` as soon as
  WITH/WITHOUT evals exist.
- New lock requirement surfaced by research: **install authority** — who may
  materialize (owner-approved plan; explicit command; installer role) — and
  **rollback record** per host projection (mirrored by
  `selection_manifest.projection_receipts`).
- Schema amendment needed later (Phase 1, owner-approved): extend `kind` enum
  with `shell-middleware` (and, if needed, `provider`); add optional
  `classification`/`enforcement` metadata for middleware records. Until the
  amendment lands, RTK stays `cli-tool` — no silent schema drift.

## 8. Requirements / claims / tasks

### REQ (requirements)

- **REQ-001** — Keep `integrations/registry.json`, `skills/candidate-fabric.json`,
  and `skills/catalog.json` as the single canonical owners; any new taxonomy is
  a compatibility projection over them; no competing registry/lock file.
- **REQ-002** — Route by logical capability contract
  (`code.graph`, `code.symbol`, `docs.library`, `browser.verify/explore/debug`,
  `design.pen`, `shell.output.reduce`, `mobile.device`, `security.review`,
  `database.migration`, `api.contract`, `observability.integration`) with
  preferred→fallback providers via CapabilityBroker; TaskPacket schema
  unchanged.
- **REQ-003** — Typed decision-fabric routing (shadow→active) promotes only
  through parity/ablation evals; semantic keywords never gate security,
  verification, scope, completion, migration, permissions, or acceptance.
- **REQ-004** — `requires` means true dependency only; remove semantic requires
  (e.g. `browser-qa -> qa-skills`) and rebuild the graph via canonical builder.
- **REQ-005** — Skill fabric slimming is parity-gated: catalog dispositions,
  removal gates, and route fixtures all honored; no mass deletion; no
  hand-editing of `generated/`.
- **REQ-006** — External candidate governance: add the five missing candidates
  with full lock envelopes; keep the selected set empty until hard gates pass;
  install authority + rollback records per host.
- **REQ-007** — Integration registry reclassification: RTK as shell middleware
  with per-host enforcement and measured reduction; Context7 CLI-first with MCP
  escalation and trigger cleanup; codebase-memory as on-demand `code.graph`
  with advisory metadata and fallback; Chrome DevTools as `browser.debug`
  escalation with privacy flags and isolated profiles; Playwright CLI default,
  `playwright` keyword trigger removed from MCP.
- **REQ-008** — Serena remains explicit-only experimental until lifecycle,
  fallback, permission, and ablation evidence justify owner-approved promotion.
- **REQ-009** — Verification provider adapters
  (`testcontainers`, `pact`, `schemathesis`, `semgrep`, `codeql`, `k6`,
  `maestro`, `opentelemetry`, `storybook`) are exposed through the capability
  map; missing provider → `UNAVAILABLE`/BLOCKED, never fabricated PASS.
- **REQ-010** — WITH/WITHOUT candidate evaluation model measured on:
  verified pass rate, token/context cost, wall time, correction count, repair
  count, out-of-scope edits, trigger precision, trigger recall, fallback
  success, stale provider behavior, install/reconcile correctness, rollback
  correctness; decisions per rule set (Δpass≈0 + context cost → DELETE/REJECT;
  low recall but useful → deterministic router; model already good → DELETE/
  optional; always required → MOVE TO POLICY; capability unavailable →
  BLOCKED/NEEDS_USER).
- **REQ-011** — Pencil stays explicit-only through the stable launcher with
  bounded startup and real handshake; unavailable = BLOCKED/NEEDS_USER; never
  persist/exec `/tmp/.mount_Pen.*`.
- **REQ-012** — Global MCP stays `none`; capability-surface profiles
  (none/code-explore/code-symbol/docs/browser-verify/browser-explore/
  browser-debug/design-pencil/shell-efficient) are composed by the harness, not
  selected by the model.

### CLM (claims — evidence-bound, no worker-authored PASS)

- **CLM-001** — The eight existing external candidate records remain canonical
  and unreclassified away from their lock envelopes (evidence:
  `validate-skill-fabric.py` on current file + this delta).
- **CLM-002** — The five missing sources are required to fully represent the
  research inventory (evidence: attachments A/B source lists vs
  `external_source_matrix` ids).
- **CLM-003** — The external selected set is empty because no source passes
  license + security + benchmark + 70-point gates (evidence: qualification
  receipts in `candidate-fabric.json`).
- **CLM-004** — Decision fabric governs in shadow mode today; no routing
  behavior change occurs until parity/ablation evidence is recorded
  (evidence: `runtime.ts` default `'shadow'`, `compareDecisionFabric`
  differences in route receipts).
- **CLM-005** — Deterministic browser verification default is Playwright CLI;
  MCP is exploration; DevTools is debugging (evidence: registry priorities 10/30/30
  and capability separation `browser.verify/explore/debug`).
- **CLM-006** — RTK value is measured by the harness (raw vs filtered output,
  A/B), not by `rtk gain` self-report (evidence: measurement eval fixture to be
  added in Phase 3).
- **CLM-007** — codebase-memory results are advisory when coverage/freshness
  metadata is missing or stale; absence of graph results never proves absence
  of references (evidence: health/coverage receipt contract added in Phase 2).
- **CLM-008** — Serena stays explicit-only until promotion evidence exists
  (evidence: registry fallback text + REQ-008 decision record).
- **CLM-009** — Pencil is explicit-only with foreground + handshake
  requirements (evidence: AGENTS.md, launch.mjs, handshake-check.mjs).
- **CLM-010** — Global MCP profile default remains `none` (evidence:
  integrations README + installer profile).
- **CLM-011** — `generated/context-graph.json` changes only through canonical
  builders; hand edits are forbidden (evidence: routing.ts source-hash
  enforcement + repository map).
- **CLM-012** — No second registry/lock architecture is introduced (evidence:
  REQ-001 + this document's compatibility-projection design).

### TASK (work items, ordered by phase)

- **TASK-001** (P0) — Produce read-only inventory delta: this document.
- **TASK-002** (P1) — Add capability-map artifact (capability ↔ provider ↔
  transport ↔ effect) as a generated projection over the registry; keep one
  canonical owner.
- **TASK-003** (P1) — Add the five missing candidate-fabric records with lock
  envelopes; run `validate-skill-fabric.py`.
- **TASK-004** (P1) — Schema amendment (owner-approved): `kind` enum extension
  (`shell-middleware`), optional `classification`/`enforcement` fields, with
  validator fixtures; no raw shell strings.
- **TASK-005** (P1) — Registry reclassification metadata: RTK middleware +
  per-host enforcement; Context7 CLI provider + capability alias
  `docs.library` ↔ `docs.lookup`; codebase-memory coverage/freshness receipt
  contract.
- **TASK-006** (P2) — Remove semantic requires (`browser-qa → qa-skills`,
  similar) and keyword triggers (`playwright`, `research`) via canonical graph
  rebuild; update route fixtures.
- **TASK-007** (P2) — Decision-fabric shadow telemetry: capture
  `differences` in route receipts; define promotion criteria.
- **TASK-008** (P2) — Enforce explicit-only clamps: `best-of-n` worker cap 2,
  `context-evolution-protocol` explicit-only, Pencil never keyword-routed.
- **TASK-009** (P3) — External governance run: preview → pin → full-tree
  inspect → license/security review → behavioral eval → rollback record →
  (owner-approved) selection.
- **TASK-010** (P4) — Bounded skill rewrites under parity: `browser-qa` (thin),
  `researcher` (shrink), `docs-style` (focused + docs contract), `quality`
  (deterministic + focused reviews), `context-evolution-protocol`
  (explicit-only maintenance); catalog disposition transitions after eval
  parity.
- **TASK-011** (P4) — Provider cutover behind evidence: CBM advisory metadata,
  Context7 CLI-first, DevTools debug-only flags, RTK middleware.
- **TASK-012** (P5) — WITH/WITHOUT ablation corpus, trigger precision/recall
  fixtures, route-parity run, certification across certified hosts.

## 9. Evaluation model (WITHOUT vs WITH)

Per candidate: verified pass rate, token/context cost, wall time, correction
count, repair count, out-of-scope edits, trigger precision, trigger recall,
fallback success, stale provider behavior, install/reconcile correctness,
rollback correctness. Decision rules (research attachment A, §IX of the brief):

- Δ pass ≈ 0 and context cost ↑ → DELETE/REJECT.
- auto-trigger recall low but candidate useful → deterministic router.
- model already does it well → DELETE or optional.
- always required → MOVE TO POLICY.
- capability unavailable → BLOCKED/NEEDS_USER, never invented.

Repository seam: `packages/kernel/src/northstar/eval-lab.ts` already models
trials/arms with `active_skills`/`active_capabilities`/`mean_active_*`; extend
with the required metrics and a WITHOUT/WITH arm pair (TASK-012).

## 10. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-01 | Mass skill deletion breaks graph generation, route fixtures, consumers, legacy behavior | High | Catalog removal gates + parity evidence; rebuild via canonical builder; tombstone records |
| R-02 | Moving verification/completion out of kernel violates PASS/fail-closed invariants | Critical | verification-router/parity/qa-skills move only into policy+verifier structures that already exist (decision-fabric, verification-graph, providers/*) |
| R-03 | Serena promotion without authority evidence | High | REQ-008 gate; explicit-only until owner decision with ablation evidence |
| R-04 | Context7 CLI/MCP reclassification breaks installer, host projection, health, fallback, evidence | High | Additive capability alias; keep pinned MCP; measure in this harness, not upstream docs |
| R-05 | New registry/lock duplicates existing fabric | Medium | REQ-001 compatibility projection; one canonical owner (harness-maintainer) |
| R-06 | External skill supply chain (scanner bypass, hidden payload, mutable refs) | Critical | Pin + hash + license + full-tree inspect + permission review + behavioral eval; scanner supplemental only; community → quarantine |
| R-07 | Keyword routing used for correctness-critical gates | Critical | Invariant 15; typed decision fabric; security/verification/scope/completion never phrase-gated |
| R-08 | `requires` misuse hides policy/capability dependencies | Medium | REQ-004 semantic-requires cleanup; validator fixture |
| R-09 | Host parity (7 hosts, 5 certified; opencode no hook; codex instruction-only RTK) | High | `platform-contracts.json` per-host enforcement; certification requires live evidence |
| R-10 | Graph migration (generated/context-graph.json + route fixtures) | High | Plan-local impact graph; builder-only regeneration; route-parity fixtures |
| R-11 | Installer/rollback correctness on reclassification | Medium | install/verify/uninstall scripts already per integration; extend with middleware + rollback records |
| R-12 | Verification/acceptance weakened to make a run green | Critical | Evidence ledger + AM-0005 stages + independent channels unchanged; any change requires parity eval |
| R-13 | RTK altering evidence or hiding failure | High | Middleware never touches evidence; measured reduction only (CLM-006) |
| R-14 | Codebase-memory treated as source of truth | Medium | Advisory metadata + fallback (CLM-007) |
| R-15 | Pencil stale mount paths / silent unavailability | Medium | launch.mjs + handshake + BLOCKED/NEEDS_USER (already in AGENTS.md) |

## 11. Phase plan (owner-authorized, compatibility-first, fail-closed)

**Phase 0 — Read-only inventory** (this delta). No runtime change.
- Outputs: this document; matrices 4–7; REQ/CLM/TASK; risk register.
- Verification: `git diff` shows only `.agent/research/...`; validators still
  green (baseline run below).

**Phase 1 — Taxonomy/registry compatibility**
- TASK-002 (capability map projection), TASK-003 (five candidates + locks),
  TASK-004 (schema amendment), TASK-005 (registry reclassification metadata).
- Constraints: additive only; no behavior change; `kind` extension + new fields
  gated by validator fixtures; no raw shell strings.
- Verification: `node automation/validate-tool-registry.mjs`;
  `python automation/validate-skill-fabric.py`;
  `python automation/validate-skill-catalog.py`; `npm run build`.

**Phase 2 — Routing/activation**
- TASK-006 (requires + keyword trigger cleanup, graph rebuild),
  TASK-007 (decision-fabric shadow telemetry), TASK-008 (explicit-only clamps).
- Constraints: graph rebuilt via canonical builder only; decision fabric stays
  shadow; keyword gates removed from security/verification/scope paths.
- Verification: `python automation/validate-route-parity.py`;
  `python automation/validate-decision-fabric.mjs`;
  `python automation/validate-agent-skills.py`;
  `python automation/validate-rule-contracts.py`; `npm test`.

**Phase 3 — External candidate governance**
- TASK-009 (preview → pin → inspect → review → eval → rollback → select).
- Constraints: nothing selected without owner approval; install authority and
  rollback records mandatory; all-detected-host projection parity.
- Verification: `python automation/validate-skill-fabric.py`;
  `node automation/verify-external-receipt.py` (existing external receipt
  validator); `npm run verify:all`.

**Phase 4 — Bounded migration**
- TASK-010 (skill rewrites under parity), TASK-011 (provider cutover behind
  evidence: CBM advisory, Context7 CLI-first, DevTools debug-only flags, RTK
  middleware).
- Constraints: every DELETE/MOVE honors the catalog removal gate; behavioral
  parity before cutover; `generated/` via builders only.
- Verification: `python automation/validate-route-parity.py`; `npm test`;
  `npm run verify:all`; per-skill fixture suites.

**Phase 5 — Evals and certification**
- TASK-012 (WITH/WITHOUT corpus, precision/recall fixtures, certification).
- Verification: `python automation/select-verification.py fixtures`;
  `python automation/collect-live-results.py`; `npm run verify:all`;
  `automation/ci-certify.sh` (or platform certification scripts) across the 5
  certified hosts.

**Exact verification commands (planned baseline + per phase)**
```bash
npm ci && npm run build && npm test && npm run verify:all
node automation/validate-tool-registry.mjs
python automation/validate-skill-fabric.py
python automation/validate-skill-catalog.py
python automation/validate-route-parity.py
python automation/validate-agent-skills.py
python automation/validate-rule-contracts.py
node automation/validate-decision-fabric.mjs
python automation/select-verification.py fixtures
```
Note: `generated/context-graph.json` regeneration and host certification are
PS1-driven on the CI/Windows host (`automation/build-context-graph.ps1`,
`automation/ci-certify.sh`); on this Linux host the graph builder equivalent is
invoked through the canonical build pipeline only.

## 12. BLOCKED / NEEDS_USER / UNRESOLVED

- **BLOCKED (evidence)**
  - Adding `impeccable`, `vercel-react-best-practices`,
    `vercel-web-design-guidelines`, `callstack-react-native-best-practices`,
    `trail-of-bits-security` as qualified records: immutable revision, license
    SPDX, and security-review status for each source must be established at the
    pinned commit before the record can leave `pending`; until then they are
    candidate/rejected entries, never selected.
  - Trail-of-Bits internal engagement numbers (201 skills / 84 agents / ~20% of
    reported bugs) and the codebase-memory paper numbers (83% answer quality,
    92% file-exploration, ~10× fewer tokens, ~2.1× fewer tool calls) are cited
    by the research but **not** treated as established without primary sources.
  - Context7 CLI availability/pinning/portability on all 7 hosts is unresolved.
  - CBM health/coverage metadata contract (`indexed`, `revision_matches_head`,
    `parser_coverage`, `requested_files_covered`) has no schema yet.
- **NEEDS_USER (authority)**
  - Owner authorization for a new phase plan and a new current-pointer
    transaction (`.agent/current.json` is gen 14, tip AM-0006, plan
    `harness-universal-reconciliation-v1`, state
    `PARTIAL_NEEDS_REMEDIATION_FOCUS_WORKSPACE_BOUNDARY_NOT_TERMINAL`); this
    research is not an activation.
  - Serena promotion from explicit-only → routed experimental (REQ-008).
  - Decision-fabric `active` mode promotion criteria.
  - Which hosts enable RTK middleware and with which enforcement mode.
  - Pencil live availability (owner starts pen.dev) for any live design proof.
- **UNRESOLVED (design)**
  - Exact capability-name aliasing (`docs.lookup` ↔ `docs.library`,
    `output.compress` ↔ `shell.output.reduce`, `code.semantic` ↔
    `code.graph`/`code.symbol`) — additive alias table vs rename; parity
    fixtures required.
  - Whether `kind` extension needs a new `provider` kind or reuses
    `mobile-provider`/`verifier-provider` for agent-device and the
    `integrations/providers/*` adapters.
  - The precise WITHOUT/WITH eval corpus and thresholds (Anthropic/Vercel
    datapoints are directional, not this repo's threshold).
  - Ownership of future `capabilities/`, `providers/`, `middleware/` directory
    naming is a design decision, not a research fact.

## 13. Closeout

- **Proposed plan status**: NEW owner-authorized phase (candidate) — do not
  activate until the owner approves and a current-pointer transaction is
  created; never silently supersede the existing plan (AGENTS.md
  next-phase steering).
- **Files intended to change** (during implementation phases, after owner
  authorization): `skills/candidate-fabric.json`; `schemas/skill-fabric-candidate.schema.json`;
  `integrations/registry.json` (+ `integrations/recommended/{rtk,context7,codebase-memory-mcp,chrome-devtools-mcp,playwright-mcp}/*`);
  `skills/{browser-qa,researcher,docs-style,quality,context-evolution-protocol,best-of-n}/SKILL.md` + `ROUTE.json`;
  `skills/catalog.json`; `automation/` validators and fixtures;
  `generated/context-graph.json` (only via canonical builder);
  platform host projections (only with parity); this research file is the only
  change made by this pass.
- **Files forbidden to change**: `generated/` by hand; installed runtime
  mirrors (`~/.config/opencode`, `~/.codex`, `~/.claude`, etc.);
  `.agent/current.json` and `.agent/plans/*` originals without owner
  authorization; `packages/kernel` runtime semantics without parity evidence.
- **Acceptance evidence required**: green `npm run build && npm test &&
  npm run verify:all`; `validate-tool-registry.mjs`,
  `validate-skill-fabric.py`, `validate-skill-catalog.py`,
  `validate-route-parity.py`, `validate-decision-fabric.mjs`,
  `validate-rule-contracts.py`; route-parity fixtures for every changed
  ROUTE/graph node; WITHOUT/WITH ablation records for every candidate or
  rewrite; rollback + projection receipts for any selected external source.
- **Owner decisions required**: (1) authorize a new phase plan + pointer
  transaction, or amend the active plan; (2) Serena promotion boundary;
  (3) RTK per-host enablement; (4) decision-fabric active-mode criteria;
  (5) candidate selection (none before hard gates); (6) capability-alias
  strategy (additive vs rename).
- **Is implementation safe to start?** Only as **Phase 0/1 read-only or
  additive work** under an owner-authorized plan. No runtime behavior changes,
  no deletions, and no external materialization are safe before Phase 3 hard
  gates and owner approval. The repository is otherwise green (per the active
  plan's verification baseline); this research pass changes nothing but
  `.agent/research/`.

---

## 14. Implementation delta — skill-mcp-fabric-v1 (2026-08-14, owner-authorized)

This section records what the owner-authorized phase implemented on top of this
research artifact (plan `skill-mcp-fabric-v1`, pointer generation 15,
transaction `CAS-b43b741b68`; plan artifacts under
`.agent/plans/skill-mcp-fabric-v1/`, ledger under
`.agent/ledger/skill-mcp-fabric-v1.json`).

### Phase 0 — plan and pointer
- Created the owner-authorized plan (original.md = raw brief verbatim;
  plan.md; plan.json; decisions.json; requirements.yaml REQ-001..014;
  amendment AM-0001 = this artifact copy).
- Relation to previous plan: **supersession** — `harness-universal-
  reconciliation-v1` (gen 14, tip AM-0006) remains durable history, not
  claimed terminal; no concurrent goals.
- Pointer CAS gen 14 → 15 with `expected_previous_generation: 14`,
  verified by readback.

### Phase 1 — taxonomy / compatibility projection
- `packages/kernel/src/northstar/routing.ts`: additive `CAPABILITY_ALIASES`
  + `canonicalCapability` (`docs.library`→`docs.lookup`,
  `shell.output.reduce`→`output.compress`, `code.graph`/`code.symbol`→
  `code.semantic`, `design.pen`→`design.inspect`); applied in
  `CapabilityBroker.resolve`/`provider`. Legacy names stay canonical.
- New kernel test `packages/kernel/test/capability-aliases.test.ts` (6 tests);
  kernel suite green (91 tests).
- `integrations/registry.json`: RTK `classification: shell-middleware` +
  per-host `enforcement` (claude hook-hard, opencode plugin-hard, codex/
  antigravity best-effort); Context7 removed from `core` profile (docs
  on-demand, `research` profile retains the pinned MCP) and generic
  `research` trigger removed; Playwright MCP keyword trigger `playwright`
  removed (exploratory escalation only); codebase-memory `advisory_contract`
  (coverage/freshness metadata; never negative proof).
- Validator green: `validate-tool-registry.mjs` (PASS v2, 7 integrations).

### Phase 2 — routing / activation
- `skills/browser-qa/ROUTE.json`: removed semantic `requires: qa-skills`
  (invariant 15) and generic catch-all signals `browser`, `e2e` (invariant 16:
  keyword-only must not activate the exploratory skill; intent-bearing signals
  remain). qa-skills stays reachable through parity-verification's own
  requires and its own signals.
- Fixtures updated to the new contract: `context-route-cases.json`
  (`manual-browser` required_skills []), `route-parity-cases.json`
  (`keyword-alone-no-heavy-provider` stack [browser-qa]),
  `automation/test-skill-gate-stack.py` (asserts qa-skills is NOT required).
- Generated graph regenerated via canonical builder
  (`pwsh automation/build-context-graph.ps1` → `generated/context-graph.json`,
  version 2, 220 nodes; browser-qa requires []).
- `test-context-router.py` PASS (38 cases); `validate-route-parity.py` PASS
  (17 cases, both routers); `validate-workflow-semantics.mjs` PASS.

### Phase 3 — external candidate reconciliation
- Added five external records to `skills/candidate-fabric.json` with real
  pins resolved from GitHub on 2026-08-14:
  - `impeccable` — pbakaus/impeccable @ c8f476b330395031bc8f7a7aee8d848bc85c81e4
    (tree 4379c1abeecd7eb0046eb86e20c466a7b4115371, Apache-2.0, score 63/70)
  - `vercel-react-best-practices` — vercel-labs/agent-skills @
    b8caa260a420a73042e35521de4b5c8baf6446cc (tree 96a7470a8c0eb61db3438ec489da261b7b9eedf8,
    license unresolved/blocked, score 55/70)
  - `vercel-web-design-guidelines` — same pin (score 50/70)
  - `callstack-react-native-best-practices` — callstackincubator/agent-skills
    @ 2766baa46ca0fe7c16cc5ab4d0077ccec2e95fb9 (tree
    4fc1d02d24003c8120ae20b59dbd41ae5478753d, MIT, score 63/70)
  - `trail-of-bits-security` — trailofbits/skills @
    304c81a8cefb6e3c029ebd0d12940ccf0713eccb (tree
    3eafe5afe83163d3ca1d47e92cc168f570a07ff2, CC-BY-SA-4.0, score 63/70)
- All five `rejected` below the 70 threshold (license review pending/blocked,
  security review pending, benchmark pending); selected set stays empty.
  The vercel pin equals the existing `vercel-agent-skills` record pin
  (consistency check passed). No source was materialized (no install
  authority; recipes remain reference only).

### Phase 4 — bounded migration / docs
- No mass deletion; no destructive capability rename; all legacy skills and
  dispositions unchanged.
- Docs updated: `integrations/README.md` (profiles/taxonomy/middleware/
  advisory semantics), `skills/README.md` (conditional qa-skills routing
  note), `integrations/recommended/chrome-devtools-mcp/README.md`
  (debug-only policy, `--no-usage-statistics`, isolated profile, multi-tab
  caution), this artifact.

### Phase 5 — evals / verification / acceptance
- Baseline + targeted verification run; see the plan ledger and final handoff
  for per-REQ evidence mapping.
- Pre-existing (not caused by this phase): `packages/engine/test/browser-qa.test.ts`
  Control Plane WCAG/browser suite (21/31) fails on dev-server
  console/network errors and the overview-heading divergence (owner-state,
  FND-20260813-05); unrelated to routing/registry changes.
- Remaining BLOCKED/NEEDS_USER per research section 12 remain unchanged
  (Serena promotion, RTK per-host enablement, decision-fabric active mode,
  Pencil live proof, Context7 CLI host parity, candidate selection).

---

## 15. Full adoption delta — AM-0002 (2026-08-14, owner decision revision)

Owner revised DEC-005/DEC-007 (FULL ADOPTION MODE): every external skill
record and local composition candidate must be reconciled into
MATERIALIZED_SKILL / MATERIALIZED_PROVIDER / BLOCKED_WITH_EXACT_REASON.

### Materialized inventory (all with SKILL.md + ROUTE.json, activation class,
provenance, rollback)

- **9 local candidates → local skills** (harness-owned content):
  frontend-design-contract, mobile-composition, backend-composition,
  database-stack, schema-migration, infra-devops-composition,
  security-review, claim-test-strategy, external-skill-governance
  (activation classes: ROUTED, EXPLICIT for external-skill-governance).
- **11 external skill projections → skills/<id>/** (provenance-bound, content
  never copied): anthropic-frontend-design (Apache-2.0), vercel-agent-skills,
  vercel-react-best-practices, vercel-web-design-guidelines (content BLOCKED:
  no LICENSE file in pinned tree b8caa260 — exact reason recorded),
  expo-skills (MIT), prisma-skills (MIT), supabase-agent-skills (MIT),
  hashicorp-agent-skills (MPL-2.0), impeccable (Apache-2.0, EXPLICIT),
  callstack-react-native-best-practices (MIT), trail-of-bits-security
  (CC-BY-SA-4.0, EXPLICIT).
- **Providers:** agent-device → `integrations/recommended/agent-device/`
  (manifest + scripts, registry entry, capability `mobile.device`,
  explicit-only); chrome-devtools-mcp already materialized (registry +
  manifest enriched with capability route).
- **Security:** static provenance scans of all 11 pinned trees recorded under
  `.agent/evidence/skill-mcp-fabric-v1/provenance-scans/` (0 ELF binaries;
  exec/network/archive inventory; scan-level approval; execution authority
  NONE).
- **Selection manifest:** `selected_external_skills` lists the 11 materialized
  skill records; projection receipts per detected host (content-hash parity,
  "complete"); providers typed provider/MCP with registry consistency.
- **Validators updated (fail-closed):** materialized record requires artifact
  + route (or provider manifest with capabilities); ROUTE.json requires an
  activation class and non-generic triggers; materialized source requires
  immutable pin + content hash; content materialization must be BLOCKED
  without license/security evidence; selected set must equal the materialized
  set; registry/fabric provider consistency enforced.
- **Schema:** `skill-fabric-candidate.schema.json` extended (backward
  compatible): status/selection `materialized`; activation_class,
  install_authority, permission_review, materialization_receipt, route_receipt,
  content_materialization (optional).

### Status per record (13 external + 9 local)

- MATERIALIZED_SKILL: 9 local + 8 external (anthropic, expo, prisma, supabase,
  hashicorp, impeccable, callstack, trail-of-bits) + 3 content-BLOCKED
  projections (vercel-agent-skills, vercel-react-best-practices,
  vercel-web-design-guidelines — license exact reason).
- MATERIALIZED_PROVIDER: agent-device, chrome-devtools-mcp.
- No candidate disappeared; nothing was installed or executed; global MCP
  stays none; Pencil stays explicit-only.
