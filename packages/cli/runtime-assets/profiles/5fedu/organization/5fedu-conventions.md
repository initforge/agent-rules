# 5fedu Organization Conventions

**Scope:** Projects that explicitly activate the 5fedu domain pack.
**Canonical source:** This harness profile plus its manifest-bound reference source.

## Project boundary

A 5fedu project does **not** need the ERP template installed in its repository. Reusable 5fedu context and reference code stay in agent-rules. The active repository remains authoritative for project-specific schema, routes, business decisions, credentials, and deviations.

Legacy repositories may still contain `context/5fedu/`; that layout is compatibility-only and is not required by North-Star routing.

## Technology baseline

The bundled reference source currently demonstrates React/Vite + TypeScript, Tailwind/shadcn-style UI, TanStack Query/Zustand, React Hook Form/Zod, and Supabase. Treat this as a source-grounded reference baseline, **not** permission to overwrite an active project's declared stack.

## Context routing policy

- 5fedu is explicit-only; prompt wording never activates it.
- Generic core must not import 5fedu behavior.
- Domain behavior is loaded only for an active 5fedu scope and must point to source evidence when it claims template parity.
- Project facts are read from the active project, not invented from the template.
- Evidence/archive are never auto-loaded.

## Source-grounded organization rules

Rules such as identifier strategy, fake-email auth, permission vocabulary, audit columns, and hierarchy levels must be checked against the active project's spec/schema before implementation. The bundled template is an authoritative reference for template behavior, not a substitute for target-project requirements.
