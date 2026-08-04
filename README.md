# Agent Rules

**Thesis:** One canonical harness for AI agents — flat role-based folders, lazy skills, platform deltas, and automation that keeps runtime mirrors in sync without editing generated output by hand.

## Architecture

| Subsystem | Status | Path |
|-----------|--------|------|
| Intent Compiler (P3) | OPERATIONAL | `packages/cli/src/compiler/` |
| Canonical Contracts (P4) | VERIFIED | `packages/engine/src/contracts.ts` |
| Plan Lifecycle (P5) | OPERATIONAL | `packages/engine/src/plan-lifecycle.ts` |
| **Evaluation & Telemetry (P7)** | **PARTIAL** | `packages/engine/src/telemetry.ts` |
| Orchestration Runtime (P8) | VERIFIED | `packages/engine/src/controller.ts` |

### P7 Telemetry

`packages/engine/src/telemetry.ts` — Canonical event collector. Records structured events (`run_start`, `agent_start`, `task_start`, `tool_call`, `model_turn`, `verification`, `review`, `handoff`, `run_end`) through the full agent lifecycle. Supports local JSONL storage and OTLP export. Configurable retention (default 30d metadata, 7d raw content).

## Shape

| Folder | Role | Taxonomy |
|--------|------|---------|
| `docs/guides/` | Maintainer docs and system map | stable (human-maintained) |
| `rules/` | Always-loaded global context (numbered = load priority) | stable |
| `skills/` | Lazy-loaded capabilities (flat slugs) | stable |
| `integrations/` | Required / recommended / optional tools | stable |
| `profiles/` | Optional organization profiles (e.g., `5fedu`) | stable |
| `platforms/` | Per-runtime overlays (Codex, Grok, Antigravity, Cursor) | stable |
| `automation/` | Build, install, validate, sync, doctor | stable |
| `generated/` | Build output — do not edit | generated (machine-only) |
| `.agent/` | Durable plan ledger, progress, journal, research (version-controlled; see [`.agent/README.md`](.agent/README.md)) | protocol-governed |

## Integrations

Canonical registry: `integrations/registry.json` (v2, 4 entries):

| Integration | Policy | Capabilities | Trust |
|-------------|--------|-------------|-------|
| codebase-memory-mcp | required | codebase-intelligence | adapter-verified |
| playwright-mcp | required | browser-interaction | adapter-verified |
| chrome-devtools-mcp | required | browser-diagnostics | adapter-verified |
| caveman | optional | workflow-utility | advisory-only |

Profiles: `core` (codebase-memory-mcp), `qa` (playwright-mcp + chrome-devtools-mcp), `frontend` (playwright-mcp + chrome-devtools-mcp).

## Quick start

```bash
cd packages/cli && npm ci && npm run build
npm run test
```

Run engine tests:

```bash
cd packages/engine && npx vitest run
```

Run conformance evals:

```bash
cd evals/conformance && python -m pytest
```

## CI/CD

| Workflow | Trigger | Matrix | Steps |
|----------|---------|--------|-------|
| Quality (`quality.yml`) | push, pull_request | ubuntu, windows, macos | build → check → test → ci:quality |
| Certification (`certification.yml`) | push to main, release | opencode, grok, codex | build → ci:certify --host |

## Read next

1. [System map](docs/guides/00-system-map.md)
2. [Runtime model](docs/guides/01-runtime-model.md)
3. [Target operating model](docs/architecture/target-operating-model.md)
4. [Platform capability matrix](docs/guides/06-platform-capability.md)
5. Vietnamese overview: [README-vi.md](README-vi.md)

**Governance:** Edit `rules/` and `skills/` here only — not `generated/` or installed mirrors. Reverse sync via `automation/07-import-reviewed-changes.ps1`.
