# agent-rules

Canonical operating model: `docs/architecture/target-operating-model.md`
Requirement ledger: section 12 of operating model
Definition of Done: section 8 of operating model
Subsystem registry: section 6 of operating model

## Quick start

```bash
cd packages/cli && npm ci && npm run build
npm run test
```

## Repository map

| Path | Owner | Purpose |
|------|-------|---------|
| `.github/workflows/` | harness-maintainer | CI/CD (static.yml = required gate) |
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
