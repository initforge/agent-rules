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

Current self-authored skills:
- `docs-style`
- `frontend-ui-quality`
- `ui-ux-pro-max`
- `codex-research`
- `workflow-router`

Separate local agent ecosystem:
- `C:\Users\DELL\.agents\skills`

Current self-authored ecosystem examples:
- `caveman*`
- `cavecrew`
- `gitnexus-*`

### Vendor-installed

Current vendor-installed skills left in place for runtime safety:
- `pdf`
- `playwright`
- `playwright-interactive`
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
