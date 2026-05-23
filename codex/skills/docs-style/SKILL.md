---
name: docs-style
description: Use this skill only when creating, editing, reviewing, restructuring, or standardizing project documentation files under /docs/**. This skill must not be used for README.md, AGENTS.md, CHANGELOG.md, issue templates, PR templates, comments, code comments, or any markdown file outside /docs/** unless the user explicitly asks to apply the /docs documentation style there.
---

# Docs Style

Use this skill only for documentation work under `/docs/**`.

## Scope guard

Apply this skill when:
- target file is inside `/docs/**`
- user asks for docs, project docs, architecture docs, bottleneck docs, system docs, or documentation folder work

Do not apply this skill when the target is:
- `README.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/**`
- `.vscode/**`
- any markdown outside `/docs/**`
- code comments
- inline docstrings
- issue or PR templates
- commit messages

If a task touches both `/docs/**` and markdown outside `/docs/**`, apply this skill only to `/docs/**` unless the user explicitly asks for the same style elsewhere.

## Core goal

Write semi-technical Vietnamese documentation that is:
- clear enough for non-technical readers
- serious enough for developers
- easy to scan and maintain
- not overly casual
- not overly academic
- not written like a beginner tutorial
- written in Vietnamese with diacritics by default
- structured to avoid repeated ideas, repeated headings, or duplicated sections

Keep technical terms. Add a short parenthetical explanation only when the term may block understanding.

## Workflow

1. Check that target paths are under `/docs/**`.
2. Preserve facts first; improve structure before wording.
3. Use the standard templates and naming scheme from `references/docs-style-reference.md`.
4. Prefer project-specific numbering that reads clearly from top to bottom. The numbering must still be linear and easy to follow. Default to sequential numbering like `01-`, `02-`, `03-`. If a project already uses a stronger local convention such as `10/20/30`, keep it only when that convention still preserves a clear linear reading order.
5. Refactor file names when the current names are unclear, duplicated, or inconsistent with the reading order.
6. Prefer short sections, compact tables, and plain text diagrams.
7. Mark unknown facts as `TODO` instead of guessing.
8. Never leak real secrets, tokens, or credentials.

## Required reference

Before writing or rewriting `/docs/**`, read:

`references/docs-style-reference.md`

That file contains:
- activation scope
- tone rules
- term policy
- file naming and numbering
- Vietnamese writing rules
- standard templates
- bottleneck/workflow/component/decision/glossary patterns
- table and diagram rules
- setup/security/performance/AI docs rules
- rewrite rules
- review checklist
- hard rules

## Output reporting

When reporting a docs change, be specific:

Good:
- Updated `/docs/05-data-flow.md`
- Added short explanations for `latency`, `timeout`, and `cache`
- Split flow into diagram + step table
- Added failure points for cache miss and database timeout
- Renamed docs to a clearer sequential order for this project

Bad:
- I made the docs better and easier to understand
