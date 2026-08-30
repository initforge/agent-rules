# agent-rules

Canonical behavior comes from `rules/`. Generated builds and installed host
mirrors are projections; never edit them by hand.

## Product contract

1. Same-session planning and implementation is the default. When the owner
   explicitly hands a portable plan to another session or host, the receiving
   user-selected model owns implementation end to end. The harness never
   selects or changes models, invents worker tiers, or requires role handoffs.
2. Use the host's native plan/progress surface. Do not create shadow plans,
   tickets, ledgers, PASS grants, or per-step evidence files.
3. Resolve rules, skills, domain context, and integrations once for the current
   turn. Explicit-only capabilities remain explicit-only.
4. Implement first. Run the smallest proof that covers the changed seam; run a
   broad suite once at the release gate or when material risk requires it.
5. Completion is derived from proof and live readback, never from model prose.
6. Installation is transactional, refuses unowned collisions, supports
   rollback, and reports unsupported or unavailable host surfaces honestly.
7. Diagnostics must name the broken component and a concrete repair action.
   A missing optional surface is `NOT_APPLICABLE`, not a fake failure.
8. Do not commit, push, deploy, create credentials, or install absent third-party
   hosts unless the user explicitly requests it.

## Repository map

| Path | Purpose |
|---|---|
| `rules/` | always-on behavior |
| `skills/` | lazy workflows discovered natively from compiled skill directories |
| `packages/kernel/src/northstar/native-turn-router.ts` | build-time and explicit diagnostic routing tests only |
| `packages/kernel/src/harness/evidence/` | focused proof selection and reuse |
| `packages/kernel/src/northstar/health-contract.ts` | shared health statuses and reduction |
| `packages/cli/src/runtime/` | static install coordination, ownership cleanup and health |
| `packages/cli/src/services/native-installer.ts` | host-native projection |
| `platforms/` | versioned host contracts and adapters |
| `integrations/` | optional tool providers |
| `profiles/` | explicitly selected domain packs |
| `automation/` | build and release verification |
| `generated/` | generated output |

## Maintainer loop

Read `rules/manifest.yaml` and the changed component contract. Edit canonical
source, run typecheck plus focused tests for the seam, then run
`npm run verify:all` once for an integrated release candidate. Build and install
through the CLI; do not copy files into host homes manually.

Public operator commands are `install`, `update`, `rollback`, `uninstall`,
`doctor`, `status`, `integration`, `reference`, and `route-native`.
