# CI workflow guide

## Workflow structure

| Workflow | Trigger | Required | Jobs |
|---|---|---|---|
| `static` | PR + push to main | **Yes** | lint (tsc), test (vitest), build (runtime), validate (context), verify-mirrors |
| `native-smoke` | manual + weekly Mon 06:00 | No | build, doctor per platform, summary report |
| `evaluation` | manual + weekly Mon 02:00 | No | benchmark-contracts, agent-quality, live-adapter-contracts, route-conformance |

## Required check configuration (manual GitHub setting)

Navigate to **Settings → Branches → main → Edit rules → Require status checks**.

Add the following required checks. GitHub displays matrix entries as `<job name> / <matrix label>`. The exact names appear after the first `static` workflow run:

| Status check | Rationale |
|---|---|
| `lint (tsc) / (ubuntu-latest)` | TypeScript compilation |
| `lint (tsc) / (windows-latest)` | Cross-platform TS compilation |
| `test (unit + parity) / (ubuntu-latest)` | Unit + parity tests (Linux) |
| `test (unit + parity) / (windows-latest)` | Unit + parity tests (Windows) |
| `build (runtime) / (ubuntu-latest)` | Runtime build (Linux) |
| `build (runtime) / (windows-latest)` | Runtime build (Windows) |
| `validate (context) / (ubuntu-latest)` | Schema, contracts, audits (Linux) |
| `validate (context) / (windows-latest)` | Schema, contracts, audits (Windows) |
| `verify-mirrors / (ubuntu-latest)` | Mirror hash parity (Linux) |
| `verify-mirrors / (windows-latest)` | Mirror hash parity (Windows) |

Do NOT add `native-smoke` or `evaluation` as required. They are advisory.

## Required vs advisory

### Required (`static`)
- **Deterministic**: never depends on native CLI availability, network access, or model inference.
- **Fast fails**: `lint` runs first; subsequent jobs depend on it via `needs:`.
- **All-or-nothing**: no path filters — every PR runs every job. A passing required CI guarantees:
  - TypeScript compiles without errors.
  - All unit and parity tests pass on both platforms.
  - Runtime builds successfully (rules + skills + overlays + tools → `05-generated/runtime-build/`).
  - Context validation passes (token budgets, required paths, legacy file audit, skill BOM, trigger audit, routing conformance, contract tests).
  - Mirror verification passes (skills and core rules are byte-identical across platform builds).
- **Permissions**: `contents: read` only. No secrets or deploy keys.

### Advisory (`native-smoke`)
- **Non-deterministic**: depends on which native CLIs (codex, cursor, grok, gemini) are installed on the runner.
- **Never blocks a PR**: `continue-on-error: true` on the doctor step. The workflow always succeeds even when no native CLI is available.
- **Records availability**: each platform's doctor output is archived as an artifact.
- **Scheduled**: runs weekly to track native tool availability trends.

### Advisory (`evaluation`)
- **Non-deterministic**: benchmark quality metrics vary by model version and inference cost.
- **Never blocks a PR**: `continue-on-error: true` on quality jobs. Benchmarks that produce low scores do not fail the workflow.
- **Artifacts only**: results are published as downloadable artifacts, never enforced as gates.
- **Scheduled**: runs weekly; can be triggered on demand with specific suite selection.

## Security model

| Concern | Decision |
|---|---|
| Secret exposure | No workflow uses `secrets.*`. All dependencies are public npm/pypi packages. |
| PR fork access | `pull_request` trigger (not `pull_request_target`) — no privileged context. |
| Script injection | All dynamic values (`matrix.platform`) used in positional arguments, never interpolated into shell. |
| Dependency caching | Not configured — all installs are `npm ci` (locked, no `package-lock.json` mutation). |
| Third-party actions | Only `actions/*` — `checkout`, `setup-node`, `setup-python`, `upload-artifact`, `download-artifact`. No unverified actions. |
| PowerShell | Installed via official Ubuntu package only on Linux. |

## Artifacts

| Workflow | Artifact | Contents |
|---|---|---|
| `static` | `test-results-<os>` | JUnit XML test report (if vitest reporter succeeded) |
| `static` | `runtime-build-<os>` | `manifest.json` + `model-policy.json` per platform |
| `static` | `validate-log-<os>` | Validate stdout/stderr (if any) |
| `native-smoke` | `runtime-build` | Full build output for all 4 platforms |
| `native-smoke` | `doctor-report-<platform>` | JSON doctor output per platform |
| `evaluation` | `evaluation-build` | Full `05-generated/` tree |
| `evaluation` | `benchmark-contracts-report` | Contract test log |
| `evaluation` | `agent-quality-report` | Agent quality log + evidence profiles |
| `evaluation` | `live-adapter-contracts-report` | Live adapter contract log |
| `evaluation` | `route-conformance-report` | Route conformance log |

## Concurrency

- **`static` on PR**: Cancel in-progress runs when a new push supersedes them. Does NOT cancel on `main` — every main branch run completes.
- **`native-smoke`**: Always cancel in-progress — only the latest run matters.
- **`evaluation`**: Always cancel in-progress — only the latest run matters.

## Failure semantics

| Workflow | Job failure → workflow outcome |
|---|---|
| `static` | Red. Any failed job fails the workflow. A PR with a red static check must not merge. |
| `native-smoke` | Green. `continue-on-error: true` on all doctor jobs. The summary step always runs. |
| `evaluation` | Green. `continue-on-error: true` on quality jobs. The summary step always runs. |
