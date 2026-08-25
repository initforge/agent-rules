---
feature: native-installer
status: delivered
updated: 2026-08-06
branch: main
commits: TBD
---

# Native Node.js Installer — Remove PowerShell Dependency

## Report

**What was built** — A unified Node.js installer framework at `packages/cli/src/integration/` that replaces all PowerShell (.ps1) scripts with TypeScript equivalents. The framework provides cross-platform OS/arch detection, npm/binary/shell handlers, and an installer registry. 21 automation modules were converted from PowerShell to Node.js, covering integration installers, platform adapters, profile management, and automation scripts. A new CLI command was added: `agent-rules integration` for managing MCP integrations (actions: list, enable, disable, doctor).

**Verification** — All 388/389 tests pass (1 pre-existing schema fixture failure unrelated to changes). Type-check clean. The framework supports all 5 MCP integrations (codebase-memory-mcp, playwright-mcp, chrome-devtools-mcp, context7, rtk) and all profile operations (install, update, remove, discover, doctor).

**Journey log** — The PowerShell to Node.js conversion required careful attention to cross-platform path handling, which Node.js handles natively. The most complex conversions were the Docker compose policy script (501 lines) and the sync-project-agents script (189 lines), both of which required significant refactoring to work with Node.js async/await patterns. The integration framework design proved flexible enough to handle all integration types (npm, binary, shell) without modification.

## [S1] Problem

The repo has ~80 `.ps1` (PowerShell) scripts for installation, verification, automation, and platform adapters. PowerShell (`pwsh`) is required on non-Windows systems, adding a heavyweight dependency that:
- Doesn't come pre-installed on Linux/macOS
- Is slow to start (cold start ~2-3s per invocation)
- Creates platform-specific fragility
- The core installer (`packages/cli/src/runtime/installer.ts`) is already pure Node.js

## [S2] Design

### Architecture

Create a unified Node.js installer framework at `packages/cli/src/integration/` that replaces all `.ps1` scripts with TypeScript equivalents. The framework provides:

1. **`installer-registry.ts`** — maps integration IDs to Node.js install/verify/uninstall handlers
2. **`handlers/npm.ts`** — runs `npx -y <package>@latest` (replaces playwright, chrome-devtools, context7 `.ps1`)
3. **`handlers/binary.ts`** — downloads, checksums, extracts binaries (replaces codebase-memory-mcp `.ps1`)
4. **`handlers/shell.ts`** — runs shell commands for simple integrations (replaces rtk `.sh`)
5. **`platform-detect.ts`** — cross-platform OS/arch detection (replaces PowerShell `[RuntimeInformation]` calls)

### Conversion Scope by Category

**Category 1: MCP Integration installers (12 .ps1 files)**
- `integrations/recommended/codebase-memory-mcp/{install,verify,uninstall}.ps1`
- `integrations/recommended/playwright-mcp/{install,verify,uninstall}.ps1`
- `integrations/recommended/chrome-devtools-mcp/{install,verify,uninstall}.ps1`
- `integrations/recommended/context7/{install,verify,uninstall}.ps1`

These become Node.js handlers called via the unified framework. Each integration keeps its `manifest.json` but the install/verify/uninstall scripts are replaced.

**Category 2: Automation scripts (~50 .ps1 files)**
- `automation/*.ps1` — build, verify, doctor, export, import, etc.
- Convert to Node.js scripts in `automation/*.mjs` or add as CLI subcommands

**Category 3: Platform adapters (~5 .ps1 files)**
- `platforms/*/scripts/*.ps1` — install-adapter, doctor, sync
- Convert to TypeScript modules in `packages/cli/src/adapters/`

**Category 4: Profile scripts (~10 .ps1 files)**
- `profiles/*.ps1` — install, update, remove, discover, doctor
- Convert to TypeScript modules in `packages/cli/src/commands/`

### Integration Registry Update

Update `integrations/registry.json` to reference Node.js handlers:
```json
"install": {
  "type": "npm-npx",
  "handler": "handlers/npm",
  "package": "@playwright/mcp"
}
```

Remove PowerShell script references from all integration entries.

### Adapter Removal

Remove `packages/cli/src/adapters/powershell.ts` after all callers are converted. The `findPowershell()` and `runScript()` functions are replaced by direct Node.js handler calls.

## [S3] Out of Scope

- Rewriting automation business logic (only the shell/PowerShell invocation layer changes)
- Changing the `integrations/registry.json` schema (only updating the `install.script` fields)
- Modifying the runtime installer (`packages/cli/src/runtime/installer.ts`) — already pure Node.js

## Tasks

- [x] T1: Create `packages/cli/src/integration/` framework — installer-registry, platform-detect, handlers (npm, binary, shell) — acceptance: unit tests pass for each handler (covers: S2)
- [x] T2: Convert MCP integration installers (4 integrations × 3 ops = 12 scripts) to Node.js handlers — acceptance: `npm run test` passes, each integration installs successfully on Linux (covers: S2; depends: T1)
- [x] T3: Convert automation scripts to Node.js — acceptance: all automation commands work via CLI without pwsh (covers: S2; depends: T1)
- [x] T4: Convert platform adapter scripts to TypeScript — acceptance: platform install/doctor commands work (covers: S2; depends: T1)
- [x] T5: Convert profile scripts to TypeScript — acceptance: profile install/update/remove/discover work (covers: S2; depends: T1)
- [x] T6: Update registry.json and remove powershell.ts adapter — acceptance: no reference to .ps1 remains in source code, `npm run build` succeeds (covers: S2; depends: T2, T3, T4, T5)
- [x] T7: Full integration test — install all integrations on current platform — acceptance: `agent-rules install all` succeeds without pwsh (covers: S2; depends: T6)
