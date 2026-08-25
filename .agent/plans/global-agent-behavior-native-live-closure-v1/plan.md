# Plan: Global Agent Behavior + Full Native 8 Host + Live Release Closure

- **Plan ID**: global-agent-behavior-native-live-closure-v1
- **Supersedes**: full-native-integrity-global-behavior-v1
- **Baseline SHA**: c1deca1a5ee186a9d0361b57fd0ff7e943fa676e

## Outcome

Close global agent behavior as ONE canonical runtime across all hosts/projects, with full native
8-host install/reload/readback/rollback, real live evidence, single-writer run state, single
outcome reducer, and a green release committed and pushed to GitHub with Quality + Certification
workflows of the exact commit SHA ending in `success`.

## Phases

- Phase 0: Takeover & Semantic Admission (new phase only active pointer; 100% requirement chain)
- Phase 1: Unified Global-Behavor Runtime (11 owner modules, single flow, vocabulary, coverage matrix)
- Phase 2: Rules Parity (5 groups + legacy→replacement→proof parity matrix; purge modes)
- Phase 3: Context Capsule & Compaction/Resume + prompt classification
- Phase 4: Skill Lifecycle (SKILL.md canonical, 34 global skills, positive/negative routing)
- Phase 5: MCP Lifecycle (integration-only, remove agent-rules-mcp-bridge, 7-point canary PASS)
- Phase 6: Native 8-Host Installer (HostAdapter interface, provenance, atomic/byte-equal rollback)
- Phase 7: Proof & Closure (RunStore single writer, OutcomeReducer single reducer, behavior-index)
- Phase 8: Public CLI (strict 8 commands; integration list|enable|disable|doctor)
- Phase 9: Deterministic + Process-Level Tests + 14 Live Journeys
- Phase 10: Local Gates + CI fixes (tsx devDep, 8-host certification, runner labels)
- Phase 11: Cleanup, commit on main, push, wait for Quality + Certification success

## Definition of Done (all must hold)

1. 8/8 hosts installed via the native surface the host actually supports.
2. No self-made bridge/plugin/path/format to fake native.
3. Rules and global skills are re-read by the host after reload/new session.
4. Worker receives a plan with no prior conversation still gets full context, skills, scope, proof contract.
5. Needed skill activates; unrelated skill does not activate.
6. MCP needed→handshake/call/observable effect; not needed→untouched.
7. Verifier never hard-codes or auto-derives PASS.
8. Evidence bound to the correct candidate/source digest.
9. One writer writes run state; one reducer creates outcome.
10. Local gates green, direct push to main, origin/main == HEAD, every workflow of the exact commit ends success.
