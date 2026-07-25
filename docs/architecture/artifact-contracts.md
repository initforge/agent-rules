# Portable Artifact Contracts

Version 1 — 2026-07-25

## Purpose

Define versioned, platform-neutral JSON schemas for artifacts that cross agent,
host, or runtime boundaries. These schemas describe portable artifacts independently
of Codex, Grok, Antigravity, Cursor, or any other specific agent platform.

## Design principles

| Principle | Meaning |
|---|---|
| **Platform-neutral** | No provider-specific tool names, model IDs, or platform conventions in common schemas. Use logical classes (economy/standard/expert, native/emulated/unsupported/unverified). |
| **Versioned** | Every schema carries `schema` (artifact type discriminator) and `version` (integer, const). |
| **Machine-validated** | JSON Schema 2020-12, `additionalProperties: false` everywhere to reject unknown fields. |
| **Human-readable** | Clear property names, `description` fields, and consistent patterns across all schemas. |
| **Extensible** | New optional properties can be added in minor schema versions. Unknown fields are rejected (not silently accepted). |
| **Stable logical classes** | `economy`/`standard`/`expert` for capability class; `native`/`emulated`/`unsupported`/`unverified` for runtime mode; `low`/`medium`/`high`/`unset` for effort. |
| **Unknown states preserved** | `null` values, `unverified`, `unset`, `unknown` enum members preserve lack of knowledge. |
| **Requested/resolved/observed** | Model and effort routing must distinguish intent, host resolution, and independent observation. Evidence and receipts carry the full triple. |
| **Evidence traceability** | Evidence records identify environment, command, artifact, expected/observed result, and the claim proved. |

## Schema catalog

| Schema | Artifact type | Schema discriminator | Version |
|---|---|---|---|
| `plan.schema.json` | Executable plan contract | `artifact/plan` | 1 |
| `requirement.schema.json` | Source requirement (original/injection/discovery) | `artifact/requirement` | 1 |
| `decision.schema.json` | Owner or architect decision | `artifact/decision` | 1 |
| `assignment.schema.json` | Delegation capsule to a sub-agent | `artifact/assignment` | 1 |
| `agent-result.schema.json` | Delegated agent output (receipts, usage, outcome) | `artifact/agent-result` | 1 |
| `evidence.schema.json` | Claim-to-proof record | `artifact/evidence` | 1 |
| `capability.schema.json` | Model/tool capability declaration | `artifact/capability` | 1 |
| `model-route.schema.json` | Requested→resolved→observed model route | `artifact/model-route` | 1 |
| `telemetry-event.schema.json` | Single telemetry event during an agent run | `artifact/telemetry-event` | 1 |
| `profile-manifest.schema.json` | Artifact identity/version/source manifest | `artifact/profile-manifest` | 1 |

## File layout

```
schemas/
  plan.schema.json
  requirement.schema.json
  decision.schema.json
  assignment.schema.json
  agent-result.schema.json
  evidence.schema.json
  capability.schema.json
  model-route.schema.json
  telemetry-event.schema.json
  profile-manifest.schema.json
  fixtures/
    positive/
      plan-valid.json
      plan-minimal.json
      requirement-valid.json
      decision-valid.json
      assignment-valid.json
      agent-result-valid.json
      evidence-valid.json
      capability-valid.json
      model-route-valid.json
      telemetry-event-valid.json
      telemetry-event-tool-use.json
      profile-manifest-valid.json
    negative/
      plan-missing-outcome.json
      plan-bad-schema.json
      plan-extra-top-field.json
      plan-bad-acceptance-id.json
      requirement-bad-kind.json
      assignment-bad-tool-class.json
      evidence-missing-claim-hash.json
      capability-unexpected-extra.json
      model-route-missing-resolved.json
      profile-manifest-missing-sha256.json
      telemetry-event-bad-event-type.json
automation/
  test-artifact-schemas.py
```

## Schema details

### Plan (`plan.schema.json`)

An executable plan contract. Sections:

- **meta** — id, created_at, updated_at, source_refs
- **intent** — outcome, risk_classification (low/medium/high/unclassified), in_scope/non_goals, scope_lock, open_questions, assumptions
- **change_map** — array of {area, current_truth, exact_change, files, compatibility}
- **acceptance** — array of {id (pattern AC\d+), claim, proof_profile, required_dimensions, required_kinds}
- **task_graph** — array of {id, name, work, depends_on, capability_class, write_paths, context_paths, forbidden_paths, acceptance_ids, review_required, rollback_point}
- **execution_contract** — mode (automatic), shape (small/medium/large/resumable), ledger (off/auto/required), strategy, max_agents, max_depth, effort_cap, authorized_final_actions, proof_profiles
- **repository_truth** — baseline, branch, architecture, reference_map
- **risks** — array of {risk, early_signal, prevention, regression_surface, recovery}
- **long_ledger** — optional requirement_ids, decision_ids, injection_ids, discovery_ids, receipt_ids, usage, resume_point

### Requirement (`requirement.schema.json`)

A source requirement captured during work.

- **kind** — original | injection | discovery | external
- **body** — full text
- **source_ref** — who or what originated it
- **slice_ids** — which slices are affected

