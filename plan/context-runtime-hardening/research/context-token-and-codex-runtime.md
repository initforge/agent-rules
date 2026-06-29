# Context token and Codex runtime research

## Summary

The current architecture should keep the canonical source compact and install generated runtime output. Always-loaded context must stay stable, small and UTF-8 clean. Long domain detail belongs behind a project index, skill, reference or script.

Codex no longer needs repo-managed profile files. Phase routing should be expressed as task behavior and model/effort guidance, not as installed `~/.codex/agents/*.toml`.

## Evidence

- OpenAI Codex `AGENTS.md` discovery loads global guidance first, then project files from root to current directory. Codex stops adding project instructions at `project_doc_max_bytes`, 32 KiB by default.
  Source: https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex skills use progressive disclosure: initial context gets skill name, description and path; full `SKILL.md` is loaded only when selected. The initial skills list uses a capped budget.
  Source: https://developers.openai.com/codex/skills
- OpenAI prompt caching works on exact prompt prefixes. Static instructions and examples should be placed at the beginning; variable project/user content should be later. Caching starts automatically for recent models on long prompts.
  Source: https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI prompt guidance recommends tests/evals for prompt behavior changes and explicit instruction structure for consistency.
  Source: https://developers.openai.com/api/docs/guides/prompt-engineering

## Risks

- Keeping generated mirrors in the repo (`.agents`, `.codex`, platform runtime folders) creates drift and wastes context.
- Allowing mojibake in active Markdown makes Vietnamese rules ambiguous or unreadable.
- Installing retired Codex profiles recreates stale behavior and hides routing decisions outside canonical context.
- Moving volatile examples into always-loaded core reduces prompt-cache hits and consumes context window before task data/code/logs.
- Browser/Playwright verification is high-context evidence in Codex sessions because it tends to add screenshots, DOM traces, console logs and iterative navigation. It should not be the default verification channel when static checks, tests, DB/API queries or artifact inspection can prove the result.

## Recommendation

- Keep `knowledge/core` short, stable and platform-neutral.
- Keep platform differences in overlays only.
- Keep 5fedu detail in `context/5fedu` templates and project-local context, with `.agents` and `.codex` as pointers only.
- Remove Codex profiles from source and runtime install.
- Add validation gates for retired profiles, project mirrors, mojibake, token budgets and stale references.
- Make Codex browser verification opt-in. Default to build/typecheck/tests/source tracing/API or DB checks/artifact inspection, and report a clear `PARTIAL` gap when browser evidence is the only missing proof.

## Unknowns

- The exact Codex Desktop runtime path and config behavior may vary by installation, so cleanup should remove only repo-managed generated profile files and leave auth/cache/state untouched.
