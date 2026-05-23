@C:\Users\DELL\.codex\RTK.md
@C:\Users\DELL\.codex\rules\core.md
@C:\Users\DELL\.codex\rules\planning.md
@C:\Users\DELL\.codex\rules\execution.md
@C:\Users\DELL\.codex\rules\quality-gates.md
@C:\Users\DELL\.codex\rules\context-tools.md
@C:\Users\DELL\.codex\rules\tool-inventory.md
@C:\Users\DELL\.codex\rules\clean-code.md
@C:\Users\DELL\.codex\rules\codex-overlay.md

# Codex Runtime Loader

This is the global runtime instruction file for Codex.

## Runtime source

Use local files under:

```text
C:\Users\DELL\.codex\
```

Do not depend on `P:\agent-rules` during daily runtime.

`P:\agent-rules` is only for:
- backup
- sync
- new-machine bootstrap
- sharing rules with other agents/tools
- storing long setup docs

## Operating summary

Small obvious task -> direct edit + minimal verify.
Medium task -> inspect + plan when multi-slice + implement + verify.
High-risk task -> locked plan + risk register + reviewer gate + deep verify.
Codex Research -> primary research layer; output notes into `plan/<feature>/research/` or `plan/<feature>/review/`.
GitNexus -> gated context / impact tool, not auto-indexed every turn.
RTK -> command compression layer; PowerShell cmdlets require `rtk proxy powershell`.
Skills/MCP/tools -> inventory and document under `.codex\docs` and `.codex\inventory`.
Final status must be `PASS`, `PARTIAL`, or `BLOCKED`.

## Hard rule

Codex is the final implementation owner.
