# MCP Registry

## Purpose

Document all MCP servers configured for Codex so they can be reinstalled on a new machine.

## Codex MCP config locations

User-level:

```text
C:\Users\ADMIN\.codex\config.toml
```

Project-level:

```text
<repo>\.codex\config.toml
```

## Required format

### <mcp-name>

Purpose:
- ...

Install/Add:
- `codex mcp add <name> -- <command>`

Config TOML:

```toml
[mcp_servers.<name>]
command = "..."
args = [...]
```

Verify:
- `codex mcp list`

Secrets:
- variable names only, no values

Usage:
- when Codex should use it
- when not to use it

Fallback:
- ...

## Current MCP servers

### GitNexus MCP

Purpose:
- Code graph / impact analysis if configured.

Source:
- https://github.com/nxpatterns/gitnexus

Install/Add:
- Binary present via npm global install:
  - `C:\Users\ADMIN\AppData\Roaming\npm\gitnexus.cmd`
- Configured through:

```toml
[mcp_servers.gitnexus]
command = "C:\\Users\\ADMIN\\AppData\\Roaming\\npm\\gitnexus"
args = [ "mcp" ]
```

Verify:
- `codex mcp list`

Usage:
- MEDIUM/HIGH codebase impact
- Do not rely on it if stale
- Fallback to `rg`

Fallback:
- `rg` + targeted file reads
- `gitnexus-preflight.ps1` before assuming index freshness

Current machine note:
- CLI and MCP are installed
- indexing is now verified on at least two local repos
- current Codex MCP session may still be stale until the session or MCP server is restarted
- when multiple repos are indexed, repo-qualified queries are required

### Pencil MCP

Purpose:
- Drive Pencil desktop design workflows.

Install/Add:
- Backed by the local Pencil desktop app installation.

Config TOML:

```toml
[mcp_servers.pencil]
command = "C:\\Program Files\\Pencil\\resources\\app.asar.unpacked\\out\\mcp-server-windows-x64.exe"
args = [ "--app", "desktop", "--agent", "codexCLI" ]
```

Verify:
- `codex mcp list`

Secrets:
- none required in current config

Usage:
- `.pen` document inspection
- structured UI/design editing
- design export and screenshot flows

Fallback:
- none equivalent; use local design files and manual inspection if Pencil is unavailable
