---
name: 5fedu-project
description: Scaffold or maintain canonical 5fedu project context. Trigger on 5fedu setup, context/5fedu, owner decisions, Supabase/auth/database/UI conventions, or project-context synchronization. Do not use for ordinary implementation unless the repository already declares 5fedu context.
---

# 5fedu project

Canonical project knowledge lives at `<repo>/context/5fedu/`. Platform folders `.agents/` and `.codex/` contain only thin pointers; never duplicate domain packs.

## Setup

1. Inspect the target repo and existing `AGENTS.md`/`context/5fedu/AGENTS.md`.
2. Run `scripts/install-5fedu-context.ps1` only for initial setup.
3. Record project-specific stack, source/spec links, template commit, decisions and open questions. Never copy values from another project.
4. Do not store secrets; record environment variable names and verification paths.

## Maintenance

- Read `context/5fedu/AGENTS.md`, `context/5fedu/00-map/read-first.md`, decision status and questions first.
- Load only the domain packs needed for the task.
- Owner feedback remains project-local until abstracted through `context-evolution-protocol`.
- Database/auth/UI names must come from repository/spec/schema evidence.
- Use Codebase Memory MCP for impact analysis when available; fallback to `rg`, targeted reads and native navigation.
- UI work must identify the actual template/reference and verify browser behavior.

## Completion

Update the canonical context, decision status and map. Verify platform pointers still resolve to `context/5fedu/`; do not create `.agents/5fedu` or `.codex/5fedu` mirrors.

