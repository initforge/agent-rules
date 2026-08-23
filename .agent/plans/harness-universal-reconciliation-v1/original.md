# Harness Universal Reconciliation v1 — Owner Intent

## 1. Mission

Build one real harness system that converts a strong plan into a deterministic,
portable execution bundle. Codex, OpenCode/DeepSeek, Antigravity, or another
registered coding host must execute the same requirements without re-planning,
silently dropping intent, inventing interfaces, weakening proof, or diverging in
installed skills/tools/MCP providers.

This is a new owner-authorized phase. It carries proven V3/V3.1 behavior forward;
it does not reopen completed work or treat old phase-specific validators as the
new authority.

## 2. Source authority

- Owner conversation and approved plan in the Codex task on 2026-08-12.
- Raw discussion attachment:
  `/home/linhnxdeveloper/.codex/attachments/3049d62f-3c16-482b-9f58-47bdca439765/pasted-text.txt`.
- Repository truth at baseline `main@6e9a554a164e3a7d26df3cdb296392284c8c3166`.
- Proven candidate commits `d23b12a` and `b5231f7` in the detached
  `agent-rules-control-plane-v2` worktree.

The attachment is raw evidence, not always-loaded instruction. This file is the
distilled owner contract for implementation.

## 3. Observable outcome

One command compiles a plan into a hash-bound execution bundle. A host `/goal`
launcher consumes that bundle, runs bounded worker recipes, verifies claims,
reconciles drift, repairs safe mismatches, checkpoints progress, and stops only
at PASS, PARTIAL, NEEDS_USER, or BLOCKED with evidence.

Codex may use native `/goal`. OpenCode receives a harness-generated `/goal`
compatibility command. Native and emulated capabilities remain distinguishable.

## 4. Plan and handoff requirements

1. Preserve raw intent, requirements, decisions, assumptions, claims, tasks,
   source anchors, ownership, proof, amendments, checkpoints, and evidence.
2. Compile self-contained worker recipes; weaker workers must not reinterpret
   architecture or fill missing business truth.
3. Refuse compilation while material ambiguity or owner-required decisions remain.
4. Require an implementation-intent receipt before a worker mutates its slice.
5. Support selective recipe regeneration without changing unaffected tasks.
6. Use logical capability/model classes; never hard-code a provider model ID into
   the portable plan.
7. Coordinate through the ledger, not free-form agent-to-agent conversation.
8. Default to zero subagents, maximum two, no recursion, and disjoint write scope.

## 5. Reconciliation requirements

Reconciliation must re-derive and compare:

```text
intent -> requirements -> claims -> tasks -> diff -> evidence
source locks -> selected providers -> installed hosts -> projected runtime
```

It runs after compilation, before each slice, after repair, on resume, before
completion, and during runtime installation. Safe drift is repaired transactionally;
missing authority, unsupported hosts, and unavailable business truth fail closed.

“Any platform” means any registered HostAdapter. An unknown platform must return
`UNSUPPORTED`; it must never receive a false parity PASS.

## 6. Host and runtime parity

The canonical host set is Codex, Claude, Grok, OpenCode, Antigravity, Cursor, and
retired-platform. Detect installation from multiple signals: binary, desktop process,
known install roots, config, receipt, and live probe. A config directory alone is
not proof that the application is installed.

The harness installer must materialize the complete selected skill set and the
required provider projections on every actually installed host. Absent hosts are
skipped with receipts. Availability never grants task authority.

## 7. Skills and external sources

Keep portable `SKILL.md` content and harness-owned `ROUTE.json` sidecars. Store
external sources as immutable URL/command/ref/hash/license/trust/install records.

An external skill is selected only when it passes source integrity, license,
security/content review, portability, route precision, and benchmark gates. A
selected set is installed completely across installed hosts; unselected sources
remain catalog references and are not loaded.

Qualification uses verified task success, time-to-verified, determinism,
portability, context cost, and maintenance cost. No-skill is a valid result.

## 8. Capability and provider system

The kernel owns capability, verification, evidence, effect, and routing contracts.
Providers are replaceable adapters. Implement support for:

