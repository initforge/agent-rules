# agent-rules

Canonical operating model: `docs/architecture/target-operating-model.md`
Requirement ledger: section 12 of operating model
Definition of Done: section 8 of operating model
Subsystem registry: section 6 of operating model

## Quick start

```bash
cd packages/cli && npm ci && npm run build
npm run test
npm run verify:all      # full gate; needs pwsh (cross-platform)
```

## Running work unattended

`agent-rules runner` drives tasks with one short-lived headless agent process per task
and all state on disk, so it survives being killed and has no context window to exhaust.
Protocol: `.agent/README.md`. Source: `packages/engine/src/runner/`.

```bash
agent-rules runner add "<task>" --verify "<command>" --own <path>
agent-rules runner start --agent claude --max-repair-depth 2
agent-rules runner status
```

Every task needs at least one verification command — a task with no machine-checkable
condition can never be closed. `packages/engine/src/controller.ts` and its neighbours are
superseded; do not build on them.

## Repository map

| Path | Owner | Purpose |
|------|-------|---------|
| `.github/workflows/` | harness-maintainer | CI/CD (quality.yml = required gate, certification.yml = native-only advisory) |
| `rules/` | harness-maintainer | Always-loaded global context (lean) |
| `skills/` | harness-maintainer | Lazy-loaded capability workflows |
| `schemas/` | harness-maintainer | Canonical portable artifact schemas |
| `platforms/` | harness-maintainer | Per-runtime adapters + contracts |
| `integrations/` | harness-maintainer | Tool & MCP registry |
| `profiles/` | profile-owner | Optional org overlays (5fedu, etc.) |
| `packages/cli/` | harness-maintainer | Cross-platform TypeScript CLI |
| `packages/control-plane/` | harness-maintainer | Local dashboard + API |
| `evals/` | harness-maintainer | Conformance, telemetry, controlled evals |
| `docs/` | harness-maintainer | Architecture, guides, decisions |
| `generated/` | machine | Build output — never hand-edit |
| `automation/` | harness-maintainer | Build, install, validate scripts |

## Before editing harness

1. Read `rules/manifest.yaml` and `docs/guides/00-system-map.md`
2. Understand the target operating model (`docs/architecture/target-operating-model.md`)
3. Never edit `generated/` or global runtime mirrors by hand
4. Do not commit, push, or deploy without explicit request
5. Work on feature branches only
