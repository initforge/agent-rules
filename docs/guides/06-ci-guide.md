# CI workflow guide

## Workflow structure

| Workflow | Trigger | Required | Jobs |
|---|---|---|---|
| `quality` | PR + push to any branch | **Yes** | quality (cross-platform matrix), security (audit/SAST/scan), quality-aggregate |
| `certification` | push main, manual, weekly Mon 06:00, release | No | certify (self-hosted native matrix), certify-aggregate (manifest+hash+metadata verification) |

## Required check configuration (manual GitHub setting)

Navigate to **Settings → Branches → main → Edit rules → Require status checks**.

Add the following required checks. GitHub displays matrix entries as `<job name> / <matrix label>`. The exact names appear after the first `quality` workflow run:

| Status check | Rationale |
|---|---|
| `quality (linux) / (ubuntu-latest)` | Build + test + certification (Linux) |
| `quality (windows) / (windows-latest)` | Build + test (Windows) |
| `quality (macos) / (macos-latest)` | Build + test (macOS) |
| `security / (ubuntu-latest)` | npm audit, Semgrep SAST, secret scanning |
| `quality-aggregate / (ubuntu-latest)` | Gates merge on quality + security pass |

Do **NOT** add `certification` as required. It is advisory and runs only on trusted events (push main, manual, schedule, release), never on pull_request.

## Required vs advisory

### Required (`quality`)
- **Deterministic**: never depends on native CLI availability, network access, or model inference.
- **Fast fails**: `quality` runs build+check+test first; `security` runs in parallel.
- **All-or-nothing**: no path filters — every PR runs every job. A passing required CI guarantees:
  - TypeScript compiles without errors.
  - All unit and parity tests pass on all three platforms.
  - Runtime builds successfully.
  - Security audit, SAST, and secret scanning pass.
- **Timeout**: 30 minutes per matrix job, 15 minutes for security.
- **Playwright preflight**: Linux runner installs Playwright Chromium with system deps. Preflight check confirms readiness before tests.
- **Permissions**: `contents: read` only. No secrets or deploy keys.

### Advisory (`certification`)
- **Non-deterministic**: depends on which native CLIs (codex, cursor, antigravity, grok, opencode) are installed on the self-hosted runner.
- **Never runs on pull_request**: only trusted events (push to main, workflow_dispatch, schedule, release) — untrusted PR code never reaches native runners.
- **Artifact manifest**: each certify job generates a JSON manifest containing the attestation SHA, commit SHA, repository, run ID, and host identity.
- **Aggregate verification**: downloads all attestation+manifest artifacts, verifies content hash matches manifest, confirms exact commit/repo/run metadata, and checks host uniqueness.
- **Timeout**: 60 minutes per self-hosted certify job.
- **Scheduled**: runs weekly to track native host availability trends.

## Security model

| Concern | Decision |
|---|---|
| Secret exposure | No workflow uses `secrets.*`. All dependencies are public npm/pypi packages. |
| PR fork access | `pull_request` trigger (not `pull_request_target`) on quality — no privileged context. Certification omits pull_request entirely. |
| Script injection | All dynamic values (`matrix.host`) used in positional arguments, never interpolated into shell. |
| Dependency caching | Not configured — all installs are `npm ci` (locked, no `package-lock.json` mutation). |
| Third-party actions | Only `actions/*` — `checkout`, `setup-node`, `upload-artifact`, `download-artifact`. Semgrep and gitleaks SHA-pinned. No unverified actions. |

## Artifacts

| Workflow | Artifact | Contents |
|---|---|---|
| `certification` | `attestation-<host>` | Attestation ledger JSON + manifest JSON per host |

## Concurrency

- **`quality` on PR**: Cancel in-progress runs when a new push supersedes them. Does NOT cancel on `main` — every main branch run completes.
- **`certification`**: Always cancel in-progress — only the latest run matters.

## Failure semantics

| Workflow | Job failure → workflow outcome |
|---|---|
| `quality` | Red. Any failed job fails the workflow. A PR with a red quality check must not merge. |
| `certification` | Red per-job. Aggregate verifies manifest content, hash, metadata, and host uniqueness. The workflow reflects the actual certify result. |
