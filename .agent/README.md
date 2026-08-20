# `.agent/` — Protocol

This directory is the agent's durable memory. It is **version-controlled on purpose**:
progress must survive a crash, a new machine, and a context reset. It is not scratch space.

The rules below exist because the previous layout collapsed under its own weight:
23 amendment files (4,933 lines) against an 824-line original plan, two files both
numbered `0023` (one of which called itself `AM-0024`), a missing `0004`, and a
global effective-contract hash that no longer matched its own lineage capture
(`HASH-001`). The fix is not "write fewer files" — it is **one source of truth per
question**, plus a validator that fails the build when that is violated.

---

## 1. Layout

```
.agent/
  README.md                     ← this protocol
  current.json                  ← the only pointer to the active plan (CAS-protected)
  plans/<plan-id>/
    plan.md                     ← IMMUTABLE original intent
    requirements.yaml           ← SOURCE OF TRUTH for scope
    changes/NNNN-<slug>.md      ← scope deltas, numbered, unique
    progress.md                 ← human-readable current state (overwritable)
    journal.jsonl               ← append-only, hash-chained machine events
  tombstones/                   ← deleted rules/skills, so reverse sync cannot resurrect them
  research/                     ← durable findings worth keeping across plans
  runs/<run-id>/                ← per-run evidence (gitignored, 30d retention)
  artifacts/                    ← tool output spill (gitignored)
  archive/                      ← closed plans and retired reports
```

Everything else that used to live at `.agent/` root is gone. If you need a scratch
file, put it in `.agent/tmp/` (gitignored) — never at the root.

---

## 2. What is authoritative

| Question | Answer lives in | Never in |
|---|---|---|
| What did the owner originally ask for? | `plan.md` | anywhere else |
| What is in scope **right now**? | `requirements.yaml` | `plan.md`, `changes/`, `progress.md` |
| Why did scope change? | `changes/NNNN-*.md` | `requirements.yaml` |
| What is the current status? | `progress.md` | `journal.jsonl` |
| What actually happened, provably? | `journal.jsonl` | `progress.md` |
| Which plan is active? | `current.json` | any other pointer file |

**One question, one file.** If two files can answer the same question, they will
eventually disagree, and then every reviewer relitigates which one is right. That is
what produced the unbounded review loop.

---

## 3. `plan.md` is immutable

Write it once. Never edit it — not to fix a typo, not to "clarify", not to reflect a
decision. It is the record of what was originally asked.

Scope changes go to `requirements.yaml` + `changes/`. This is what makes it possible
to answer "did we drift?" months later.

---

## 4. `requirements.yaml` — the flat ledger

```yaml
version: 1
plan_id: <plan-id>
requirements:
  - id: R-001
    statement: One sentence. Testable.
    status: active            # active | superseded | dropped | blocked
    verification:             # REQUIRED for status: active
      - npx vitest run packages/engine/test/foo.test.ts
    added_by: plan            # `plan` or a change id (e.g. 0003)

  - id: R-002
    statement: The old way of doing it.
    status: superseded
    superseded_by: R-014      # REQUIRED when status: superseded
    added_by: plan
```

### Replacing a requirement is two lines, not a new file

To retire `R-002` in favor of `R-014`:

1. On `R-002`: set `status: superseded`, add `superseded_by: R-014`.
2. Add `R-014` with `added_by: <change-id>`.

That is the whole refactor/mapping protocol. The old requirement stays visible with a
forward pointer, so nothing is lost and nothing is ambiguous. Do **not** rewrite
`R-002` in place, and do **not** create a document explaining the swap — the two
fields *are* the explanation.

### `verification` must be machine-checkable

Every `active` requirement needs at least one command. A requirement PASSES iff every
command exits 0. Prose is a note, never a closing condition.

This is the second half of the fix for the review loop. The old acceptance criteria
were 500+ character run-on sentences, so a reviewer could always find one unmet
clause and mint another repair task — hence chains like
`ASN-P1-R2 → R2B → R2C-A/B → PARITY-V3-01 → 01-R1 → 01-R2`. A command either exits 0
or it does not.

---

## 5. `changes/NNNN-<slug>.md` — scope deltas

Use one when scope genuinely changes mid-flight.

- **Numbers are unique and strictly increasing.** No gaps, no duplicates. (The old
  tree had two `0023` files and no `0004`.)
- **Max 150 lines.** A change that needs more is a new plan.
- A change may **add** requirements or **mark existing ones superseded/dropped**.
  It may never rewrite `plan.md` or restate the whole contract.
- The change file explains *why*; `requirements.yaml` records *what*.

Template:

```markdown
# 0003 — <slug>

**Date:** YYYY-MM-DD
**Trigger:** what was learned that made this necessary

## Requirements added
| id | statement |
|---|---|
| R-014 | ... |

## Requirements superseded
| id | superseded_by | why |
|---|---|---|
| R-002 | R-014 | ... |
```

### Frozen contract during a run

A change takes effect on the **next** run. It never invalidates evidence produced by
the run in flight. Retroactive invalidation is what produced
`SOURCE_MATCH_GENERATED_FRESHNESS_PENDING` and made work go stale faster than it
could close.

---

## 6. No global effective-contract hash

Requirements are hashed individually, if at all. There is deliberately **no** single
hash over the composed contract.

`HASH-001` happened because the whole contract was hashed and captured in a lineage
file, so any edit anywhere desynchronized the two, and the only sanctioned repair
path was `boundedRepair()` — several hundred characters per line, effectively
unreviewable. A flat ledger has no such failure mode: there is nothing to desync.

---

## 7. Anti-bloat limits (enforced)

`node automation/validate-agent-dir.mjs` fails when:

| Limit | Value |
|---|---|
| `changes/` per plan | ≤ 20 files |
| lines per change file | ≤ 150 |
| `plan.md` mutated after creation | forbidden |
| duplicate change numbers | forbidden |
| `active` requirement without `verification` | forbidden |
| `superseded` requirement without `superseded_by` | forbidden |
| stray files at `.agent/` root | forbidden |
| fixture/test dirs under `plans/` | forbidden |

Closed plans move to `archive/`. `runs/` and `artifacts/` are gitignored with 30-day
retention.

---

## 8. Committed vs. ignored

**Committed** (progress must survive): `state/`, `plans/`, `archive/`, `tombstones/`,
`research/`, this file.

**Ignored** (regenerable or bulky): `source-lock-cache/` (was 35 MB), `runs/`,
`artifacts/`, `tmp/`.

Never commit anything a command can regenerate.
