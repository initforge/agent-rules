# Skill Routing and Governance Report

## Architecture
- Single Source of Truth: skills/<name>/SKILL.md.
- Catalog Generation: skills/catalog.json and candidate fabrics are strictly generated artifacts.
- Resolver Execution: SkillResolver evaluates triggers once per task execution, without redundant iterations.
- Explicit Boundaries: Domain packs (5fedu) and sensitive tools (Pencil, Trail of Bits) require explicit operator invocation and are never auto-routed via loose keywords.
