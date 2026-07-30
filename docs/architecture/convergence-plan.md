# Harness Convergence Plan

## Repository: initforge/agent-rules
## Branch: refactor/final-harness-convergence
## Baseline SHA: bc2dc92 (upstream) / da6ab4d (feature branch)

## Stage A: Baseline & Cleanup (M0)
1. Audit: duplicate rules, overlapping skills, competing schemas, dead files
2. Create cleanup ledger
3. Execute cleanup safelisted deletions

## Stage B: Deterministic Green (M1)
1. Add generated/ to .gitignore patterns if needed
2. Create npm run verify:all root command
3. Regenerate context graph
4. Fix fixture paths, stale references
5. All builds + tests + typechecks pass

## Stage C: Contracts & CLI (M2, M5)
1. Resolve contract overlap (assignment vs delegation, etc.)
2. Version every contract
3. Create TypeScript types for all schemas
4. CLI commands: validate, doctor, install, update

## Stage D: Template & Isolation (M3, M4)
1. Vendor 5fedu template from pos-ops
2. Reference materialization CLI
3. Seed mode CLI
4. Template lifecycle doctor
5. Verify public=no 5fedu

## Stage E: Intent, Context, Planning (M6-M8)
1. Intent Compiler: preserve original request, derive requirements
2. Context Engine: repository map, routing, budgets
3. Plan Compiler: task graph, dependency validation

## Stage F: Orchestration & Durable Runtime (M9-M11)
1. Harness orchestration runtime
2. Durable execution store (14 states)
3. Workspace manager (worktree isolation)

## Stage G: Verification & Evaluation (M12-M14)
1. 19 verification profiles
2. Claim ledger
3. False-PASS fixtures
4. Evaluation + telemetry
5. Long-task evaluation (10+ files)

## Stage H: Platform & Parity (M15-M17)
1. Platform adapter convergence (5 platforms)
2. OpenCode canonical config
3. UI/business parity packets
4. Security hardening

## Stage I: Installer, Control Plane, CI (M18-M22)
1. Tool/MCP/skills registry
2. Knowledge lifecycle
3. Installer lifecycle convergence
4. Control plane persisted state
5. CI deterministic gate

## Stage J: Final Review & Report
1. Run independent adversarial review
2. Fix all valid blocking findings
3. Produce final Vietnamese report