### Decision (`decision.schema.json`)

An owner or architect decision.

- **rationale** — why this choice was made
- **alternatives** — optionally list rejected options with reasons
- **decided_by** — who decided
- **affected_slices** — which slices are constrained by this decision
- **revisit_if** — condition that would invalidate the decision

### Assignment (`assignment.schema.json`)

A delegation capsule sent to a sub-agent. Contains only the facts needed to act and prove.

- **mission** — the goal and acceptance mandate
- **source_ids** — requirement, decision, injection, and discovery IDs
- **write_paths** / **context_paths** / **forbidden_paths** — file system boundaries
- **allowed_tool_classes** — read/edit/test/shell/browser/network/git/external-write
- **capability_class** — economy | standard | expert | unassigned
- **ack_status** — pending | acknowledged | recovery-signal | unacknowledgeable
- **capsule_hash** — sha256 of the capsule content for integrity verification

### Agent Result (`agent-result.schema.json`)

The output of a delegated agent.

- **status** — PASS | PARTIAL | BLOCKED | FAIL | NOT_RUN
- **orchestration_status** — healthy | recovering | degraded | exception | unverified
- **receipts** — array of proof receipts, each containing: acceptance_id, claim, claim_hash, status, provenance, proof_kind, dimensions, expected/observed, environment, command, artifact_evidence, model_evidence
- **usage** — input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, tool_calls, turn_count

### Evidence (`evidence.schema.json`)

A standalone claim-to-proof record. The most detailed schema for traceability.

- **claim** / **claim_hash** — what is being proved
- **contract_hash** — optional hash of the acceptance contract this evidence satisfies
- **environment** — {platform, host_os, runtime_version, tool_versions}
- **command** — {executable, arguments, working_directory, sha256, expected_exit_code}
- **tool** — {name, class, version}
- **artifact** — {path, sha256, size_bytes, modified_at}
- **expected** / **observed** — what was predicted vs what actually happened
- **output_hash** — sha256 of command output
- **exit_code** — integer exit code or null
- **proof_profile** — name of the evidence proof profile used (from evidence-profiles.json)
- **model_evidence** — full requested/resolved/observed triple

### Capability (`capability.schema.json`)

Declares a model/tool capability class with runtime characteristics.

- **mode** — native | emulated | unsupported | unverified
- **isolation** — workspace | sandbox | none | unverified
- **permission_model** — host-enforced | advisory-delegated | none | unverified
- **subagent_support** — native | emulated | unsupported | unverified
- **model_attestation** — native | emulated | unsupported | unverified
- **context_delivery** — file-based | inline | api | unverified

### Model Route (`model-route.schema.json`)

The requested→resolved→observed triple.

- **requested** — {capability_class, effort, provider_preference} (what the planner asked for)
- **resolved** — {provider, model_family, model_version, effort, fallback_reason} (what the host assigned)
- **observed** — {provider, model_family, model_version, effort, attestation_status} (what was independently attested)
- **denial_behavior** — fail_closed | fail_closed_partial | fail_open | unset

### Telemetry Event (`telemetry-event.schema.json`)

A single recorded action during an agent run.

- **event** — model_call | tool_use | subagent_spawn | context_load | test_run | final_outcome
- **event_detail** — event-specific payload (model tokens, tool exit code, subagent assignment, context source, test results, final status)
- **actor** — main | worker | unknown
- **token_usage** — optional token counts

### Profile Manifest (`profile-manifest.schema.json`)

Identity/version/source for a deployed artifact.

- **source** — {repository, path, branch, commit}
- **sha256** — content hash
- **dependencies** — array of {name, sha256, version}
- **signing** — optional cryptographic signature

## Validation

Run the schema validation tests:

```bash
python automation/test-artifact-schemas.py
```

This validates:
- Every schema is valid JSON Schema 2020-12
- Every positive fixture validates against its schema
- Every negative fixture fails for the intended reason
- Acceptance criteria: version present, no provider-specific model names in common schemas, capability supports all 4 mode states

## Compatibility

These schemas are **new additions** — they do not replace or modify existing schemas
in `automation/` (`work-ledger.schema.json`, `live-result.schema.json`, etc.).
Existing validation remains green.

## Deferred migrations

- Migrate `work-ledger.schema.json` receipts to reference `evidence.schema.json`
- Migrate `work-ledger.schema.json` telemetry events to reference `telemetry-event.schema.json`
- Migrate `trace-schema.json` to reference `telemetry-event.schema.json`
- Update `live-result.schema.json` evidence array to reference `evidence.schema.json`
- Add `automation/context-graph.schema.json`, `platform-contracts.schema.json` as profile manifests
- Add `$ref` integration between plan and assignment schemas via a shared meta-schema

## Risks

| Risk | Mitigation |
|---|---|
| Schema drift between `schemas/` and `automation/*.schema.json` | Periodic audit; deferred migration list above |
| New schemas not referenced by existing code | No runtime imports needed — schemas are portable contracts, not code libraries |
| Provider names accidentally added in future schema versions | CI test (`test-artifact-schemas.py`) scans schemas for known provider model name patterns |
