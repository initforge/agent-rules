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

### 5fedu-project

Runtime:
- Codex

Purpose:
- Scaffold and maintain project-local 5fedu conventions for frontend template usage, Supabase/database rules, auth, permissions, Vietnamese module mapping, decision status, and delivery verification.

Path:
- `C:\Users\DELL\.codex\skills\5fedu-project`

Install/copy:
- local custom skill; include in Codex sync bundle

Verify:
- `python C:\Users\DELL\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\DELL\.codex\skills\5fedu-project`

Trigger:
- setup or update project `AGENTS.md` for a 5fedu repo
- scaffold a new 5fedu project context
- add or revise `.codex/5fedu/*.md`
- update decision status or unresolved questions
- record new 5fedu Supabase/AppSheet, Vietnamese module mapping, auth, permissions, or database conventions into project context

Inputs:
- target repo path
- optional project spec, screenshots, Google Sheet, credentials names, and module mapping

Outputs:
- project-local `AGENTS.md`
- `.codex/5fedu/*.md`
- mapping questions and implementation guardrails
- `06-decision-status.md` with `DA_CHOT`, `CHUA_CHOT`, and `CAN_HOI_THEM`
- `07-working-format.md` describing default 5fedu format/how-to separately from app-specific values

Notes:
- category: self-authored
- keep 5fedu rules project-local; do not bloat global `AGENTS.md`
- use only one slash/custom prompt: `/5fedu`
- `/5fedu` is for setup/context maintenance, not a required prompt for every ordinary implementation turn

### docs-style

Runtime:
- Codex

Purpose:
- Apply the initforge README/docs house style: short portfolio-ready README, real screenshots when available, numbered linear docs, SPECS-style technical depth, safe cleanup, and CI/CD-aware documentation changes.

Path:
- `C:\Users\DELL\.codex\skills\docs-style`

Install/copy:
- copied with the standard Codex sync from `P:\agent-rules\skills\docs-style`

Verify:
- `$env:PYTHONUTF8='1'; python C:\Users\DELL\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\DELL\.codex\skills\docs-style`

Trigger:
- create/edit/review/restructure docs under `/docs/**`
- README/README-vi standardization when the user explicitly asks
- splitting large `SPECS.md`-style docs into numbered docs
- docs screenshots and README preview cleanup
- architecture docs
- bottleneck docs
- system docs
- documentation folder work

Inputs:
- target files under `/docs/**`
- repo facts and existing docs

Outputs:
- rewritten or newly created `/docs/**` files
- compact docs change summary

Notes:
- must not apply to `AGENTS.md`, `CHANGELOG.md`, `.github/**`, `.vscode/**`, or markdown outside `/docs/**` unless explicitly requested
- README is in scope only when the user asks for README/docs standardization
- category: self-authored

### researcher

Runtime:
- Codex + Grok CLI

Purpose:
- Multi-source structured research (>=3 angles) before implementation or when bug stalls.

Path:
- `skills/researcher` → `~/.codex/skills/` / `~/.grok/skills/`

Verify:
- `scripts/validate-harness.sh` (Multi-source contract in SKILL.md)

Trigger:
- research, compare, latest docs, changelog, stall bug, greenfield UI/E2E prep

Notes:
- category: self-authored
- Codex native profile: `researcher`

### context-evolution-protocol

Runtime:
- Codex + Grok CLI + Antigravity adapter

Purpose:
- Trigger-only protocol for promoting feedback into context without overfitting, duplication, or default-load bloat.

Path:
- `skills/context-evolution-protocol` → `~/.codex/skills/` / `.agents/skills/` / `~/.grok/skills/`

Trigger:
- modifying/auditing `AGENTS.md`, `.agents/**`, `.codex/**`, `rules/**`, `skills/**`, `workflows/**`, project context `.md`
- user feedback says the agent misunderstood, repeated a mistake, needs to "ghi nhớ", "bổ sung context", "đưa vào rule", "đừng lặp lại", or "context bị loạn"
- before PASS for context/rule/skill/workflow/harness tasks

Notes:
- category: self-authored
- must not auto-load for ordinary coding tasks

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

### product-ui-craft

Runtime:
- Codex + Grok CLI

Purpose:
- Universal UI/UX — any visual direction (not one preset). Deep intake, multi-source research, 5fedu `/template`, browser verify. Replaces `frontend-ui-quality` and archived taste/image skills.

Path:
- `skills/product-ui-craft` → `~/.codex/skills/` / `~/.grok/skills/`

Trigger:
- UI, frontend, layout, dashboard, landing, greenfield app, redesign, 5fedu FE

### e2e-qa

Runtime:
- Codex + Grok CLI

Purpose:
- Professional E2E: test matrix, permission matrix, cross-module, maximize coverage. Split from `playwright` CLI debug.

Path:
- `skills/e2e-qa`

Trigger:
- e2e, QA, test phân quyền, regression UI, verify production flows

### Archived (not synced)

`frontend-ui-quality`, `ui-ux-pro-max`, image/taste skills → archive only when deliberately moved out of active `skills/`

### caveman / cavecrew / gitnexus-* family

Runtime:
- local agent ecosystem

Purpose:
- compressed communication, compressed delegation, and GitNexus-specific helper workflows

Sources:
- Caveman: https://github.com/JuliusBrussee/caveman
- GitNexus: https://github.com/nxpatterns/gitnexus

Path:
- `C:\Users\DELL\.agents\skills\`
- backup copy: `P:\agent-rules\agents-skills\`

Install/copy:
- copy from `C:\Users\DELL\.agents\skills` to `P:\agent-rules\agents-skills`

Verify:
- inspect corresponding `SKILL.md` files
- `Get-ChildItem C:\Users\DELL\.agents\skills -Directory`

Trigger:
- explicit user requests or system rules that reference those skills

Notes:
- these are local authored skills, but they are not stored inside the main Codex runtime folder
- Caveman is installed and discoverable from `.agents\skills`; it is not a default always-on response mode unless a user or rule triggers it

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
- `C:\Users\DELL\.codex\rules\01-agent-workflow-sop.md`
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
