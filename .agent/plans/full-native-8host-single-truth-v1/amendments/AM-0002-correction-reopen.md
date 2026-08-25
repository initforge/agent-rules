# AM-0002 — CORRECTION + REOPEN (owner-authorized)

Classification: CORRECTION + REOPEN
Amends: full-native-8host-single-truth-v1 (AM-0001 global-behavior-contract)
Created: 2026-08-25T01:30:00Z
Reconciled: 2026-08-25T01:30:00Z
Disposition: CORRECTION — reopens ACTIVE/BLOCKED, preserves traceability, no new plan.

## Reason
Independent audit found untrusted worker narrative, false-green native certification, truth-chain inconsistency, synthetic global-behavior tests, single-source not real, public CLI not gọn, mode residue, and quality gates failing. Current pointer shows COMPLETED/PASS but ledger/evidence/candidate do not support it. Must reopen and correct in one continuous pass, max one correction batch, then final gate.

## Known blockers to fix (from audit)

1. Native-installer hard-codes PASS, no real model turn, placeholder MCP, stub rollback, JSONC loss, per-host lock not worktree lease, Ready recomputed before inventory, fallback c1deca1, dry-run false PASS, --host only targets[0].
2. Truth-chain: current COMPLETED but ledger ACTIVE with old 14 REQs, result binds only old HEAD, evidence not under .agent/evidence, host receipts in .agent/tmp, summary.json stale, requirement IDs not schema-valid.
3. Global-behavior tests synthetic (file existence, self-lock).
4. Single-source: ROUTE.json still authoritative, candidate-fabric active, context-graph prefers ROUTE.json.
5. Public CLI >40 commands, hideHelp not working, --host/--all incomplete, close still public.
6. Mode residue operator-profile/vibe-coder/plain-vietnamese/technical_explain in executable source and verify-windows-hosts.
7. Quality gates: pointer schema, MCP provisioning, host order, platform-contracts, hashes, verify:all, diff --check.

## Correction scope

- Reopen current pointer/ledger to ACTIVE/BLOCKED, remove result PASS authority during correction, preserve original intent + AM-0001 + dirty source coverage.
- Normalize requirement IDs to schema-valid REQ-001..REQ-028 with immutable mapping:
  - REQ-01 → REQ-001
  - REQ-02 → REQ-002
  - REQ-03 → REQ-003
  - REQ-04 → REQ-004
  - REQ-05 → REQ-005
  - REQ-06 → REQ-006
  - REQ-07 → REQ-007
  - REQ-08 → REQ-008
  - REQ-09 → REQ-009
  - REQ-10 → REQ-010
  - REQ-11 → REQ-011
  - REQ-12 → REQ-012
  - REQ-13 → REQ-013
  - REQ-14 → REQ-014
  - REQ-G01 → REQ-015
  - REQ-G02 → REQ-016
  - REQ-G03 → REQ-017
  - REQ-G04 → REQ-018
  - REQ-G05 → REQ-019
  - REQ-G06 → REQ-020
  - REQ-G07 → REQ-021
  - REQ-G08 → REQ-022
  - REQ-G09 → REQ-023
  - REQ-G10 → REQ-024
  - REQ-G11 → REQ-025
  - REQ-G12 → REQ-026
  - REQ-G13 → REQ-027
  - REQ-G14 → REQ-028
- Keep original IDs as `trace_id` for audit, use normalized IDs for schema/ledger/evidence.
- Replace native-installer with real verifiers (no hard-coded PASS, real MCP handshake, real rollback byte-equal, atomic worktree lease, no fallback, dry-run no PASS, full --host handling).
- Fix truth-chain: ledger 28 REQs, candidate fingerprint (HEAD + tracked diff + staged diff + untracked production files + lock hash + registry hash), evidence under .agent/evidence, host receipts moved to evidence, summary regenerated, current pointer validated against execution-contract schema.
- Rewrite global-behavior tests to production-path in disposable repos/custom homes (real CLI, real mutation, real lease, real restart, real planner counts).
- Single-source: SKILL.md frontmatter sole source, remove ROUTE.json from runtime input, catalog generated only, candidate-fabric archived, update context-graph/CLI/validators/tests/docs.
- Public CLI: remove legacy registration, keep only 8 top-level commands, fix --host/--all, verify from built dist, close/automation/dev under `agent-rules dev`.
- Remove mode residue from executable source, automation, tests, generated inputs, installed mirrors (verify-windows-hosts).
- Fix quality gates: update canonical sources and consumers together, no PowerShell chain masking exit code, verify:all must fail if any required command fails.

## Constraints
- No new plan, no Review A/B, one implementation pass + one independent review + at most one correction batch + final gate.
- No commit/push/deploy, no reset/checkout/delete dirty worktree, no credential read.
- Use existing sessions for canary only, backup/rollback preserve user config.
- Do not weaken tests/schemas/verifiers to make green.

## Reconciliation
- Preserve completed work that is already correct (registry v3, RunStore, skill metadata, MCP bridge, 5 rules, 8 hosts installed) but replace false-green verifiers with real ones.
- Extend acceptance to 28 REQs, not reduce.
- No requirement dropped.

## Evidence to produce
- Updated current.json (ACTIVE/BLOCKED, generation 47, AM-0002), ledger (ACTIVE, 28 REQs), candidate fingerprint, host receipts under evidence, global-behavior receipts from disposable repos, build/check/test/verify:all logs with exit codes, CLI help from dist, diff --check clean.
