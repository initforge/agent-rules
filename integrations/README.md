# Integrations

Single canonical registry of integrations and MCP servers.

## Registry

- `registry.json` — machine-readable canonical registry (JSON).
- `registry.yaml` — human-readable canonical registry (YAML, same data).
- Both describe every integration with source, integrity, trust, capabilities, permissions, health check, and schema location.

## Policy

| Policy | Meaning |
|--------|---------|
| `required` | Hard dependency; must be installed and verify pass. |
| `recommended` | Auto-check on install; auto-install if missing. |
| `optional` | Wrapper and ownership only; no auto-install. |

## Profiles

Profiles group integrations by function:

| Profile | Required | Recommended |
|---------|----------|-------------|
| `core` | codebase-memory-mcp | — |
| `research` | — | context7 |
| `qa` | — | playwright-mcp, chrome-devtools-mcp |
| `frontend` | — | playwright-mcp, chrome-devtools-mcp |

## MCP Schemas

Tool schema JSON files live under `mcps/<id>/tools/`. Each file is a single tool's JSON Schema description.

Generated manifests at `05-generated/mcps/<id>/schema-manifest.json` list every tool with its SHA-256 and the upstream source/version.

## Validation

Run `automation/validate-tool-registry.ps1` to verify:
- All required fields present
- No duplicate IDs or alias conflicts
- Referenced paths exist
- Profiles reference only known integrations

## Health Checks

Each integration declares a `health` block with a probe command and expected exit codes. See `automation/health-check-contract.md` for details.

## Current Integrations

| ID | Policy | Kind | Install Type |
|----|--------|------|-------------|
| codebase-memory-mcp | required | mcp | binary |
| context7 | recommended | mcp | npm-global |
| playwright-mcp | recommended | mcp | npm-npx |
| chrome-devtools-mcp | recommended | mcp | npm-npx |
| caveman | optional | tool | npx-github |
