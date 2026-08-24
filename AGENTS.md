# agent-rules

Canonical runtime: `packages/engine/src/northstar/` and `packages/kernel/src/northstar/`
Trust/PASS semantics: `packages/engine/src/contracts.ts` and `packages/kernel/src/northstar/evidence-ledger.ts`
Spec-to-output flow: `packages/kernel/src/northstar/runtime.ts`

## Non-negotiable invariants

1. Preserve raw user intent and stable requirement/claim/task traceability.
2. Workers never author PASS; completion is derived from verifier evidence and acceptance audit.
3. Never weaken, skip, delete, or hard-disable verification to make a run green.
4. Stay inside owned scope; forbidden-scope edits fail closed.
5. Repair is bounded. Missing business/source truth becomes BLOCKED/needs-user, not invention.
6. Strong planners compile/repair contracts for S2/S3 or real ambiguity, then exit.
7. Subagents default to zero; max two, no recursion, only independent research/review/diagnosis/non-overlapping work.
8. Do not delete proven legacy behavior until its replacement has behavioral/eval parity.
9. Adaptive minimal-proof testing is always-on: every task selects the smallest
   sufficient proof set from scope, claims, risks and runtime surface; live
   claims require live proof; results use exactly PASS/PARTIAL/BLOCKED/
   UNSUPPORTED/PRE-EXISTING/NEEDS_USER; proof receipts record selected AND
   omitted proof (rule `rules/45-adaptive-minimal-proof-testing.md`, router
   `packages/kernel/src/northstar/proof-router.ts`, CLI `agent-rules proof-plan`).

## Quick start

```bash
npm ci
npm run build
npm test
npm run verify:all
```

## North-Star runtime

Source: `packages/engine/src/northstar/` over the proven durable runner in `packages/engine/src/runner/`.

```bash
agent-rules init --agent claude
agent-rules run "<S0/S1 task>" --own <path> --verify-exec <exe> --verify-arg <arg>
agent-rules status
```

S2/S3 raw intent must not execute until a strong planner has produced explicit requirements/claims/decisions and unresolved items are empty.

## Domain packs

Domain packs are explicit project context, never prompt-triggered global behavior.

`5fedu` owns a central, manifest-bound reference snapshot at `profiles/5fedu/reference-source/template`. Target projects do **not** install/copy that source. Use:

```bash
agent-rules init --domain-pack 5fedu
agent-rules reference 5fedu <manifest-bound-path>
```

Read `profiles/5fedu/module-mapping/behavior-contract.json` and exact source anchors before adapting ERP behavior. Do not infer target requirements merely because the reference implements something.

## Pencil

`integrations/manual/pencil-mcp/` is explicit-only. Do not auto-install, auto-route, or trigger it from words such as design/UI. Attach it only after the operator explicitly selects Pencil/pen.dev. `.pen` evidence is design evidence; production acceptance still requires browser/runtime proof.

Pencil MCP must attach through the stable launcher (`integrations/optional/pencil-mcp/launch.mjs`); never persist or exec `/tmp/.mount_Pen.*` paths (they go stale on every app restart — ENOENT). The Pencil desktop must be foreground-visible; startup is bounded by a timeout and verified by a real MCP handshake; unavailability is reported as BLOCKED/NEEDS_USER, never silently masked.

## Repository map

| Path | Owner | Purpose |
|---|---|---|
| `packages/engine/` | harness-maintainer | production execution and North-Star runtime |
| `packages/kernel/src/northstar/` | harness-maintainer | canonical runtime contracts and protocol |
| `packages/cli/` | harness-maintainer | public CLI |
| `rules/` | harness-maintainer | always-on invariants |
| `skills/` | harness-maintainer | lazy capability workflows |
| `schemas/` | harness-maintainer | portable artifact schemas |
| `platforms/` | harness-maintainer | host edges + contracts |
| `integrations/` | harness-maintainer | automatic and explicit-only tool providers |
| `profiles/` | profile-owner | optional domain packs |
| `evals/` | harness-maintainer | conformance/telemetry/evals |
| `automation/` | harness-maintainer | build/install/validation/certification |
| `generated/` | machine | generated output; never hand-edit |
| `.agent/` | protocol | durable plans/runs/evidence/journals |

## Before editing

Read `rules/manifest.yaml`, the canonical runtime contracts, and the relevant package/profile contract. Never edit `generated/` or installed runtime mirrors by hand. Do not commit/push/deploy unless explicitly requested.

## Next-phase steering

The previous closure contract and its plan-local support artifacts have been
retired. For future work, open a new owner-authorized phase plan and make its
current pointer the only active plan source. A newer request never silently
overrides an older one: classify every relation, keep compatible work in one
effective set, and require owner decision, parity, migration, or an explicit
blocker for conflicts and supersession. No item may disappear because of
wording, language, plan format, or compaction.
Clarification UI is host-capability-gated: ask only for
material ambiguity during discussion/spec/plan/review; implement from the
approved contract without preference polling; use `NEEDS_USER`/`BLOCKED` when
required authority or capability is missing. Do not treat an unstable Codex
feature flag, AGENTS.md convention, MCP, or skill as a guarantee of native UI
behavior. Raw session JSONL is telemetry, not an instruction source. Do not
run concurrent goals against the same worktree.
