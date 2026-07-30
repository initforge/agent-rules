# Integration Health Check Contract

Every integration in the canonical registry declares a `health` block with:

- `command` — a shell command string that probes the integration (may contain `{{bin}}` placeholders resolved at check time)
- `expectedExitCodes` — exit codes considered healthy

## Contract

```
health:
  command: "<shell command>"
  expectedExitCodes: [0]
```

## Resolution

1. `health.command` is resolved against the integration's install context:
   - `{{bin}}` → resolved binary path (for binary-type installs)
   - All other text is passed as-is to the shell
2. The command is executed via the OS shell.
3. If the exit code is in `expectedExitCodes`, the integration reports HEALTHY.

## Adding a new health check

1. Add a `health` block to the integration entry in `integrations/registry.json`.
2. Run `automation/validate-tool-registry.ps1` — it validates that `command` and `expectedExitCodes` are present.
3. The doctor (`agent-rules doctor`) executes the check as part of the integration health suite.

## Examples

### Binary (codebase-memory-mcp)
```json
"health": {
  "command": "{{bin}} --version",
  "expectedExitCodes": [0]
}
```

### npx-based (context7)
```json
"health": {
  "command": "npx -y @upstash/context7-mcp --help",
  "expectedExitCodes": [0]
}
```

## Doctor integration statuses

| Status | Meaning |
|--------|---------|
| HEALTHY | Integration installed and health check passed |
| UNHEALTHY | Integration installed but health check failed |
| MISSING | Integration not installed |
| UNKNOWN | Health check configuration absent |
