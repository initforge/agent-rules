---
name: docs-style
description: Use this skill when creating, reviewing, rewriting, or restructuring high-quality project documentation for README.md, README-vi.md, technical specs, tech stack badges, screenshots, documentation cleanup, or /docs/**. Trigger for source-grounded docs, repo documentation architecture, docs quality complaints, README style, Vietnamese/English README parity, current-vs-legacy tech stack accuracy, or docs that must match/exceed a strong hand-written spec such as vhdg-conhon/SPECS.md.
---

# Docs Style

Use this skill to produce documentation that proves real project understanding. The target is not a prettier template; the target is documentation a maintainer can trust before opening the source.

The benchmark is a strong hand-written technical spec: it explains the product, domain pressure, architecture, data/workflow design, tradeoffs, failure modes, operations, and current limitations. Match that depth in the repo's own context. Do not copy one fixed structure across every repo.

## Hard Bar

Documentation must:

- open with what the project is, who it serves, current status, and the core engineering pressure;
- separate active behavior from legacy traces, experiments, mocks, TODOs, and deleted/archived features;
- derive stack, commands, routes, schemas, integrations, screenshots, and deploy claims from source or verified runtime behavior;
- explain why key design choices exist, what alternatives were rejected, and what tradeoff remains;
- cover normal paths and failure paths for important workflows;
- look deliberate on GitHub: coherent badges, verified screenshots, readable tables, useful diagrams, and no broken assets;
- read like edited technical documentation, not agent reasoning, source inventory, audit notes, or a generated checklist.

If a fact cannot be proven, omit it or write `TODO: xÃ¡c minh ...`. Never fill gaps with plausible guesses.

## Required Workflow

1. **Classify the repo first.**
   - Product/app: users, screens, flows, data, operations.
   - Frontend-only: public experience, routing, state, components, assets, build/deploy assumptions.
   - Backend/API: domain, endpoints, auth, data model, jobs, integrations, error handling.
   - Library/tooling: install/use, CLI/API, extension points, compatibility, failure modes.
   - Agent/rules repo: runtime loading, precedence, skill/tool flow, sync/backup model, guardrails.
   - Data/AI repo: input/output, provider path, data pipeline, evaluation, fallback.
   - Profile repo: keep minimal; do not force architecture docs.
   - Demo/prototype: clearly label real, mocked, incomplete, and planned parts.
2. **Read source before writing.** Inspect manifests, lockfiles, entry points, route/API definitions, schemas/migrations, env examples, deployment files, CI, tests/scripts, and the main UI/CLI surfaces.
3. **Build an evidence map privately.** For every major claim, know the source path or runtime check behind it. Use source paths sparingly in docs as "Where to verify", not as the main prose.
4. **Write from thesis to detail.** Start with the domain/product pressure, then system shape, then workflows, decisions, operations, and risks.
5. **Use verified visuals.** Capture screenshots with Playwright or a real browser when web UI is live/runnable. Store docs images under `/docs/assets/` unless the repo already has a clear docs asset convention.
6. **Clean the docs surface.** Move useful scattered markdown into `/docs`, merge repeated shallow files, delete stale migration/setup/task files only after preserving useful facts, and move loose docs assets into subfolders.
7. **Verify.** Check links/images, badge URLs, commands, formatting, and repo status. Do not report PASS until the quality gates pass.

For substantial rewrites, read `references/docs-style-reference.md` for the full rubric.

## Source Reading Standard

Do not claim "source-grounded" or "Ä‘Ã£ Ä‘á»c full" unless these areas were inspected where they exist:

- package/framework manifests and lockfiles;
- app/server/worker/CLI entry points;
- routing, controllers, handlers, pages, commands, or tool maps;
- schemas, migrations, ORM models, SQL, storage adapters, cache clients;
- auth, permissions, role guards, sessions, JWT, middleware;
- integrations: AI providers, payments, email, storage, CMS, analytics, external APIs;
- deployment/runtime: Docker, Compose, Vercel, Cloudflare, Pages, Nginx, env examples, GitHub Actions;
- UI surface: homepage/landing, dashboard/admin, important forms, live URLs, screenshots;
- tests, scripts, seed/maintenance/build/lint/deploy commands.

Use current/legacy/planned/unknown labels internally:

| Label | Meaning | Documentation treatment |
|---|---|---|
| Current | imported, routed, configured, or executed by current runtime | write as present behavior |
| Legacy | old code/config remains but is not active | label as legacy trace with location |
| Planned | TODO, roadmap, placeholder, partial scaffold | put in limitations/roadmap |
| Unknown | cannot prove from source/runtime | omit or mark `TODO: xÃ¡c minh ...` |

Example current-vs-legacy wording:

```md
OpenRouter is the active AI provider in the chat request path. A Cloudflare Worker AI adapter remains in `src/lib/ai/cloudflare.ts`, but no current route imports it; treat it as legacy until the request path changes.
```

## README Standard

`README.md` and `README-vi.md` are the entry points. If both exist, they must agree on facts.

A strong README answers quickly:

1. What is the project?
2. Who uses it?
3. What is the live/current/product state?
4. What are the main capabilities?
5. What is the verified tech stack?
6. What architecture shape matters?
7. How do I run or inspect it?
8. Where do I read deeper docs?

Recommended shape:

```md
# Project Name â€” concrete category

![Stack](...)
![Stack](...)

Live: https://...

One or two direct paragraphs explaining the product, audience, current state, and engineering pressure.

## Preview

![Homepage](docs/assets/homepage.png)

## What it does

## Technical Shape

## Why It Is Built This Way

## Run Locally

## Read Next
```

Avoid README bloat. Put route tables, schema details, incident playbooks, and long decision logs in `/docs`.

## Tech Badges

Badges are expected for product/app/tooling repos when the stack is clear. Every badge must be backed by active manifests, imports, config, or runtime behavior.

Rules:

- Use Shields.io `style=flat-square`.
- Header badges show only the primary active stack.
- Put detailed stack in a layer table.
- Do not badge stale dependencies, unused adapters, old screenshots, or copied configs.
- Prefer a clean text badge over a wrong logo.
- Verify badge URLs render on GitHub.

Example:

```md
| Layer | Stack |
|---|---|
| Frontend | ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) |
| Backend | ![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white) |
| Database | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white) |
| AI | ![OpenRouter](https://img.shields.io/badge/OpenRouter-111111?style=flat-square) |
```

## Technical Spec Standard

For non-trivial repos, create or maintain a deep spec. Use the repo's convention (`SPECS.md`, `docs/01-technical-specification.md`, or a small set of strong `/docs` files). Prefer fewer strong files over many thin files.

Minimum depth for a serious app:

- overview: product, domain, users, current status;
- domain model: terms, entities, rules, state transitions;
- technical challenges: concurrency, provider failure, data consistency, latency, auth, deployment constraints;
- architecture: runtime pieces, boundaries, and why they exist;
- tech stack: verified layer table;
- data model: schema, indexes, constraints, storage ownership;
- workflows: trigger, normal path, failure path, side effects, recovery;
- API/page surface: grouped routes/screens at useful depth;
- operations: env, run, build, deploy, logs, debugging, maintenance;
- risks/roadmap: current gaps, why they matter, next work.

Decision sections should be mini-arguments:

```md
### Decision: SSE instead of WebSocket

**Problem:** The UI needs server-to-client status updates but does not need bidirectional low-latency commands.
**Chosen approach:** Use SSE for result/payment/status broadcasts.
**Why this works here:** Browser reconnection and HTTP proxy compatibility reduce operational complexity.
**Rejected alternatives:** WebSocket adds protocol and reconnect handling without a matching product need.
**Tradeoff:** SSE is not suitable if future features need true bidirectional collaboration.
**Revisit when:** The product needs client-to-server realtime commands or multi-user live editing.
```

## `/docs` Organization

Organize by reader need, not by a fixed template.

Default full product:

```text
docs/
  01-technical-specification.md
  02-operations.md
  03-risks-and-roadmap.md
  assets/
```

Use more files only when each file has real depth. Avoid `01-start-here.md` if README already does that job.

For agent/rules repos:

```text
docs/
  01-runtime-model.md
  02-rule-and-skill-system.md
  03-tooling-and-sync.md
  04-maintenance-and-risks.md
```

For backend/API repos:

```text
docs/
  01-domain-and-contracts.md
  02-architecture.md
  03-api-and-auth.md
  04-data-and-operations.md
  assets/
```

## Screenshots

Rules:

- Use Playwright or a real browser when the UI is live/runnable.
- Capture homepage/landing at minimum; add 1-2 workflow/admin screenshots when available and safe.
- Store images under `/docs/assets/` or the repo's existing docs image folder.
- Use descriptive filenames: `homepage.png`, `admin-dashboard.png`, `checkout-flow.png`.
- Verify the image exists and renders after moving.
- Do not include sensitive data, placeholder screenshots, broken links, or screenshots from another project.

## Cleanup Rules

Allowed:

- move useful scattered markdown into `/docs`;
- merge duplicated setup/architecture files;
- delete stale completed migration notes, debug dumps, temporary specs, or old task artifacts when the current docs preserve useful facts;
- move loose images/assets under `/docs/assets/` or a named subfolder.

Not allowed:

- delete a file you have not read;
- delete docs only because the tree looks cluttered;
- touch core source during docs cleanup unless explicitly required for verification/build correctness;
- rewrite history or revert user work without explicit instruction.

## Writing Standard

Use Vietnamese with full diacritics for `README-vi.md` and Vietnamese docs. Use English technical terms when they are the natural term.

Write:

- direct, specific, edited, domain-aware prose;
- "why first", then implementation details;
- concrete failure modes and tradeoffs;
- source anchors only where they help verification.

Do not write:

- "This project contains...";
- "The codebase appears to...";
- "I found...";
- "modern/scalable/robust" without evidence;
- long file inventories as a substitute for explanation;
- agent reasoning, audit narration, or generic template filler.

Bad:

```md
The frontend is in `src`, the backend is in `backend`, and Docker files are at root.
```

Good:

```md
The browser client owns interaction state; the backend owns irreversible operations such as persistence, payment callbacks, and administrative changes. That boundary keeps UI failures recoverable while preventing provider-specific side effects from leaking into components.
```

## Quality Gates

Fail the docs if any item is true:

- README does not make the project understandable in one pass.
- Stack is guessed, stale, or contradicted by manifests/config/imports.
- Current and legacy code paths are mixed without labels.
- Screenshots, live links, badges, or docs links are broken.
- The spec lacks thesis, design rationale, rejected alternatives, operating risks, or failure paths.
- `/docs` is many shallow files that repeat the README.
- Diagrams do not match runtime boundaries.
- Commands do not match scripts/config.
- Docs read like source inventory, agent notes, or reasoning.
- Important unknowns are stated as facts.

Before reporting completion, score the result privately across: domain understanding, source grounding, technical challenges, architecture rationale, workflow depth, operating reality, visual organization, writing quality, cleanup, and reader usefulness. Serious repos should be at least 8/10; flagship docs should target 9/10.

## Reporting

When reporting work, state:

- repos/files changed;
- evidence inspected;
- screenshots or links verified;
- commands/tests run;
- facts left as `TODO: xÃ¡c minh ...`;
- whether CI/CD was skipped, avoided by branch/workflow rules, or impossible to guarantee.

Do not claim "Ä‘Ã£ Ä‘á»c full codebase" unless the source reading standard was actually completed.
