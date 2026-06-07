---
description: Run source-backed research before implementation or when a bug fix is stalled.
---

# Codex Research

1. State the research question in one sentence.
2. Separate local repo facts from internet facts.
3. Search official/primary sources first. Use vendor docs, source repositories, standards, changelogs or papers before blogs.
4. Utilize Antigravity's native search capabilities:
   - Use the `search_web` tool for broad and rapid queries.
   - Use the `read_url_content` tool to read static pages/docs directly as clean Markdown.
   - Use the `browser_subagent` tool when pages require interaction, logins, or visual verification.
5. If researching OpenAI products, restrict sources to official OpenAI documentation unless the user asks otherwise.
6. If researching Antigravity, prefer official docs:
   - https://www.antigravity.google/docs/projects
   - https://antigravity.google/docs/rules-workflows
   - https://www.antigravity.google/docs/hooks
   - https://antigravity.google/docs/permissions
7. Record concise notes under `plan/<feature>/research/` when the task has a plan folder, or save research findings as an Antigravity markdown artifact.
8. Return:
   - Summary
   - Evidence with links
   - Risks
   - Recommended next steps
   - Questions / unknowns
9. Do not edit implementation files during the research pass unless the user explicitly asks to apply the result.
