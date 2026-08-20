# Integrations

`integrations/registry.json` is the single canonical registry for external CLI/MCP providers. Runtime capability providers are compiled from this registry; directory names are storage only, not policy authority.

## Policies

- `required` — hard runtime dependency; use sparingly.
- `recommended` — eligible when its capability is routed; not attached to every task.
- `optional` — never selected unless explicitly requested or separately enabled by policy.
- `manual/` — local/manual providers such as Pencil; always explicit-only and outside automatic registry routing.

## Current profiles

| Profile | Required | Recommended |
|---|---|---|
| `core` | — | codebase-memory-mcp, context7, rtk |
| `research` | — | context7 |
| `qa` | — | playwright-cli, playwright-mcp, chrome-devtools-mcp |
| `frontend` | — | playwright-cli, playwright-mcp, chrome-devtools-mcp |

Normal coding browser proof uses `browser.verify` → Playwright Agent CLI. Playwright MCP is `browser.explore`; Chrome DevTools MCP is `browser.debug`. Serena is an explicit-only experimental `code.semantic` provider until ablation/resource evidence justifies promotion. Pencil remains manual/explicit-only.

## Validation

```bash
node automation/validate-tool-registry.mjs
python automation/generate-doc-references.py
```

Generated human-readable registry output lives at `generated/references/integration-registry.md`.


### Bounded installation and host exposure

- `AGENT_RULES_INTEGRATION_PROFILE=core` is the default installer profile. It installs only the small core recommended set; use `research`, `frontend`, `qa`, `all`, or `none` explicitly when appropriate.
- Installing a provider does **not** imply exposing its MCP tool schema globally. Governed runs attach only providers selected by the Capability Broker.
- `AGENT_RULES_GLOBAL_MCP_PROFILE` defaults to `none`. Set it to `core`, `research`, `frontend`, `qa`, or `all` only when you intentionally want always-on MCP servers in an interactive host.
- Explicit-only providers (for example Serena and Pencil) are never added by a global profile.
