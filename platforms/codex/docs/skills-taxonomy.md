# Skills Taxonomy

## Purpose

Separate self-authored skills from vendor-installed and system-provided skills without breaking Codex runtime discovery.

## Rule

Do not move runtime skill folders just to make taxonomy look cleaner unless you have verified Codex still discovers nested or relocated paths correctly.

On this machine, taxonomy is tracked by documentation first, not by physically relocating installed vendor skill folders.

## Categories

### System

Location:
- `C:\Users\DELL\.codex\skills\.system`

Examples:
- `imagegen`
- `openai-docs`
- `plugin-creator`
- `skill-creator`
- `skill-installer`

### Self-authored

Primary local Codex location:
- `C:\Users\DELL\.codex\skills`

Current self-authored skills (active sync):
- `5fedu-project`
- `researcher` (multi-source contract)
- `product-ui-craft` (universal UI — replaces frontend-ui-quality / taste / image skills)
- `e2e-qa` (professional E2E — split from playwright CLI)
- `docs-style`
- `workflow-router` (Codex phase; disable on Grok via config)

Archived: inactive skills should stay outside active `skills/` or under a clearly named archive folder that installers exclude.

Separate local agent ecosystem:
- `C:\Users\DELL\.agents\skills`
- backup copy: `P:\agent-rules\agents-skills`

Current self-authored ecosystem examples:
- `caveman*`
- `cavecrew`
- `gitnexus-*`

### Vendor-installed

Current vendor-installed skills left in place for runtime safety:
- `pdf`
- `playwright`
- `playwright` (CLI debug; E2E → `e2e-qa`)
- `screenshot`
- `security-best-practices`
- `security-ownership-map`
- `security-threat-model`

Location:
- `C:\Users\DELL\.codex\skills`

Reason they are not physically moved yet:
- moving them may break auto-discovery unless runtime behavior is verified after relocation

## Future cleanup option

If we later confirm Codex can discover relocated vendor skills or can be taught explicit paths, then we can move vendor-installed skills into a dedicated archive or vendor folder.

Until then:
- document the category
- keep runtime stable