- `rg` first for code search; semantic providers only when facts require them;
- Testcontainers for disposable real dependencies and migrations;
- Pact for consumer/provider contracts;
- Schemathesis for OpenAPI/GraphQL behavior;
- Playwright CLI for normal browser proof;
- Playwright MCP for exploration and Chrome DevTools MCP for diagnosis;
- Storybook for component states when stories exist;
- Maestro for mobile/device flows;
- Semgrep locally and CodeQL in CI for security claims;
- k6 only with explicit thresholds/SLO claims;
- OpenTelemetry/Collector for distributed diagnosis and telemetry claims;
- Pencil/pen.dev for explicitly selected visible design work.

All providers are implemented in this phase, but activation is claim- and
RepoFacts-driven. Do not globally expose every MCP schema or run every tool in
every repository.

## 9. Visible application policy

Local browser QA, mobile interaction, and Pencil design work must open the real
application in the foreground so the operator can watch. CI may use an explicit
headless profile with a receipt.

Pencil discovery must use a live process, host config, stable installation root,
or `pen` CLI. Never persist an AppImage path under `/tmp/.mount_*`.

When an app/provider is missing, automatically install a pinned official
user-space package. If installation requires elevation, EULA, login, or manual
GUI work, open the official link and return the exact blocker.

## 10. Verification policy

Test every acceptance claim with the cheapest evidence that actually proves it.
Prefer real browser/device behavior for user-facing business flows; use scripts
for deterministic contracts, schemas, and negative boundaries. Do not inflate
coverage or write deep ceremonial tests that still miss actual behavior.

At minimum, each new provider or adapter needs one positive case, one important
negative case, and one recovery/unsupported case. Build-only evidence cannot
prove runtime, UI, security, migration, or parity claims.

Repair is bounded to two attempts per claim. A worker never authors PASS.

## 11. Rule and context architecture

One concept has one owner:

- global invariant in `rules/`;
- triggered procedure in `skills/`;
- host delta in `platforms/`;
- provider implementation in `integrations/`;
- plan-local decisions and evidence in `.agent/`.

Audit duplicates and conflicts before adding context. Retire V3/V3.1 hard-coded
active gates only after generic pointer-driven replacements have behavioral
parity. Preserve historical proof.

## 12. CI and bounded execution

All commands, process waits, browser starts, and external checks require explicit
timeouts and cleanup. Hosted quality is the required GitHub check. Native
self-hosted certification must not create a required dependency that can remain
queued forever; unavailable runners produce explicit advisory evidence.

CI must be green for the exact candidate SHA and final `main` SHA.

## 13. Dogfood requirement

Development of this phase uses the new behavior as soon as each foundation is
available: compiled recipes, receipts, bounded repair, provider routing,
reconciliation, runtime parity, and evidence-led completion. Do not postpone
dogfooding until a later reinstall.

## 14. Closeout authority

The harness may automatically prepare a closeout report. Commit, push, updating
`main`, deleting branches, or removing a worktree require one owner approval over
an exact CloseoutReceipt.

After approval: commit the candidate branch, obtain candidate CI, fast-forward
and push `main`, obtain final CI, reinstall/reconcile installed hosts, compact
`.agent`, and delete the exact approved local/remote branch set. Remote/SHA drift
invalidates the receipt; never force-push implicitly.

## 15. `.agent` compaction

Keep original intent, effective plan, decisions, requirement-to-evidence summary,
source locks, final receipts, and hashes. Archive raw runs/checkpoints
content-addressably and tombstone superseded authority. Purge only disposable
scratch. Never delete evidence needed to justify PASS.

## 16. Non-goals

- Do not continue the unrelated Control Plane redesign in the untracked
  `control-plane-v2` support directory.
- Do not install coding hosts that are absent from the machine.
- Do not globally enable every MCP or skill for every task.
- Do not replace missing product/business truth with agent invention.
- Do not commit, push, merge, deploy, delete branches, or remove worktrees before
  an approved CloseoutReceipt.

## 17. Completion condition

The phase is complete only when the plan bundle works through Codex native goal
and the OpenCode goal bridge without requirement loss; all registered adapters
pass fixtures; installed hosts reconcile; selected skills/providers have parity
receipts; visible-app rules are observed; local verification and hosted CI pass;
`.agent` is compacted; and owner-approved Git closeout leaves `main` as the newest
remaining branch.
