---
name: "playwright"
description: Playwright CLI debug only. ULTRA-SENSITIVE Turn-0 — activate on snapshot, playwright-cli, debug UI nhanh, mở browser, trace, investigate 1 màn — NOT full e2e suite (use e2e-qa). Read SKILL.md before CLI. Visible Echo required.
---

# Playwright CLI (exploratory only)

## Skill activation (cực nhạy — Turn-0)

Quick debug/snapshot → `Skill scan: … → playwright` + `Skill activated: playwright` visible → đọc file này. Suite/matrix/full suite → **redirect** `e2e-qa` + `Skill redirect: playwright → e2e-qa — writing/running suite`.

Drive browser via `playwright-cli`. **E2E test suite / tester chuyên nghiệp → skill `e2e-qa`.**

## Paths (Codex + Grok)

```bash
export AGENT_SKILLS_HOME="${AGENT_SKILLS_HOME:-${CODEX_HOME:-$HOME/.grok}/skills}"
export PWCLI="$AGENT_SKILLS_HOME/playwright/scripts/playwright_cli.sh"
```

Grok: `AGENT_SKILLS_HOME=$HOME/.grok/skills` · Codex: `$HOME/.codex/skills`

## Prerequisite

```bash
command -v npx >/dev/null 2>&1 || { echo "Need Node/npx"; exit 1; }
```

## Quick loop

```bash
"$PWCLI" open https://example.com --headed
"$PWCLI" snapshot
"$PWCLI" click e3
"$PWCLI" screenshot
```

Re-snapshot after navigation/modal/tab change.

## When to escalate → `e2e-qa`

User nói: e2e, test đầy đủ, phân quyền, cross-module, regression, QA, test production → **stop CLI-only** · read `e2e-qa/SKILL.md`.

## References

- `references/cli.md`
- `references/workflows.md`

## Artifacts

Use `output/playwright/` in repo when saving screenshots/traces.