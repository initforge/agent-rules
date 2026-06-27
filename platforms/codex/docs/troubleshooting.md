# Troubleshooting

## Codex does not follow rules

Check:

```powershell
Get-Content "$env:USERPROFILE\.codex\AGENTS.md" -TotalCount 120
& "$env:USERPROFILE\.codex\scripts\verify-codex-rules.ps1"
```

Ask:

```powershell
codex --ask-for-approval never "List loaded instruction sources."
```

## AGENTS too large

Keep runtime concise.

Move long workflows into:
- skills
- templates
- docs
- project AGENTS.md close to relevant directory

## RTK PowerShell command fails

Wrong:

```powershell
rtk Get-ChildItem
```

Right:

```powershell
rtk proxy powershell -NoProfile -Command "Get-ChildItem"
```

## GitNexus stale, ambiguous, or degraded

- run preflight
- force analyze only if needed
- restart MCP/Codex session if stale persists
- fallback to `rg`
- record fallback in `Iteration log`

If `gitnexus analyze` exits early and no repo is indexed:
- verify `npx gitnexus status`
- inspect whether `.gitnexus/meta.json` exists
- if only `lbug` / `lbug.wal` files appear, treat the index as broken or incomplete
- reinstall `gitnexus` if needed
- if still broken, document GitNexus as unavailable and fallback to `rg`

If query/context/impact says multiple repos are indexed:
- pass `--repo <name>` explicitly

If keyword query warns that FTS indexes are missing:
- run `npx gitnexus analyze --force`

If a Dart-heavy repo has partial coverage:
- install or rebuild the optional `tree-sitter-dart` dependency
- otherwise accept partial indexing and document the limitation

## Researcher feels weak or incomplete

Verify:

```powershell
rg --version
npx gitnexus --help
```

Then update legacy helper scripts if present (prefer `researcher` skill + `~/.codex/skills/researcher/SKILL.md`).

If a bug fix keeps looping:
- switch to `researcher`
- gather repo facts plus external docs
- write a research note before patching again

## New machine missing tools

Read:
- `docs/tool-registry.md`
- `docs/mcp-registry.md`
- `docs/skills-registry.md`

Run:

```powershell
scripts\inventory-current-machine.ps1
```

## Secrets accidentally logged

Immediately:
- remove secret from docs
- rotate secret if exposed
- update docs to mention env var name only
