---
alwaysApply: true
description: Codex-only runtime delta.
---

# Codex overlay

- Use native file links and patch-based edits.
- Preserve user changes in dirty worktrees.
- Do not install or depend on Codex profile files; use normal task reasoning, skills and local context routing instead.
- Do not use browser/Playwright verification by default. Prefer source tracing, typecheck, build, unit tests, API/DB queries, artifact inspection and targeted static checks. Use browser automation only when the user explicitly asks for browser/live visual verification or when no non-browser evidence can validate the requested outcome; if browser is the only missing proof, report `PARTIAL` with that single verification gap.
- Treat mojibake in Vietnamese or other Unicode text as a harness defect: read/write UTF-8, repair corrupted text at the canonical source, and verify before reporting success.
- Global runtime lives under `$CODEX_HOME` or `~/.codex`; project `.codex/` contains only project config/pointers.
