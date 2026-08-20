# Tech Stack and Template

**Scope:** Default stack for 5fedu projects. Each project may declare deviations.

## Default stack (confirmed at install)

- Frontend: **React (Vite)** + TypeScript
- UI: Tailwind + `components/ui` (shadcn-style); no external registry without approval
- Data: TanStack Query, Zustand, React Hook Form + Zod
- Backend: Supabase PostgreSQL + Auth
- Media: Cloudinary (when declared)
- Mock data: only when owner confirms

## Template

```
https://github.com/admin5fedu/5f-template-ket-noi-supabase
```

When implementing:
1. Clone template (or use owner-provided local copy — no hardcoded dev paths in repo)
2. Read module reference in template before adapting
3. Report if core template changes are needed

## Infra optimization patterns

- **Supabase:** reduce egress — select sufficient columns, server-side pagination
- **Vercel Edge:** cache static; heavy APIs on server/RPC
- Media via CDN; no large image proxy through client

## Template principles

- Prefer adding/adapting modules per spec
- Minimize editing/deleting working template parts
- Before editing existing module: read its flow, route, state, service, components
- Major changes: report rationale and risks first

## Project-specific stacks

Project-specific stack deviations are documented in `projects/<name>/tech-deviations.md`.
