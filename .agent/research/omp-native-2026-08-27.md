# OMP native-host research

## Summary

OMP is a terminal-native coding agent. Its own user-level agent directory is
`~/.omp/agent`; project configuration lives in `.omp/`.  It can import other
agents' surfaces, but import is not native proof.  The native surfaces to own
are its `AGENTS.md` context, `skills/` directory, and `mcp.json` under the
active OMP agent directory.

## Evidence

- OMP's official README documents the Windows installer: `irm
  https://omp.sh/install.ps1 | iex`.
- Its official skills documentation says the native provider is highest
  priority and requires `<root>/skills/<name>/SKILL.md`, with `name` and
  `description` frontmatter.
- Its official MCP documentation identifies `~/.omp/agent/mcp.json` and
  `.omp/mcp.json` as the primary writable native MCP surfaces.  It also makes
  profile scope explicit: `~/.omp/profiles/<name>/agent/mcp.json`.
- Official source shows `.agent/AGENTS.md` and `.agents/AGENTS.md` are native
  context-file providers.  Therefore this repository's existing global
  `.agents` projection is an import-compatible fallback, not proof that OMP's
  own user-level surface is installed.

## Risks

- OMP imports Codex/Claude/Cursor/Gemini configuration on first run.  That is
  useful compatibility but must not be reported as OMP-native installation.
- A named OMP profile changes the user MCP path; an adapter must inspect the
  active profile, not silently write the default profile.
- An installed config is not proof of an authenticated model turn.  Native
  readback/tool visibility can be automated; a model-side skill or MCP call is
  an owner-visible check when no session is available.

## Recommendation

Install the official Windows binary, inspect its live `--help` and configuration
directory, then add one OMP adapter owning only `~/.omp/agent/AGENTS.md`,
`~/.omp/agent/skills`, and the active-profile native `mcp.json`.  Do not use an
imported `.codex` or `.agents` file as the OMP installation target.

## Unknowns

- Exact installed binary path and the machine's active OMP profile are not
  known until the official installer runs.
- Model/tool registry visibility requires an actual OMP session after setup.

## Hand to Plan Architect

- Assumption: default OMP profile unless the live CLI reports another profile.
- Required checks: binary help/version, native path readback, skill parity,
  native MCP parse/handshake where a provider is configured, and bounded live
  session check.
- Forbidden proof: claiming native status from imported third-party config.
