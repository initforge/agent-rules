# Ledger: harness-browser-clean - headless browser MCP and clean runtime sync
tier_used: L1

## CONTEXT
- Scope IN: browser MCP adapters, Codex runtime entrypoint, build/install automation, integration docs, runtime verification.
- Scope OUT: product repositories, credentials, commits, pushes, deployments.

- [x] AC1 Browser MCP adapters launch headless and isolated | verify: `codex mcp list` | evidence: Playwright and Chrome DevTools enabled with `--headless --isolated`; visible automation windows = 0
- [x] AC2 Codex AGENTS entrypoint is generated, installed, and contains no dead legacy rule paths | verify: legacy-path `rg` against runtime AGENTS | evidence: DeadAgentRefs=0; runtime manifest 49 files, Missing=0, HashMismatch=0
- [x] AC3 Harness validators, build, install, doctor, and MCP health checks pass | verify: installer twice, regression guards, health audit, doctor | evidence: ConfigIdempotent=True; all checks PASS; BareArrayLines=0
