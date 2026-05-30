# Context Tools

## Trigger

Activate when Codex needs:

- codebase context
- external research
- impact analysis
- large log or test triage
- UI or browser QA
- tool, MCP, or skill lookup

## Search order

1. Known file or symbol -> use `rg`, file search, or symbol search.
2. Unknown flow or shared module -> use GitNexus context graph if available.
3. External API, docs, or research -> use web and Codex Research workflow.
4. Large UI or browser exploration -> browser QA or Codex Research workflow.
5. Only read full files when targeted snippets are insufficient.

## GitNexus policy

Use GitNexus for:

- unfamiliar code path
- refactor, rename, move, delete
- shared module change
- public API or type signature change
- dependency or caller impact
- MEDIUM/HIGH implementation
- architecture review

Do not run `gitnexus analyze` blindly every turn.

Run freshness preflight first.

Run analyze only when:

- `.gitnexus/` is missing
- index is stale for the task
- repo changed materially since last index
- impact analysis is needed

If GitNexus or MCP appears stale:

- restart MCP or Codex session if needed
- fallback to `rg` plus targeted file reads
- record fallback in `Iteration log`

## RTK policy

External binary:

```powershell
rtk git status
rtk pnpm test
rtk flutter analyze
```

PowerShell cmdlet:

```powershell
rtk proxy powershell -NoProfile -Command "Get-ChildItem ..."
rtk proxy powershell -NoProfile -Command "Test-Path ..."
```

Do not run:

```powershell
rtk Get-ChildItem
```

## Codex Research policy

Codex Research is the primary research layer.

Use Codex Research for:

- internet or docs research
- changelog and release-note review
- external platform behavior
- codebase exploration before implementation
- independent second-pass reasoning
- bug-fix escalation when direct fixes keep stalling

Codex Research outputs should become concise notes under:

- `plan/<feature>/research/*.md`
- `plan/<feature>/review/*.md`
- `plan/<feature>/handoff.md`

Preferred helper script:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\ADMIN\.codex\scripts\run-codex-research.ps1 `
  -Task "<task>" `
  -Out "plan\<feature>\research\<note>.md"
```

## Web and research policy

For external docs, APIs, and latest behavior:

- prefer official docs
- record source links in research notes
- separate facts from guesses
- never paste raw crawl output into plan

## Tool output rule

Large outputs:

- summarize
- save raw output only if needed
- link summary from plan
- do not paste huge logs into chat or plan
