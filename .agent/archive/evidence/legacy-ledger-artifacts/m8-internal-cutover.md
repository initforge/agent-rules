# Ledger: m8-internal-cutover — release nội bộ, squash main, install và branch convergence
tier_used: L2

## CONTEXT
- Plan artifact: `.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/original.md` + approved amendments through AM-0016
- Scope IN: rescue/inventory, candidate integration, local verification, main history rewrite, exact runtime install, local/remote branch convergence
- Scope OUT: M9.5 và M10
- Owner decisions: Antigravity required and installed; Cursor deferred; final state only `main`

- [x] AC1 every ref/worktree/stash and dirty candidate is recoverably captured before destructive convergence | verify: `git bundle verify` + SHA-256 | evidence: complete bundle `/home/linhnx/.local/share/agent-rules-backups/agent-rules-pre-convergence-2Qbmly/all-refs.bundle`, SHA-256 `f31be62d4c3240a038f1c295f20ca3701b9137d5debbfdaf7e9ad501ef53708e`; per-worktree patches/untracked archives and both `.agent` archives retained
- [x] AC2 newest accepted source tree passes the internal-preview gates used for this cutover | verify: clean `npm ci`; `npm run build`; `npm run check`; focused host-attestation/control-plane C4 tests; `npm audit` | evidence: build/typecheck PASS, focused tests 83 PASS/1 skipped, audit 0 vulnerabilities; full M8 Quality remains a declared residual and is not represented as PASS
- [x] AC3 rewritten `main` contains only a few semantic commits and has the exact accepted tree | verify: `git rev-parse main^{tree} && git log --oneline main` | evidence: five semantic commits, final tree `c869cfde5b3215a2cde7ea01e8a2b32aa641f8a8`
- [x] AC4 rewritten `main` is pushed with lease and GitHub remote resolves to the same HEAD | verify: local/remote HEAD equality | evidence: both resolve to `dec44d4200fe29921bcc855a708df4b691d714bf`
- [x] AC5 exact `main` artifact is installed for available internal runtimes, including Antigravity; Cursor remains deferred | verify: transactional install followed by owned `runtime update`; validate receipt HEAD/tree/plan hashes | evidence: Codex, Grok and Antigravity receipts bind HEAD `dec44d4200fe29921bcc855a708df4b691d714bf`, tree `c869cfde5b3215a2cde7ea01e8a2b32aa641f8a8`, effective plan `4094d07084192bc512f091e35032ffd33d3ea213206d4e85e87b518b1b5c58d6`; mirror parity PASS; legacy `doctor` remains PARTIAL and is recorded as an M8 residual
- [x] AC6 every non-main local and remote branch/worktree is removed after rescue and final verification | verify: branch/ref and worktree inventory | evidence: exactly one local branch `main`, one remote branch `main`, one worktree `/home/linhnx/Projects/agent-rules`; backup folders moved outside `Projects`
- [x] AC7 final checkout is clean on `main`, installed receipt binds final HEAD, and no M9.5 work was started | verify: `git status --short --branch`; receipt binding; phase audit | evidence: clean `main...origin/main`; M9.5 intentionally not started

## Declared post-cutover residuals

- GitHub Quality for `dec44d4` is red: the full M8 gate is not complete.
- The legacy doctor path does not understand the new transactional runtime layout and reports stale/missing legacy-manifest fields.
- The known full-suite residuals remain the giant `installer.ts` maintainability guard and two Control Plane browser routes receiving `/api/plans` 409 from the flat ledger.
- Certification was queued when this cutover ledger was closed; no success is inferred.
