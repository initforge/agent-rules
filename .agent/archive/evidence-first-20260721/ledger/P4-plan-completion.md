# Ledger: P4-plan-completion — close lost-in-middle plan PASS loophole
tier_used: L2

## CONTEXT
- Owner correction: long pasted plans lose middle/later work and agents report PASS after only early items.
- Root cause found: `planctl complete` audits one ledger then marks the entire multi-phase plan DONE.
- Classification: global workflow rule plus machine enforcement; raw feedback stays in this ledger only.

Slice ID: P4-plan-completion
Scope IN: plan compiler/state/completion gates, multi-phase regression fixture, minimal owner rule/skill pointers
Scope OUT: project-specific rules, runtime mirror hand-edits, unrelated benchmark work, commit/push/deploy

- [ ] AC1 compiler rejects any plan deliverable missing from all phase scope locks
  verify: `powershell -NoProfile -ExecutionPolicy Bypass -File automation/test-planctl.ps1`
  evidence: pending
- [ ] AC2 state materializes every phase before execution and blocks unmet dependencies
  verify: `powershell -NoProfile -ExecutionPolicy Bypass -File automation/test-planctl.ps1`
  evidence: pending
- [ ] AC3 phase completion requires a matching full-AC ledger and emits SLICE_PASS, never whole-plan PASS
  verify: `powershell -NoProfile -ExecutionPolicy Bypass -File automation/test-planctl.ps1`
  evidence: pending
- [ ] AC4 plan finalization fails after only P1 and passes only after all phase ledgers remain clean
  verify: `powershell -NoProfile -ExecutionPolicy Bypass -File automation/test-planctl.ps1`
  evidence: pending
- [ ] AC5 always-loaded lifecycle and owning skills distinguish slice completion from plan completion without duplicate owners
  verify: `powershell -NoProfile -ExecutionPolicy Bypass -File automation/03-validate-context.ps1`
  evidence: pending
- [ ] AC6 context auto-audits, mirror parity, harness health and pre-commit audit pass
  verify: `powershell -NoProfile -ExecutionPolicy Bypass -File automation/10-audit-harness-health.ps1`
  evidence: pending
- [ ] AC7 strict slice completion audit passes with no open acceptance criteria
  verify: `& .\automation\audit-slice-ledger.ps1 -LedgerPath .agent/plans/evidence-first-20260721/ledger/P4-plan-completion.md -Strict`
  evidence: pending
