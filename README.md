# Agent Rules

Agent Rules is a canonical source, portable compiler, shallow native installer
and truthful doctor. It installs self-contained instructions, skills and MCP
configuration, then leaves the normal host session path completely.

## Daily workflow

1. Select the model you want in the host.
2. Use the host's native Plan Mode for non-trivial work.
3. Let that model implement the plan, or explicitly hand a cold-start portable
   plan to another user-selected model or host.
4. The model resolves explicit skills and deterministic repository facts once
   through the host's native discovery; installed base rules remain the fallback.
   Global discovery contains only implicit Agent Rules skills; accepted tasks
   project selected explicit skills into supported repository-local surfaces.
5. Focused proof validates changed behavior. Broad regression runs once at the
   release gate.
6. Large one-shot work stays in native plan slices: change and preservation
   boundaries are locked, blockers are scoped, and completion follows current
   acceptance coverage.

Agent Rules may create one owned, git-excluded `.agent/current` task state for
the active implementation. It never keeps task history or runs a callback,
launcher or daemon inside a host session. Native plan and progress remain host-owned.

## Components

| Component | Canonical source | Responsibility |
|---|---|---|
| Rules | `rules/` | always-on safety, execution, proof, context behavior |
| Skills | `skills/`, `registry/skills.yaml` | exact active skill folders plus provenance, role, lifecycle and conflict governance |
| Diagnostic router | `packages/kernel/src/northstar/native-turn-router.ts` | build-time and explicit diagnostic selection tests only |
| Proof | `packages/kernel/src/harness/evidence/` | cheapest sufficient proof, safe reuse, focused repair loop |
| Health | `packages/kernel/src/northstar/health-contract.ts` | component status and fail-closed reduction |
| Host contracts | `platforms/platform-contracts.json` | versioned native surfaces and limitations |
| Compiler/installer | `automation/`, `packages/cli/src/` | immutable candidate plus transactional static projection/readback/rollback |
| Domain packs | `profiles/` | explicit project knowledge such as `5fedu` |
| Integrations | `integrations/` | automatic and explicit-only MCP/tool providers |
| Active task state | `.agent/current/` | one owned, git-excluded plan/frontier; replaced by a new plan and removed on explicit close |

Generated builds and installed mirrors are projections of these sources. Never
edit them manually.

## Install and diagnose

```bash
npm ci
npm run build
node packages/cli/dist/index.js install --all
node packages/cli/dist/index.js doctor --all --json
```

Operator lifecycle:

```bash
# First install, optionally with an explicit profile
agent-rules install --all --profile 5fedu

# Update current installs; omitted profiles are preserved
agent-rules update --all

# Replace or clear the profile set
agent-rules update --all --profile 5fedu
agent-rules update --all --clear-profiles

# Restore the immediately previous owned generation
agent-rules rollback codex
```

The installer changes only harness-owned or parity-proven files. Unowned
collisions become `NEEDS_USER`; unavailable hosts remain `UNSUPPORTED` or
`UNAVAILABLE` and are never reported as native PASS.

Public commands:

```text
install  update  rollback  uninstall  doctor  status  integration  reference  task  route-native
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
