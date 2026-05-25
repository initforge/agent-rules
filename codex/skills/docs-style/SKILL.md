---
name: docs-style
description: Use this skill when creating, reviewing, rewriting, or restructuring high-quality project documentation for README.md, README-vi.md, or /docs/**. Trigger when the user asks for docs quality, README style, documentation architecture, source-grounded docs, repo documentation cleanup, screenshots in docs, tech stack accuracy, or docs that must match or exceed a strong project spec such as vhdg-conhon/SPECS.md.
---

# Docs Style

Use this skill to produce human-readable project documentation that is grounded in the actual codebase. The standard is not "complete enough"; the standard is that a maintainer, reviewer, or future developer can understand the product, architecture, workflows, tradeoffs, and current operating reality without reading the whole source first.

## Non-negotiable bar

Documentation must be at least as deliberate as a strong hand-written project spec:

- It explains what the project is, who it serves, and why the architecture exists.
- It opens with a clear thesis: the project category, domain pressure, and the core engineering problem it solves.
- It separates current behavior from legacy traces, experiments, TODOs, and dead code.
- It derives tech stack, commands, routes, APIs, data stores, deployment, screenshots, and diagrams from source or verified runtime behavior.
- It uses source paths as internal evidence, not as the main reading experience.
- It reads like edited technical documentation, not like agent reasoning, audit notes, a file inventory, or a generated checklist.
- It has deliberate visual organization on GitHub: clean heading rhythm, verified screenshots, readable diagrams, and accurate tech badges/icons.
- It teaches the system through decisions, tradeoffs, failure modes, and operating reality, not just through feature lists.

If you cannot establish an important fact from source, write `TODO: xác minh ...` or omit the claim. Never fill gaps with plausible guesses.

## Required workflow

1. Classify the repo before writing:
   - Product/app: explain users, screens, flows, data, operations.
   - Library/tooling: explain purpose, installation, API/CLI surface, extension points, failure modes.
   - Agent/rules repo: explain runtime loading, rule precedence, skill/tool flow, sync/backup model, operational guardrails.
   - Profile/portfolio repo: keep documentation minimal; do not force architecture docs.
   - Demo/prototype: state what is real, what is mocked, and what is incomplete.
2. Read enough source to understand the project, not just the docs already present. At minimum inspect manifests, entry points, route/API definitions, config, environment examples, database/schema files, deployment files, and main UI screens or CLI commands.
3. Build a private evidence map while working. Use it to avoid false claims, but do not dump it into the final docs.
4. Check screenshots and badges. Do not leave broken images, stale live URLs, wrong tech badges, or screenshots that no longer represent the project.
5. Build the tech stack presentation from verified source. Prefer compact Shields.io badges in the README header and a layer-by-layer tech stack table in the technical spec when the project has enough stack depth.
6. Extract the project's core decisions: why this stack, why this data model, why this runtime shape, why this workflow, and what alternatives were rejected.
7. Extract the operating risks: concurrency, provider failure, stale state, auth/permission gaps, deployment mismatch, data consistency, cost, latency, and manual recovery.
8. Choose the documentation shape from the repo. Do not force one universal file map.
9. Write README first as the reader entry point, then `/docs/**` as deeper material. `README-vi.md` and `README.md` must agree on facts when both exist.
10. Review the result against the fail gates below before committing or reporting completion.

## Source reading standard

Do not claim that docs are source-grounded unless you have inspected the code paths that prove the claim.

Minimum source areas:

- Package and framework manifests: `package.json`, lockfiles, `requirements.txt`, `pyproject.toml`, `go.mod`, `pubspec.yaml`, etc.
- App entry points and routing: pages, routers, controllers, handlers, CLI commands, workers.
- Data and persistence: schemas, migrations, Prisma/Drizzle/TypeORM models, SQL files, storage adapters, cache clients.
- Integration points: AI providers, payment gateways, auth, email, object storage, analytics, external APIs.
- Runtime and deployment: Docker, Compose, GitHub Actions, Cloudflare/Vercel/Pages configs, Nginx, env examples.
- UI surface: homepage, dashboard, admin pages, forms, screenshots, live URLs when available.
- Tests and scripts: test commands, seed scripts, maintenance scripts, build/lint scripts.

Record legacy traces explicitly when source shows them. Example: "Cloudflare Worker AI remains in older adapter files, but the active request path now uses OpenRouter" only if the current path and leftover files both exist.

## Writing rules

Use Vietnamese with full diacritics for `README-vi.md` and Vietnamese docs. Use English only where the repo already uses English docs or the requested output is English.

Write in a controlled editorial voice:

- Start with the product/problem, then the architecture.
- Use a thesis-driven opening: "This system exists because..." or an equivalent direct framing.
- Explain why a design exists before listing files.
- For each important design, include the problem, chosen solution, rejected alternatives, tradeoff, and when the decision should be revisited.
- Prefer a small number of strong sections over many thin files.
- Use diagrams only when they clarify a real flow.
- Keep commands and API examples accurate and minimal.
- Use file paths sparingly, in "Where to verify" notes, footnotes, or compact source anchors.

Avoid:

- "This project contains..."
- "The codebase appears to..."
- "I found..."
- "Reasoning/thinking" narration.
- Long lists of files as a substitute for explanation.
- Generic claims such as "scalable", "robust", "modern", "optimized" without evidence.
- Inspirational fluff that is not tied to a real product, user, constraint, or engineering decision.

## README rules

`README.md` or `README-vi.md` should answer quickly:

1. What is the project?
2. Who uses it?
3. What is the current live/product state?
4. What are the main capabilities?
5. What is the real tech stack?
6. What architecture shape matters?
7. How do I run it?
8. Where do I read deeper docs?

Badges are expected for product/app/tooling repos when the stack is clear. If used, every badge must be backed by manifests, config, imports, or active runtime code. Do not add a badge because a dependency exists only in old/unused code.

Badge standard:

- Use compact Shields.io badges with icons where available.
- Use `style=flat-square` for consistent GitHub rendering.
- Group badges in the header for the primary stack only.
- Use a layer table for detailed stack: `Frontend`, `Backend`, `AI`, `Auth`, `Database`, `Cache`, `Data Fetching`, `Deploy`, `Testing`, etc.
- Keep badges visually balanced; avoid long badge walls that wrap badly.
- If a stack item has no good icon, use a clean text badge instead of forcing a wrong logo.

Example layer table:

```md
## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) |
| Backend | ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=flat-square&logo=cloudflare&logoColor=white) ![D1](https://img.shields.io/badge/D1_SQLite-003B57?style=flat-square) |
| AI | ![OpenRouter](https://img.shields.io/badge/OpenRouter-111111?style=flat-square) |
| Auth | ![JWT](https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white) |
```

## /docs rules

Use `/docs/**` for depth, not for dumping everything that did not fit the README.

Good docs explain:

- business/domain rules that affect code behavior
- architecture and runtime boundaries
- user/admin/worker/API workflows
- data lifecycle and consistency rules
- integration contracts and failure handling
- deployment and operations
- known limitations and roadmap

For substantial apps, include a technical specification file or equivalent deep docs that cover:

- domain model and important business rules
- main technical challenges and why they matter
- design decisions with rejected alternatives and tradeoffs
- architecture with design reasons, not only component names
- data model, indexes, schemas, or persistence strategy
- workflow details for user, admin, worker, webhook, AI, or background paths
- API/route surface at a useful level of detail
- page/screen overview when UI exists
- deployment/runtime model
- operational risks, bottlenecks, and recovery paths
- maintenance notes: what must be checked before changing core flows

Move scattered markdown into `/docs/**` only when it remains useful. Merge or delete obsolete migration/setup notes when the current README/docs already cover them. Put non-document assets under a clear subfolder such as `/docs/assets/`.

## Quality gates

Fail the documentation if any of these are true:

- A maintainer cannot tell what the project actually does after the README.
- Tech stack is guessed, stale, or contradicted by manifests/config.
- Screenshots or badges are broken on GitHub.
- Badge/table presentation is ugly, inconsistent, overlong, or visually noisier than the content.
- Docs read like source inventory, agent notes, or a generated template.
- Current state and legacy traces are mixed together without labels.
- Important workflows have no normal path and failure path.
- Architecture diagrams do not match code/runtime boundaries.
- Setup commands are copied without checking scripts/config.
- `/docs` contains many shallow files that repeat the README.
- The doc uses vague praise instead of concrete behavior and tradeoffs.
- The technical spec does not reach the depth of the repo's real complexity.
- The document has no thesis, no decision rationale, no rejected alternatives, or no operating risks.
- The prose is emotionally flat because it never explains why the project matters, or it becomes "inspirational" without technical substance.

## Required reference

Before a substantial rewrite, read:

`references/docs-style-reference.md`

That file contains the detailed rubric for source study, repo classification, README/README-vi structure, `/docs` organization, screenshots, diagrams, cleanup, and final review.

## Reporting

When reporting work, state:

- which repos/files changed
- what evidence was used
- which screenshots or links were verified
- which facts remain `TODO`
- whether CI/CD was avoided, skipped, or impossible to guarantee

Do not claim "đã đọc full codebase" unless the source reading standard above was actually completed.
