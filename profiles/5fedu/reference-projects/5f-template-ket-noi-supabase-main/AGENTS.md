# 5F Enterprise Template — Agent Instructions

> Vietnamese internal ERP/admin SPA. Cross-tool context for Cursor, Claude Code, Codex, and other agents.

## Stack

React 19 · Vite 7 · TypeScript (strict) · Tailwind CSS v4 · React Router v7  
Supabase (PostgreSQL + Auth) · TanStack Query v5 · Zustand · React Hook Form + Zod  
Framer Motion · Recharts · Lucide · Sonner · Sentry · PWA (Vite)

Dev: `npm run dev` (port 5173) · Dev mock: `VITE_DATA_SOURCE=mock` in `.env` · Prod build defaults Supabase + Cloudinary

## Architecture

- **Feature-based modules** under `features/` — not organized by file type at repo root
- **No `src/` folder** — paths use `@/*` alias to project root
- **Server state:** TanStack Query in `features/*/hooks/` + keys in `lib/query-keys.ts`
- **Client UI state:** Zustand in `features/*/store/` (pagination, filters, selection — not server data)
- **Data access:** `features/*/services/` + `lib/supabase/` — never query Supabase inside components
- **Forms:** Zod schema in `features/*/core/schema.ts` + React Hook Form + `zodResolver`
- **View layer:** `lib/view-types/` (screen patterns) + `lib/data-types/` (field widgets)

## Project conventions (5F)

- Dialog sizes: `lib/dialog-sizes.ts` (`DIALOG_SIZE`, drawer 48rem / stacked 44rem)
- UI details: `docs/UI-CONVENTIONS.md`, `docs/view-types.md`, `docs/data-types.md`
- Module checklist: `docs/checklist-module.md`
- Supabase bandwidth: `docs/supabase-egress.md` · skill `.cursor/skills/supabase-egress/SKILL.md`
- Pattern docs: `docs/patterns-button-labels.md`, `docs/patterns-data-table-actions.md`, `docs/patterns-permissions.md`
- Section titles: primary color (`variant="primary"`)
- Toolbars: `FilterChipMultiSelect` — no custom filter dropdowns
- Strings: `txt()` from `lib/text` for Vietnamese copy (feature strings registered in `lib/text/bootstrap-module-strings.ts`)
- Cross-folder imports: `@/*` path alias (ESLint **error** on deep `../` — see `.cursor/rules/07-imports-lint.mdc`)

## Reserved dependencies (QR / payment roadmap)

Packages `napas-qr`, `vietqr`, `qrcode` are kept in `package.json` for upcoming NAPAS/VietQR integration. Stub: `lib/payment/reserved-deps.ts`.

## Cursor rules (detailed)

| File | Topic |
|------|--------|
| `.cursor/rules/01-core-stack.mdc` | React, TS, Vite, Tailwind, banned libs |
| `.cursor/rules/02-state-data.mdc` | TanStack Query + Zustand |
| `.cursor/rules/03-forms-validation.mdc` | RHF + Zod (**glob-scoped**, not alwaysApply) |
| `.cursor/rules/04-supabase.mdc` | Auth, RLS, migrations, edge functions (**glob-scoped**) |
| `.cursor/rules/05-architecture.mdc` | Feature layout, naming, imports |
| `.cursor/rules/06-project-5f.mdc` | Dialog, drawer, toolbar, design tokens |
| `.cursor/rules/07-imports-lint.mdc` | `@/` imports, Supabase static import, `lint:ci` |
| `.cursor/rules/08-permissions.mdc` | RBAC matrix, cap_bac, nguoi_tao, nav filter |

## Skills (Anthropic official — `.cursor/skills/`)

Use when the task matches:

| Skill | Use when |
|-------|----------|
| `frontend-design` | Building polished React UI, avoiding generic AI aesthetics |
| `webapp-testing` | Playwright E2E against local Vite app |
| `docx` / `pdf` / `xlsx` / `pptx` | Contracts, reports, payroll, imports/exports, presentations |
| `claude-api` | Integrating Claude API (models, tools, MCP) |
| `internal-comms` | Status reports, incident reports, internal FAQs |
| `doc-coauthoring` | Technical specs, proposals, decision docs |
| `theme-factory` | Consistent document/slide themes |
| `mcp-builder` | MCP servers for ERP integrations |
| `skill-creator` | Creating custom domain skills (HR, finance, inventory) |
| `supabase-egress` | Supabase PostgREST bandwidth: selective columns, pagination keys, queryOptions |
| `import-lint` | `@/` path alias, no dynamic Supabase imports, `lint:ci` gate |

## Verification

Before merge: `npm run lint:ci` · `npm run test` · `npm run build`

Pre-commit: Husky runs `lint-staged` (ESLint `--max-warnings 0` on staged `*.{ts,tsx}`). CI should run the same three commands as verification.

## Scope

- Minimal diffs — match existing patterns in `features/he-thong/`
- Do not add dependencies outside the stack without approval
- Do not commit secrets (`.env`, credentials)
