# agent-device

**MATERIALIZED_PROVIDER** (skill-mcp-fabric-v1 AM-0002).

Provider for the `mobile.device` capability: AI-native CLI for app automation
across iOS, Android, tvOS, Android TV, macOS, Linux and web.

- Source: https://github.com/callstack/agent-device
- Pin: commit `c7565cb1f8c34f6dae5b5abb8a7e2facf0674ef6` / version 0.20.8
- License: MIT (pinned tree)
- Security scan: `.agent/evidence/skill-mcp-fabric-v1/provenance-scans/agent-device@c7565cb1-provenance-scan.txt` (0 ELF binaries)
- Activation: EXPLICIT only (mobile/device task facts); never always-on.
- Install authority: owner-approved-plan; scripts are recipes, not executed
  implicitly. Preflight: `agent-device --version`, `agent-device help workflow`.
- Rollback: `uninstall.sh`; no device evidence is ever fabricated; unavailable
  device proof is BLOCKED/NEEDS_USER.
