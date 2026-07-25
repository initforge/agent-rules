---
name: import-lint
description: Fix and prevent ESLint import warnings — @/ path alias, no cross-folder relative paths (../../*), static Supabase client/auth imports, lint:ci gate. Use when editing imports, adding modules, fixing lint warnings, or reviewing PRs for import conventions.
---

# Import & Lint Conventions — 5F Template

Rules: `.cursor/rules/07-imports-lint.mdc` · ESLint: `eslint.config.js`

## When to use

- Adding or moving files under `features/`, `components/`, `lib/`
- ESLint `no-restricted-imports` or `no-restricted-syntax` (Supabase dynamic import)
- User asks to reduce lint warnings or align imports with project standards

## Checklist (every touched file)

1. **Cross-folder** → `@/lib/...`, `@/components/...`, `@/features/...`, `@/hooks/...`, `@/store/...`
2. **Same feature entity** → relative OK: `../core/types`, `./nhan-vien-form`
3. **Supabase** → static `import { getSupabase } from '@/lib/supabase/client'` in services; never `await import('@/lib/supabase/client')`
4. **Auth** → static `import { getAuthService } from '@/lib/supabase/auth'` in components/hooks that call signOut/session
5. Run **`npm run lint:ci`** on changed files (or full repo before merge)

## Bulk fix cross-folder relative imports

```bash
node scripts/fix-deep-imports.mjs --dry-run   # preview
node scripts/fix-deep-imports.mjs             # apply
npm run lint:imports:check                    # CI regression guard
```

Converts any `from '../../*'` (and deeper) to `@/…`, except `./` and `../` paths that stay inside `features/<domain>/<entity>/`.

## Anti-patterns

| Bad | Good |
|-----|------|
| `from '../../lib/text'` | `from '@/lib/text'` |
| `from '../../../../lib/text'` | `from '@/lib/text'` |
| `await import('@/lib/supabase/client')` in service already using `createRepository` | top-level `import { getSupabase } from '@/lib/supabase/client'` |
| `watch('field')` for derived UI (React Compiler) | `useWatch({ control, name: 'field' })` |

## Verification

```bash
npm run lint:ci
npm run lint:imports:check
npm run test
npm run build   # no Vite "dynamically imported but also statically imported" for supabase client/auth
```
