# Release Report — global-agent-behavior-native-live-closure-v1

Status: IN PROGRESS (final SHAs/workflows appended at release)

## Local gates (all green)

| Step | Result |
|---|---|
| npm ci | PASS |
| npm run build | PASS (kernel+engine+cli+packaged runtime+behavior index) |
| npm run check | PASS (typecheck) |
| npm test (kernel) | 69 files, 586 passed, 31 skipped |
| npm test (engine) | 54 files, 1294 passed, 18 skipped (60s testTimeout for production-Runner) |
| npm test (cli) | 32 files, 537 passed, 4 skipped |
| npm run verify:all | PASS (incl. global-behavior 22, process-level 12, skill canaries 7, behavior index) |
| test:package-smoke | PASS (packaged CLI + RuntimeInstaller lifecycle) |
| offline 8-host proof | PASS (8/8 install Ready, offline canary PASS, byte-equal rollback) |
| global behavior suite | 22/22 invariants PASS |
| process-level integration | 12/12 PASS |
| skill live canaries | 7/7 PASS (21 assertions) |
| security validators | PASS (external sources, tool registry, no-5fedu-leakage, secret scan) |

## Native host matrix (offline)

| Host | HOST_PRESENT | NATIVE_INSTALLED | NATIVE_DISCOVERED | NATIVE_LIFECYCLE | NATIVE_POLICY | NATIVE_SKILLS | NATIVE_MCP | MODEL_BEHAVIOR | ROLLBACK_VERIFIED |
|---|---|---|---|---|---|---|---|---|---|
| codex | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NEEDS_USER | PASS |
| claude | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NEEDS_USER | PASS |
| grok | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NEEDS_USER | PASS |
| opencode | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NEEDS_USER | PASS |
| antigravity | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NEEDS_USER (live session LIVE_VERIFIED) | PASS |
| cursor | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NEEDS_USER | PASS |
| deepseek-harness | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NEEDS_USER | PASS |
| command-code | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NEEDS_USER | PASS |

Live model matrix: Antigravity LIVE session observed (host-generated telemetry, 1230 events); MODEL_BEHAVIOR claim = NEEDS_USER pending a bound nonce model turn in the foreground GUI (never fabricated). Cursor/Grok signed-out → NEEDS_USER (OFFLINE_VERIFIED only).

## Evidence artifacts committed

- .agent/plans/global-agent-behavior-native-live-closure-v1/ (plan.json, plan.md, original.md, requirements, decisions, verification-matrix, change-graph, semantic-admission, baseline-and-loss-map, behavior-contract)
- .agent/ledger/global-agent-behavior-native-live-closure-v1.json (gen 52 ACTIVE)
- .agent/evidence/global-agent-behavior-native-live-closure-v1/ (recon, native-8host offline, 8 host receipts, 14 journeys, global-behavior receipt)
- generated/behavior-index.json + .md (10 views)
- 34 global skills with SKILL.md canonical routing; 2 5fedu domain-pack skills
- 8 rules-to-5 rules parity; zero legacy-rule references in active source

## Release (final values to be appended after push)

- Local HEAD: (commit after push)
- origin/main: (after push)
- GitHub workflow head SHA: (after workflows)