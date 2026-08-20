# Schemas

**Purpose:** Definitions for project context packages, generated context, and data contracts.
**Routing:** Never auto-loaded. Read when building or validating context packages.

## Contract pairs — complement, not overlap

### `assignment.schema.json` ↔ `delegation.schema.json`

| Role | What | When |
|------|------|------|
| `assignment` (`artifact/assignment`) | The **request** capsule sent *to* a sub-agent — mission, capability class, allowed tools, write paths, receipt budget. | Sent before work begins. |
| `delegation` (`artifact/delegation`) | The **receipt** produced *after* completion — what was assigned, what changed, tool activity, evidence, result, status, integration verdict. | Created after the sub-agent finishes. |

They share the concept of sub-agent hand-off but at opposite lifecycle phases. An assignment is the input; a delegation is the audit-trail output. Both are required for a full delegation round-trip.

### `evidence.schema.json` ↔ `claim-evidence.schema.json`

| Role | What | When |
|------|------|------|
| `evidence` (`artifact/evidence`) | The **operational proof record** — what claim was proved, in what environment, via what command/artifact, with what observed outcome and attestation. | Written by a runner or verifier at proof time. |
| `claim-evidence` (`artifact/claim-evidence`) | The **requirement-to-evidence traceability link** — which requirement produced which claim, its evidence class, verifier, and status. | Written during audit/close-out to tie requirements back to evidence artifacts. |

`evidence` is the raw proof; `claim-evidence` is the traceability index that connects requirements to those proofs. A single `claim-evidence` entry typically references one or more `evidence` records.

### `model-route.schema.json` ↔ `model-routing.schema.json`

| Role | What | When |
|------|------|------|
| `model-route` (`artifact/model-route`) | A **single routing event triple** — what capability class was requested, what the host resolved, and what was independently observed. | Captured per-assignment at dispatch time. |
| `model-routing` (`artifact/model-routing`) | A **routing policy definition** — task class → risk, complexity, initial model class, escalation rules, fallback rules, budgets. | Written at configuration/deployment time. |

A `model-routing` policy drives how `model-route` entries get resolved; a `model-route` records what actually happened for one dispatch. Policy is the rule; route is the logged event.
