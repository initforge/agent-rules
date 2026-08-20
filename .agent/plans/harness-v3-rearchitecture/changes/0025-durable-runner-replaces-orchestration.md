# 0025 — durable runner replaces orchestration runtime

**Date:** 2026-08-04
**Trigger:** Owner review found the orchestration layer non-functional, and identified
the review loop as structurally unable to terminate.

## What was found

The orchestration runtime reported `VERIFIED` in README while having no executor:

- `worker-adapter.ts` `buildWorkerScript()` returned only
  `console.log('Worker starting for', assignmentId)` — the "worker" performed no work,
  yet `collectReceipt()` still emitted a `WorkerReceipt` with a diff fingerprint,
  hashing the *entire current content* of owned paths rather than a diff.
- `opencode-adapter.ts` was metadata-only (`attestation: null`,
  `NATIVE_ATTESTATION_MISSING`), with live child-session control gated off.
- `execution-facade.ts` stated in its own header: *"skip — parallel execution,
  cross-run coordination, incremental diffs."*
- `grep -rn "claude -p|codex exec|opencode run"` returned **0 hits** across the repo:
  nothing ever spawned a real agent.
- `.agent/trace.jsonl` held **3 lines** total, despite telemetry, calibration, token
  attribution, and OTLP export all being present.

Consequence: prompting each task by hand was genuinely faster than the harness, and
the concurrency tuning constants (8 normal / 10 burst / 6 min-ready-evidence) had no
measurement behind them.

## Why the review loop could not terminate

Four causes, multiplicative:

1. **No repair-depth bound.** `grep maxRepairDepth` → 0 hits. Every review finding
   minted a child task requiring its own independent review. Observed chains:
   `ASN-P1-R2 → R2B → R2C-A/B → PARITY-V3-01 → 01-R1 → 01-R2` and
   `R3C → R3C-R1 → R3C-R1A → R3C-R1B → R3C-R2 → R3C-R2-R1`.
2. **Prose acceptance criteria.** 500+ character run-on clauses meant a reviewer could
   always find something unmet, so `PASS` was statistically unreachable.
3. **Contract mutation mid-flight.** 23 amendments (4,933 lines vs. an 824-line
   original) kept marking prior evidence stale
   (`SOURCE_MATCH_GENERATED_FRESHNESS_PENDING`).
4. **Self-inconsistency.** HASH-001: the effective contract's on-disk hash diverged
   from its own lineage capture. Two files numbered `0023` (one calling itself
   `AM-0024`); `0004` missing entirely.

## Requirements added

| id | statement |
|---|---|
| R-001 | Disk task queue with atomic claim |
| R-002 | Worker adapter spawns a real headless agent CLI |
| R-003 | Runner loop drains the queue with no LLM in the loop |
| R-004 | Repair depth bounded at 2, then NEEDS_USER |
| R-005 | Append-only hash-chained journal |
| R-006 | Receipt validation rejects false-verified and doc-only diffs |
| R-007 | Command validation before spawn |
| R-008 | `.agent` protocol enforced by validator |
| R-012 | Telemetry actually written during a run |
| R-013 | Critical path runs on Linux, Windows, macOS |

## Requirements superseded

| id | superseded_by | why |
|---|---|---|
| R-014 controller/supervisor pool | R-003 | pool had no real worker |
| R-015 dual autopilot | R-003 | two implementations, two terminal tokens |
| R-016 worktree train | R-003 | sequential branches suffice; left 4 fake gitlinks |
| R-017 amendment ledger + global hash | R-008 | root cause of HASH-001 |
| R-018 resource broker + governor | R-003 | two implementations for concurrency 1 |

## Requirements dropped

| id | why |
|---|---|
| R-019 remote attestation | structurally blocked: TPM unreadable unelevated |
| R-020 cross-host child sessions | disabled in code by design |
| R-021 semantic wake policy | no executor ever drove the waiting states |

## Design of the replacement

The reason a long-running agent session gets compacted and loses context is that it is
*one long session*. The runner inverts this: it is a plain Node process with **no LLM**,
so it has no context window to exhaust. Each task is a **separate headless process with
a fresh context** that lives for minutes and exits. All state is on disk.

```
runner (long-lived, 0 tokens of context)
  ├─ claim task atomically from queue
  ├─ spawn: claude -p / codex exec / opencode run   ← fresh context, short-lived
  ├─ collect receipt: real diff + real exit codes
  ├─ append hash-chained journal record
  └─ next task
```

Overnight capacity is therefore bounded by disk and wall-clock, not by context.

## Carried forward

`SafeArgvRunner.validateCommand` and `validateReceipt` (real guards, kept as R-007 and
R-006), `AutopilotJournal`'s hash chain (extracted to `journal.ts`, R-005),
`checkpoint-resume`, `tool-output-broker` (keeps tool output out of context),
`native-session-adapter` (the one working live integration), and the `telemetry.ts`
event schema.
