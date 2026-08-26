# global-agent-behavior-native-operational-readiness-v2

## Outcome

Continue the current native integration from baseline `5777d43875693cc6e3311f29bf7598ec4f0495cb`. Keep only direct native installer consumers, prove real host readback, then commit, fast-forward `main`, push, observe CI and clean up safely.

## Authority

- Canonical machine contract: [plan.json](./plan.json).
- Exact raw owner intent: [original.md](./original.md), SHA-256 `92ee14f3cea9382c8dd1975b1cfc5d1b6c00eb4541a191213257a39c9ec486b6`.
- Supersedes: `global-agent-behavior-native-live-closure-v1`; v1 history remains unchanged.
- Branch/worktree: `native-final-integration` / `P:/agent-rules-integration`, based on `main`.
- Final authorized sequence: one final gate, eight-host install/readback, changed-path manifest, integration commit, `git merge --ff-only` to `main`, `git push origin main`, CI observation, then cleanup.

## Locked corrections

- Preserve raw intent and REQ-101..REQ-122.
- Workers never author PASS; deterministic failures remain agent-actionable blockers.
- GUI/login/model claims get one bounded attempt, then compact NEEDS_USER residuals when unobservable; task_state COMPLETE may coexist with that residual.
- REQ-120 is local operational readiness; REQ-121 is local workflow validation; REQ-122 is local commit/review handoff.
- Core install never mutates MCP; DSH native proof requires installed `AGENTS.md`, native skill provider and Cordis rows visible in `dsh --dump-config`.
- Owner amendment `AMD-002`: “native thực dụng, proof vừa đủ.” Do not import core/runtime architecture, vocabulary, proof machinery or compatibility layers without a real native execution consumer. Do not import worker receipts/evidence/snapshots.
- During correction use affected typecheck, targeted tests and native readback only. Final proof is exactly `npm ci`, `npm run verify:all`, `npm run test:package-smoke -w packages/cli`, and one real eight-host install/readback.

## Packets

COR-000 through COR-006 are dependency ordered in plan.json. Each packet owns one behavioral outcome, ownership boundary and proof boundary. No new public command, mode, profile, bridge or synthetic verifier is allowed.

## Acceptance

Every requirement maps to at least one acceptance criterion in plan.json. Evidence is fresh and bound to source candidate, environment, native surface and acceptance. The final review records only actual command/readback evidence, the short KEEP/DROP manifest, exact paths, commits, CI result and cleanup status.
