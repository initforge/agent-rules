# pen.dev / Pencil MCP — explicit-only capability

This host-managed integration has a policy record in `integrations/registry.json` so the installer, Capability Broker, and per-task MCP materializer can recognize it. It is still **explicit-only**: it is not included in any global profile and is not routed by generic UI/design vocabulary.

Use it when the raw prompt or an approved plan explicitly asks for Pencil/pen.dev. The canonical runtime sees provider-neutral capabilities (`design.inspect`, `design.compose`, `design.render`, `design.tokens`) and automatically attaches `pencil-mcp` for that bounded task. An explicit `--capability-provider pencil-mcp` remains supported.

The canonical adapter surface covers every platform contract: Codex, Claude,
Grok, Antigravity, Cursor, OpenCode, and MiMoCode. Adapter availability does
not claim that the Pencil desktop/editor or a live MCP connection exists on
that host; the host-specific launcher fails closed until the operator provides
that live surface.

## Native entry discovery

Pencil is not installed or synthesized by the harness. For each host, the
adapter points at the **stable launcher** (`integrations/optional/pencil-mcp/launch.mjs`),
which resolves the live Pencil desktop process and derives the mounted
`mcp-server-linux-x64` binary from `/proc/<pid>/exe` at spawn time. It never
reads, persists, or execs an ephemeral AppImage mount path from the host
config (`/tmp/.mount_Pen.*` is machine-specific and stale after every app
restart — a persisted mount path is the exact failure mode this launcher
eliminates).

If Pencil is not running, the launcher starts the installed AppImage **in the
foreground** (never headless/hidden, never the `pen` CLI as a substitute) and
waits, within a bounded startup timeout (`PENCIL_MCP_STARTUP_TIMEOUT_MS`,
default 30 s), for both the mounted server binary and the app's transport
socket. If Pencil is unavailable — not installed, no display, running without
its transport socket, or startup timeout exceeded — the bounded task is
`BLOCKED`/`NEEDS_USER` with a specific diagnostic and the official
installation link; the launcher never guesses an executable, adds flags, or
falls back to a hidden service.

The operator's own `pencil` MCP entry in the host config is preserved except
for the command, which is replaced with the stable launcher by
`install.sh`/`install-opencode.mjs` (backup + idempotent). Note that the
Pencil app itself may rewrite that entry with its current mount path when a
new app instance activates integrations; re-run the installer or use the
launcher diagnostics afterwards.

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

Pencil/pen.dev remains explicit-only: these rules do not auto-install, route, or
activate the integration from generic words such as “design” or “UI”. The
explicit markers are `Pencil`, `pen.dev`, or `pencil-mcp` in the raw prompt or
plan; a negative instruction such as “do not use Pencil” is fail-closed.

The pen.dev MCP server is local to the running pen.dev app/extension. Verify the host's MCP list before use. A design render is not production acceptance: shipped UI must still be verified through browser/runtime evidence.

Upstream documentation: <https://docs.pencil.dev/getting-started/ai-integration>
