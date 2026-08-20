# Agent Rules

**Thesis:** one provider-neutral agent operating environment that turns user intent into bounded work, keeps workers cheap and replaceable, and derives completion from evidence rather than model claims.

## Canonical architecture

The North-Star runtime contract now lives in `packages/engine/src/northstar/` and `packages/kernel/src/northstar/`. New work starts from an owner-authorized phase plan; retired plan projections are not kept in the workspace.

| Subsystem | Status | Canonical implementation |
|---|---|---|
| WorkRequest / WorkSpec / TaskPacket / RunState | operational | `packages/engine/src/northstar/protocol.ts`, `compiler.ts` |
| Traceability + spec revision impact | operational | `packages/engine/src/northstar/compiler.ts` |
| Durable worker runtime + bounded repair | operational | `packages/engine/src/runner/`, `northstar/runtime.ts` |
| Evidence-derived acceptance | operational | `northstar/evidence-ledger.ts`, `acceptance-audit.ts` |
| Context Compiler | operational | `northstar/context.ts` |
| Skill Fabric | operational | `northstar/routing.ts` + `generated/context-graph.json` |
| Capability Broker | operational | `northstar/routing.ts` |
| Verification Graph | operational | `northstar/verification-graph.ts` + runner verifier |
| Model Governor | operational logical routing; host attestation required | `northstar/model-governor.ts` |
| Trigger normalization | operational core normalization | `northstar/trigger.ts` |
| Host adapters | mixed live-certification status | `platforms/`, `northstar/host-adapters.ts` |
| Domain packs | operational | `northstar/domain-packs.ts`, `profiles/` |

`packages/engine/src/controller.ts` and related legacy orchestration remain only where still imported. Do not delete a proven component until the North-Star replacement wins behavioral/eval parity.

## Trusted completion

The runtime flow is:

```text
WorkRequest -> WorkSpec -> TaskPacket -> bounded worker
                                      -> Verification Graph
                                      -> hash-chained Evidence Ledger
                                      -> deterministic acceptance
                                      -> independent acceptance audit
                                      -> PASS | PARTIAL | BLOCKED | FAILED
```

Workers never own PASS. Verification weakening, forbidden-scope edits, missing mandatory claims, invalid evidence chains, unresolved source locks, and exhausted repair budgets fail closed.

## 5fedu central reference pack

`profiles/5fedu/` is explicit-only and inactive for ordinary projects. The owner-supplied ERP template is bundled **once inside the harness** as a manifest-bound, SHA-256 verified reference snapshot. A target project does not install or copy that template.

```bash
# Explicitly opt this project into the pack
agent-rules init --domain-pack 5fedu

# Read an authoritative source file from the central harness snapshot
agent-rules reference 5fedu features/he-thong/nhan-vien/nhan-vien.module.tsx
```

The employee module is the canonical CRUD shell; department is the hierarchy/related-data shell; permissions derive from the actual module/route/permission sources. The pack stores source pointers and behavior contracts instead of asking a model to recreate ERP conventions from memory.

## Pencil / pen.dev

Pencil is intentionally **manual-only**. `integrations/manual/pencil-mcp/` is not in the automatic integration registry and has no keyword trigger. It is attached only when the operator explicitly selects Pencil/pen.dev (or explicitly selects its `design.*` provider). Browser/runtime evidence remains the authority for shipped UI behavior.

## Repository shape

| Folder | Role |
|---|---|
| `packages/engine/` | proven runtime plus North-Star facade |
| `packages/kernel/src/northstar/` | runtime contracts, protocol and trust decisions |
| `packages/cli/` | cross-platform control plane / public UX |
| `rules/` | tiny always-on invariants |
| `skills/` | lazy capability workflows |
| `integrations/` | automatic registry plus `manual/` explicit-only integrations |
| `profiles/` | explicit domain/project packs such as 5fedu |
| `platforms/` | host-specific edge adapters/contracts |
| `automation/` | build/install/validate/certification gates |
| `generated/` | machine output; never hand-edit |
| `.agent/` | durable plans, runs, checkpoints, journals and evidence |

## Quick start

```bash
npm ci
npm run build
npm test
npm run verify:all
```

`verify:all` is fail-closed. If a required host dependency such as PowerShell, Playwright/browser binaries, or a native agent CLI is absent, certification must report BLOCKED/FAIL rather than silently skipping it.

## North-Star direct run

For S0/S1 work with explicit scope and verifier:

```bash
agent-rules init --agent claude
agent-rules run "Fix parser regression" \
  --own src/parser \
  --verify-exec npm \
  --verify-arg=test \
  --verify-kind test
agent-rules status
```

S2/S3 work cannot be silently reduced to a single raw-intent task. It requires an explicit strong-planner/spec compilation step before TaskPackets are executable.

## Durable runner

The production runner remains available for plan-backed unattended work:

```bash
agent-rules runner add "Add subtract() to src/math.ts" \
  --verify "npx vitest run test/math.test.ts" --own src
agent-rules runner start --agent claude --max-repair-depth 2
agent-rules runner status
agent-rules runner journal --verify
```

Each task gets a fresh headless process. State, logs, checkpoint, verification results and journal live on disk; repair is bounded.

## Integrations

Automatic integrations are owned by `integrations/registry.json`. Manual/explicit-only tools live under `integrations/manual/` and are never auto-installed or auto-routed.

## Read next

1. [`packages/engine/src/northstar/`](packages/engine/src/northstar/)
2. [`packages/kernel/src/northstar/`](packages/kernel/src/northstar/)
3. [`profiles/5fedu/README.md`](profiles/5fedu/README.md) when the 5fedu pack is explicitly selected

**Governance:** edit canonical source, not generated/runtime mirrors. Never weaken a gate to make migration green.
