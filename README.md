# Agent Rules

**Thesis:** One canonical harness for AI agents — flat role-based folders, lazy skills, platform deltas, and automation that keeps runtime mirrors in sync without editing generated output by hand.

## Architecture

| Subsystem | Status | Path |
|-----------|--------|------|
| Intent Compiler (P3) | OPERATIONAL | `packages/cli/src/compiler/` |
| Canonical Contracts (P4) | VERIFIED | `packages/engine/src/contracts.ts` |
| Plan Lifecycle (P5) | OPERATIONAL | `packages/engine/src/plan-lifecycle.ts` |
| Evaluation & Telemetry (P7) | PARTIAL | `packages/engine/src/telemetry.ts` |
| **Durable Runner** | **OPERATIONAL** | `packages/engine/src/runner/` |
| Legacy orchestration runtime | SUPERSEDED | `packages/engine/src/controller.ts` |

### Durable Runner

`agent-rules runner {add,seed,start,status,journal}` drives tasks unattended.

One short-lived headless agent process per task (`claude -p`, `codex exec`, or
`opencode run`), all state on disk. The coordinating process holds no model context, so
it has nothing to compact and no window to exhaust — a run is bounded by wall-clock, not
tokens, and can be killed at any point: anything in flight returns to the queue.

A task passes only when every one of its verification commands exits 0 **and** the agent
produced a real `git diff`. Repair is bounded (`--max-repair-depth`, default 2); past the
bound a task becomes `needs-user` and mints no child task. Every run appends to a
hash-chained journal that refuses to read if a record is altered, reordered, or removed.

### Legacy orchestration runtime

`controller.ts` and its neighbours are retained only because `host-kit/runtime` and two
CLI/control-plane call sites still import them. They never executed autonomous work: the
worker adapter's `buildWorkerScript()` returned a single `console.log`, cross-host child
sessions were gated off, and `.agent/trace.jsonl` held 3 records for the project's entire
history. Do not build on them.

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
| context7 | required | research-context | adapter-verified |

Profiles: `core` (codebase-memory-mcp + context7), `qa` and `frontend` (playwright-mcp + chrome-devtools-mcp), `research` (context7).

All four install through `npx`/a pinned binary and are verified by `automation/validate-tool-registry.ps1`.

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

Verify everything (cross-platform; requires `pwsh`):

```bash
npm run verify:all
```

## Running work unattended

```bash
# Queue one task. At least one --verify command is required: a task with no
# machine-checkable condition can never be closed.
agent-rules runner add "Add subtract() to src/math.ts" \
  --verify "npx vitest run test/math.test.ts" --own src

# Or queue every active requirement from the plan ledger
agent-rules runner seed --own src

agent-rules runner start --agent claude --max-repair-depth 2
agent-rules runner status          # queue counts, and anything waiting on you
agent-rules runner journal --verify   # check the hash chain
```

Tasks that exhaust their repair budget land in `needs-user` with the reason recorded —
they do not silently retry forever.

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
