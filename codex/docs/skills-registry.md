# Skills Registry

## Purpose

Document Codex skills, native profiles, and local skill taxonomy so new machines can rebuild them.

See also:
- `C:\Users\DELL\.codex\docs\skills-taxonomy.md`
- `C:\Users\DELL\.codex\docs\profile-matrix.md`
- `C:\Users\DELL\.codex\docs\clean-code-reference.md`
- `C:\Users\DELL\.codex\docs\phase-orchestration.md`

## Codex skills

Codex skills live under:

```text
C:\Users\DELL\.codex\skills\
```

A skill is usually:

```text
skill-name\
├─ SKILL.md
├─ scripts\
├─ references\
└─ assets\
```

## Required format

### <skill-name>

Runtime:
- Codex | local-agent-ecosystem | both

Purpose:
- ...

Path:
- ...

Install/copy:
- <command>

Verify:
- <command>

Trigger:
- when agent should use this skill

Inputs:
- ...

Outputs:
- ...

Notes:
- ...

## Current skills

### docs-style

Runtime:
- Codex

Purpose:
- Create, review, and rewrite source-grounded project documentation for `README.md`, `README-vi.md`, technical specs, tech stack badges, screenshots, and `/docs/**`.

Path:
- `C:\Users\DELL\.codex\skills\docs-style`

Install/copy:
- copied with the standard Codex sync into `P:\agent-rules\codex\skills\docs-style`

Verify:
- `python C:\Users\DELL\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\DELL\.codex\skills\docs-style`

Trigger:
- README or README-vi rewrite
- technical specification work
- source-grounded docs cleanup
- tech stack badge/table accuracy
- screenshots in docs
- architecture, workflow, operations, risk, and roadmap docs

Inputs:
- target repo and documentation files
- source evidence from manifests, routes, schemas, configs, runtime files, screenshots, and existing docs

Outputs:
- rewritten README/README-vi or `/docs/**`
- deep technical specification
- verified stack badge/table presentation
- docs cleanup summary

Notes:
- current quality bar is why-first technical literature, equal to or stronger than `vhdg-conhon/SPECS.md`
- must not claim full source grounding unless source evidence was actually inspected
- category: self-authored

### codex-research

Runtime:
- Codex

Purpose:
- Run structured research inside Codex using local context, GitNexus, and web, then write a reusable research note before implementation.

Path:
- `C:\Users\DELL\.codex\skills\codex-research`

Install/copy:
- local custom skill; include in Codex sync bundle

Verify:
- `python C:\Users\DELL\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\DELL\.codex\skills\codex-research`

Trigger:
- external docs
- latest API behavior
- issue/changelog review
- broad research and source gathering
- independent second-pass review
- bug fix that has stalled and needs evidence before another patch

Inputs:
- task prompt
- optional repo path

Outputs:
- research or review note with Summary, Evidence, Risks, Recommendation, and Unknowns

Notes:
- category: self-authored
- preferred native profile: `researcher`

### workflow-router

Runtime:
- Codex

Purpose:
- Route a task into the correct native workflow phase and matching model/profile.

Path:
- `C:\Users\DELL\.codex\skills\workflow-router`

Install/copy:
- local custom skill; include in Codex sync bundle

Verify:
- `python C:\Users\DELL\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\DELL\.codex\skills\workflow-router`

Trigger:
- task must move between plan, research, implement, bugfix, and review
- the user wants controlled model switching by phase
- a bug has stalled and phase change is needed

Inputs:
- task description
- active plan or risk level
- whether the bug is still stuck

Outputs:
- phase selection
- profile selection
- launch hint or command

Notes:
- category: self-authored
- works with `resolve-workflow-profile.ps1` and `start-codex-phase.ps1`
- also works with `resolve-plan-profile.ps1` and `start-codex-from-plan.ps1`

### frontend-ui-quality

Runtime:
- Codex

Purpose:
- Raise implementation and QA bar for frontend UI/UX work.

Path:
- `C:\Users\DELL\.codex\skills\frontend-ui-quality`

Install/copy:
- local custom skill; include in Codex sync bundle

Verify:
- inspect `SKILL.md` and run a frontend task that requires visual QA

Trigger:
- frontend screens
- responsive behavior
- visual polish
- layout correctness

Notes:
- category: self-authored

### ui-ux-pro-max

Runtime:
- Codex

Purpose:
- Design system and UI/UX ideation support.

Path:
- `C:\Users\DELL\.codex\skills\ui-ux-pro-max`

Install/copy:
- local custom skill; include in Codex sync bundle

Verify:
- inspect `SKILL.md`

Trigger:
- UI/UX concepting
- visual direction work
- style system generation

Notes:
- category: self-authored

### caveman / cavecrew / gitnexus-* family

Runtime:
- local agent ecosystem

Purpose:
- compressed communication, compressed delegation, and GitNexus-specific helper workflows

Path:
- `C:\Users\DELL\.agents\skills\`

Install/copy:
- maintain separately from `C:\Users\DELL\.codex\skills`

Verify:
- inspect corresponding `SKILL.md` files

Trigger:
- explicit user requests or system rules that reference those skills

Notes:
- these are local authored skills, but they are not stored inside the main Codex runtime folder

### Vendor-installed local skills

Runtime:
- Codex

Purpose:
- Provide installed utility workflows that are not self-authored.

Path:
- `C:\Users\DELL\.codex\skills`

Members:
- `pdf`
- `playwright`
- `playwright-interactive`
- `screenshot`
- `security-best-practices`
- `security-ownership-map`
- `security-threat-model`

Notes:
- category: vendor-installed
- documented separately in `skills-taxonomy.md`

### plan-execution

Runtime:
- Codex

Purpose:
- Create/execute locked `plan/` workflows with verification evidence.

Path:
- `C:\Users\DELL\.codex\rules\planning.md`
- future skill candidate: `C:\Users\DELL\.codex\skills\plan-execution\SKILL.md`

Trigger:
- MEDIUM/HIGH task
- user asks for plan
- repo has `plan/`

### risk-review

Runtime:
- Codex

Purpose:
- Review risks, missing verification, regressions, and scope creep.

Path:
- future skill candidate: `C:\Users\DELL\.codex\skills\risk-review\SKILL.md`

Trigger:
- HIGH risk task
- plan review
- diff review
- auth/security/db/concurrency

### Native profiles

Runtime:
- Codex

Purpose:
- Give native app-visible model presets for plan, research, implementation, bug fixing, and review.

Profiles:
- `planner`
- `researcher`
- `implementer`
- `bugfixer`
- `bugfixer-escalated`
- `reviewer`
- `reviewer-highrisk`
