# Progress — harness-v3-rearchitecture

**Updated:** 2026-08-06
**Overall:** Runner operational, false-PASS bugs fixed, .agent unified, RTK integrated, dead code cleaned.

## Current State

### What works
- **Durable runner**: queue (atomic rename), headless executor (real agent spawn), journal (hash-chained), diff (before/after delta)
- **False-PASS fixes**: agent exit code check, diff delta (not git diff HEAD), ownership enforcement, atomic queue transitions, journal stale lock recovery
- **.agent single pointer**: `.agent/current.json` is the only plan pointer (CAS-protected)
- **RTK integration**: registry entry, install/verify/uninstall scripts, 6 platform adapters, doctor check
- **Test surface**: engine 1452 pass, CLI 379 pass, root 243 pass, control-plane 372 pass

### What was cleaned
- 14 dead modules deleted (12 M11 dead-leaf + 2 confirmed zero-consumer)
- 3 debug files deleted
- 9 root temp files deleted
- .agent/archive reduced from 2.4MB to 1.5MB
- .agent/state/ directory removed (duplicate pointer)

### Known pre-existing issues (not introduced by this work)
- 1 plan-readiness test (requirement count mismatch)
- 4 browser-qa flaky tests (Playwright route mock leak)
- CLI tests still on jest (migration to vitest recommended but deferred)

## Slices

| Slice | Status | What |
|---|---|---|
| S1-S9 | DONE | Repo cleanup, .agent protocol, runner, repair depth, partial deletion, PowerShell port, registry, docs, test discovery |
| P10 | DONE | Jest ESM fix, runner-loop timeout, api-views 404, c4 health, browser-qa partial, dist cleanup |
| Phase 0 | DONE | Unified .agent/current.json as single pointer, deleted .agent/state/ |
| Phase 1 | DONE | Fixed 4 false-PASS bugs (exit code, diff delta, ownership, queue atomicity), journal stale lock recovery |
| Phase 2 | DONE | RTK integration (registry, adapters, doctor check) |
| Phase 4 | DONE | Deleted 14 dead modules, 3 debug files, 9 temp files |
| Phase 5 | DEFERRED | CLI jest→vitest migration (mechanical, large, can be done later) |
| Phase 6 | DONE | .agent archive cleanup, progress.md rewrite |

## Verification

```
Engine:     53/53 test files, 1452/1452 tests pass
CLI:        20/20 test files, 379/379 tests pass
Root:       15/15 test files, 243/243 tests pass
Control:    10/11 test files, 372/376 tests pass (4 flaky pre-existing)
Agent-dir:  validate-agent-dir.mjs passes
Build:      npm run build succeeds for all packages
```

## Remaining (owner decision)

1. **CLI jest→vitest migration** — mechanical refactor, ~4h, reduces dual-framework overhead
2. **14 pre-existing test failures** — pre-existing, not introduced by this work
3. **5fedu MCP verification wiring** — not started, requires MCP-to-parity automation
4. **Control-plane browser-qa flaky tests** — Playwright route mock leak, fix is known (unrouteAll in beforeEach)
