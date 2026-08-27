# Tích hợp và capability routing

**Canonical truth:** `integrations/registry.json`.

External tools are not a global bag of MCPs. The North-Star Capability Broker compiles providers from the registry and attaches only capabilities routed for the current TaskPacket.

## Browser split

- `browser.verify` → `playwright-cli` for normal coding/E2E proof.
- `browser.explore` → `playwright-mcp` only for exploratory live interaction.
- `browser.debug` → `chrome-devtools-mcp` for console/network/CDP/performance diagnosis.

## Code retrieval

- `code.search` → builtin `rg`.
- `code.semantic` → default indexed provider when routed; `serena` remains explicit-only until A/B + process/resource reliability evidence supports promotion.

## Output compression

`rtk` provides `output.compress`, but compression is not inferred automatically. Raw stdout/stderr stays in evidence artifacts; promotion is based on tokens/cost per **verified task**, not command-output reduction alone.

## Manual providers

`integrations/manual/` is never keyword-routed. Pencil is manual/explicit-only and remains design evidence, not production UI acceptance evidence.

## Sync

- Outbound runtime build/install remains generated from canonical registry/platform contracts.
- Inbound changes require the reviewed import/tombstone path; runtime copies are not configuration authority.


### Bounded installation and host exposure

- `AGENT_RULES_INTEGRATION_PROFILE=core` is the default installer profile. It installs only the small core recommended set; use `research`, `frontend`, `qa`, `all`, or `none` explicitly when appropriate.
- Installing a provider does **not** imply exposing its MCP tool schema globally. Governed runs attach only providers selected by the Capability Broker.
- `AGENT_RULES_GLOBAL_MCP_PROFILE` defaults to `all`: setup registers the four approved MCPs with each supported native host. Registration is not a tool call; the host connects and the agent calls a tool only when the task needs it. Set it to `none` only when you explicitly want agent-rules to expose no standard MCPs.
- Explicit-only providers (for example Serena and Pencil) are never added by a global profile.
