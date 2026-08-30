# Integrations

`registry.json` is the single source of truth for optional MCP and tool
providers. Each entry declares capability, activation, permissions, supported
hosts, pinned source, lifecycle scripts, and a health probe.

The native router selects a provider once per turn from an explicit request or
a deterministic capability need. `explicit-only` providers never activate from
keywords. Installation preserves user-owned configuration; a missing login or
credential is `NEEDS_USER`, not proof that the host installation failed.

Use the public CLI to inspect or change integrations:

```text
agent-rules integration list
agent-rules integration install <id>
agent-rules integration verify <id>
agent-rules integration uninstall <id>
```

Do not copy provider config manually or treat a registry row as evidence that a
provider process is reachable. `doctor` and the provider health probe establish
the current state.
