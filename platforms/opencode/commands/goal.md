---
description: Execute one agent-rules goal from its canonical support bundle
---

Treat `$ARGUMENTS` as either a plan ID or a path to a goal file.

1. If it is a plan ID, resolve
   `.agent/plans/$ARGUMENTS/goal.md` from the current repository.
2. Read that goal file, its effective original plus approved amendments, ledger,
   requirements, decisions, task graph, verification matrix, support-pack
   manifest, and the first dependency-ready task recipe completely.
3. Validate all declared hashes and effective-plan identity before mutation.
4. Execute dependency-ready slices through completion with owned paths,
   checkpoints, bounded repair, and claim-matched fresh evidence.
5. Do not invent missing authority, weaken proof, or let a worker author PASS.
6. Report `PASS`, `PARTIAL`, `NEEDS_USER`, or `BLOCKED` with exact evidence.

This command is an OpenCode compatibility adapter. Record its capability as
`EMULATED`, never as a native durable-goal implementation.
