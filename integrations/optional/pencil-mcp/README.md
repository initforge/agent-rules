# Pencil MCP — stable launcher (host-managed, explicit-only)

This integration gives OpenCode (and other supported hosts) access to the
Pencil desktop editor through MCP, using a **stable launcher** that never
depends on an ephemeral AppImage mount path.

## Activation

Pencil is **explicit-only**: it is never auto-installed, auto-routed, or
triggered by generic words such as "design" or "UI". Attach it only after the
operator explicitly selects Pencil/pen.dev in the raw prompt or an approved
plan. A negative instruction ("do not use Pencil") is fail-closed.

## The problem this fixes (root cause)

The Pencil desktop app auto-registers itself into host MCP configs
(`~/.config/opencode/opencode.json` and equivalents) by writing the **current
AppImage mount path** as the server command, e.g.

    /tmp/.mount_Pen.Ap2ErpvK/resources/app.asar.unpacked/out/mcp-server-linux-x64

AppImage mounts are ephemeral:

- they change on every app restart (`/tmp/.mount_Pen.XXXX` suffix changes);
- a second app instance that starts and quits can leave a config entry
  pointing at a mount that no longer exists;
- any persisted `/tmp/.mount_Pen.*` executable path is therefore stale the
  moment the mount disappears, and OpenCode fails with `ENOENT`.

Never fix this by editing the config to the current `/tmp/.mount_Pen.*` path:
that is a machine-specific, ephemeral value and will break again.

## The stable launcher

`launch.mjs` is the command OpenCode must spawn. It:

1. **Resolves the live mount from running processes** (`/proc/<pid>/exe` of the
   running `Pen.AppImage`), never from a persisted path.
2. **Launches the installed AppImage in the foreground** when Pencil is not
   running (no hidden/headless mode, never substitutes the `pen` CLI).
3. **Waits for both the mounted MCP server binary and the app's transport
   socket** (`~/.pencil/socket/pencil-desktop.sock`) within a bounded startup
   timeout (default 30s, `PENCIL_MCP_STARTUP_TIMEOUT_MS` to adjust).
4. **Preserves configured args/env** by passing its argv through to the server
   binary.
5. **Fails closed** (`BLOCKED/NEEDS_USER`, exit code 2) when Pencil is not
   installed, there is no display, the app is running without its transport
   socket, or the startup timeout is exceeded — with a specific diagnostic.
6. Refuses to follow a config entry that points back at the launcher itself
   (recursion guard).

### Install / update the OpenCode entry

```bash
bash integrations/optional/pencil-mcp/install.sh
```

This backs up `~/.config/opencode/opencode.json` (timestamped), sets the
`pencil` MCP entry to `node <launcher> --app desktop --agent openCodeCLI`,
preserves all unrelated configuration, is idempotent (second run is a no-op),
and fails with the official install link when Pencil is not installed.
`PENCIL_APPIMAGE` overrides the AppImage location.

### Verification (real handshake, not process existence)

```bash
bash integrations/optional/pencil-mcp/verify-integration.sh
```

Exits 0 only after a genuine MCP `initialize` + `tools/list` handshake through
the launcher. Process existence, `.pen` file existence, or the
`PENCIL_MCP_CONNECTED` flag alone are **not** proof of a working integration.

### Diagnostics

```bash
PENCIL_MCP_LAUNCH_DRY_RUN=1 node integrations/optional/pencil-mcp/launch.mjs
```

Prints JSON: live mount, server binary, socket state, window visibility,
configured host entry, and BLOCKED reasons when applicable.

## Known app behaviors to respect

- The Pencil app **overwrites** the host config's `pencil` entry with its own
  mount path whenever a new app instance activates integrations. Re-run
  `install.sh` after app restarts, or rely on the launcher diagnostics.
- The app **removes its transport socket file** when a second instance starts
  and quits while the first is running. A running app without the socket is a
  broken-transport state: quit and relaunch the Pencil app, then retry.
- A design render/export via Pencil is **design evidence only**; production
  acceptance still requires browser/runtime proof (see
  `integrations/manual/pencil-mcp/README.md`).

## Multi-machine portability

- The launcher resolves every machine-specific value at runtime (mount, socket,
  agent args).
- `PENCIL_APPIMAGE` lets operators point at their installed AppImage.
- The installer writes the launcher's absolute path at install time and backs
  up the target config first; nothing in the harness persists `/tmp` mount
  paths.
