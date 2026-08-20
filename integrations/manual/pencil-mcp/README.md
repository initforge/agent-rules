# pen.dev / Pencil MCP — explicit-only capability

This integration is intentionally **not** part of `integrations/registry.json` and is not installed, routed, or materialized automatically.

Use it only when the operator explicitly asks to use Pencil/pen.dev. The canonical runtime sees provider-neutral capabilities (`design.inspect`, `design.compose`, `design.render`, `design.tokens`); the operator may then select `pencil-mcp` as the provider.

## Operator-visible design contract

The supported Pencil surface has two parts: the Pencil CLI and the Pencil
desktop/editor. Before a design or Pencil MCP session begins, verify that both
are installed/available for the project and open the desktop/editor in the
foreground. CLI commands and MCP interactions are then performed against that
visible editor so the operator can watch the design work.

If the desktop/editor or the requested MCP surface cannot be opened and
observed, record `BLOCKED`/`UNAVAILABLE`; do not silently substitute a hidden
or headless design session. A CI renderer may run headlessly only under a
separate automated evidence profile and is never manual acceptance evidence.

Pencil/pen.dev remains explicit-only: these rules do not auto-install, route,
or activate the integration from words such as “design” or “UI”.

The pen.dev MCP server is local to the running pen.dev app/extension. Verify the host's MCP list before use. A design render is not production acceptance: shipped UI must still be verified through browser/runtime evidence.

Upstream documentation: <https://docs.pencil.dev/getting-started/ai-integration>
