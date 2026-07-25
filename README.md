# Agent Rules

**Thesis:** One canonical harness for AI agents — flat role-based folders, lazy skills, platform deltas, and automation that keeps runtime mirrors in sync without editing generated output by hand.

## Shape

| Folder | Role | Taxonomy |
|---|---|---|
| `docs/guides/` | Maintainer docs and system map | stable (human-maintained) |
| `rules/` | Always-loaded global context (numbered = load priority) | stable |
| `skills/` | Lazy-loaded capabilities (flat slugs) | stable |
| `integrations/` | Required / recommended / optional tools | stable |
| `profiles/5fedu/projects/` | Project context templates | stable |
| `profiles/` | Optional organization profiles (e.g., `5fedu`) | stable |
| `platforms/` | Per-runtime overlays (Codex, Grok, Antigravity, Cursor) | stable |
| `automation/` | Build, install, validate, sync, doctor | stable |
| `generated/` | Build output — do not edit | generated (machine-only) |
| `.agent/` | Advisory trace log, research notes, tombstones (gitignored) | ephemeral |

**Integrations** — see [generated full registry](generated/references/integration-registry.md) for all 5 entries (required/recommended/optional) with profiles, trusts, and capabilities. Canonical source: `integrations/registry.json`. Must regenerate after registry changes:

```bash
python automation/generate-doc-references.py
```

## Run

```powershell
./automation/03-validate-context.ps1
```

Linux/macOS (requires [PowerShell Core](https://github.com/PowerShell/PowerShell)):

```bash
./automation/run.sh 03-validate-context
```

```powershell
./automation/01-build-runtime.ps1
./automation/04-verify-mirrors.ps1
./automation/02-install-runtime.ps1 -Platform all
./automation/09-doctor.ps1
```

Install targets: `~/.codex`, `~/.grok`, `~/.gemini/config` (Antigravity), `~/.cursor`. MCP format differs per platform — see `platforms/platform-contracts.json`.

**Important:** The path `~/.gemini/config` is the Antigravity runtime home, not Gemini CLI. The `gemini` CLI binary is the Antigravity host runtime. See [platform capability matrix](docs/guides/06-platform-capability.md) for explicit depth per product.

**Grok rules path:** install writes lean always-on to `~/.grok/rules` (manifest) and `~/.grok/.grok/rules` (native inject). Legacy dual trees are archived on install; doctor fails if they return. Restart the Grok session after install.

**Source parity ≠ behavioral parity:** All supported platforms share equivalent source files. This proves *source parity* only. Behavioral parity — identical agent behavior across platforms — remains unproven without per-platform runtime attestation. The doctor reports this honestly via layered statuses (NATIVE_UNVERIFIED, NATIVE_OBSERVED, etc.).

## Read next

1. [System map](docs/guides/00-system-map.md)
2. [Runtime model](docs/guides/01-runtime-model.md)
3. [Platform capability matrix](docs/guides/06-platform-capability.md)
4. Vietnamese overview: [README-vi.md](README-vi.md)
5. 5fedu projects: [profiles/5fedu/projects/AGENTS.md](profiles/5fedu/projects/AGENTS.md) (enable profile first)

**Governance:** Edit `rules/` and `skills/` here only — not `generated/` or installed mirrors. Reverse sync via `automation/07-import-reviewed-changes.ps1`.
