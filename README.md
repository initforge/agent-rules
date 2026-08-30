# Agent Rules

Agent Rules is a canonical source, portable compiler, shallow native installer
and truthful doctor. It installs self-contained instructions, skills and MCP
configuration, then leaves the normal host session path completely.

## Daily workflow

1. Select the model you want in the host.
2. Use the host's native Plan Mode for non-trivial work.
3. Let that same model implement the plan.
4. The model resolves explicit skills and deterministic repository facts once
   through the host's native discovery; installed base rules remain the fallback.
5. Focused proof validates changed behavior. Broad regression runs once at the
   release gate.

Agent Rules never creates a repository `.agent` tree and never runs a callback,
launcher or daemon inside a host session. Native plan and progress remain host-owned.

## Components

| Component | Canonical source | Responsibility |
|---|---|---|
| Rules | `rules/` | always-on safety, execution, proof, context behavior |
| Skills | `skills/` | lazy task-specific workflows |
| Diagnostic router | `packages/kernel/src/northstar/native-turn-router.ts` | build-time and explicit diagnostic selection tests only |
| Proof | `packages/kernel/src/harness/evidence/` | cheapest sufficient proof, reuse, bounded recheck |
| Health | `packages/kernel/src/northstar/health-contract.ts` | component status and fail-closed reduction |
| Host contracts | `platforms/platform-contracts.json` | versioned native surfaces and limitations |
| Compiler/installer | `automation/`, `packages/cli/src/` | immutable candidate plus transactional static projection/readback/rollback |
| Domain packs | `profiles/` | explicit project knowledge such as `5fedu` |
| Integrations | `integrations/` | automatic and explicit-only MCP/tool providers |

Generated builds and installed mirrors are projections of these sources. Never
edit them manually.

## Install and diagnose

```bash
npm ci
npm run build
node packages/cli/dist/index.js install --all
node packages/cli/dist/index.js doctor --all --json
```

The installer changes only harness-owned or parity-proven files. Unowned
collisions become `NEEDS_USER`; unavailable hosts remain `UNSUPPORTED` or
`UNAVAILABLE` and are never reported as native PASS.

Public commands:

```text
install  uninstall  doctor  status  integration  reference  route-native
```

## Develop

```bash
npm run build
npm run check
npm test
npm run verify:all
```

During implementation, run typecheck and focused tests for the changed seam.
`verify:all` is the single integrated release gate and includes packed clean
static install/update/doctor/source-state-independence/rollback smoke proof.

`5fedu` and Pencil remain explicit-only. Seeing an ERP, UI, or design keyword
does not activate them automatically.
