#!/usr/bin/env bash
# Fail nếu codex master lệch mirror hoặc behaviors/skill contract thiếu
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_RULES="$ROOT/codex/rules"
CODEX_SKILLS="$ROOT/codex/skills"
ANT_RULES="$ROOT/antigravity/.agents/rules"
LIVE_AGENTS_RULES="$ROOT/.agents/rules"
GROK_SKILLS="${GROK_HOME:-$HOME/.grok}/skills"
ARCHIVE="$CODEX_SKILLS/_archive"

fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { echo "OK: $1"; }

echo "== Validate harness (codex master) =="

[[ -d "$CODEX_RULES" ]] || fail "missing codex/rules"
[[ -d "$CODEX_SKILLS" ]] || fail "missing codex/skills"
[[ ! -d "$ROOT/.grok" ]] || fail ".grok/ still in repo — run sync-all-harness.sh (removes duplicate Grok mirror)"

USER_SKILL_COUNT=$(find "$CODEX_SKILLS" -name SKILL.md ! -path '*/_archive/*' ! -path '*/.system/*' | wc -l)
[[ "$USER_SKILL_COUNT" -eq 12 ]] || fail "expected 12 user skills, got $USER_SKILL_COUNT"

for dest in "$ANT_RULES" "$LIVE_AGENTS_RULES"; do
  [[ -d "$dest" ]] || fail "missing $dest"
  for f in "$CODEX_RULES"/*.md; do
    base="$(basename "$f")"
    [[ "$base" == "00-codex-runtime-intent.md" || "$base" == "default.rules" ]] && continue
    [[ -f "$dest/$base" ]] || fail "missing $base in $dest"
  done
done

for skills_dest in "$ROOT/antigravity/.agents/skills" "$ROOT/.agents/skills"; do
  [[ -d "$skills_dest" ]] || fail "missing $skills_dest"
  [[ -d "$skills_dest/_archive" ]] && fail "_archive leaked to $skills_dest"
  for s in product-ui-craft e2e-qa; do
    [[ -f "$skills_dest/$s/SKILL.md" ]] || fail "missing active skill $s in $skills_dest"
  done
  for s in taste-skill imagegen-frontend-web frontend-ui-quality; do
    [[ ! -d "$skills_dest/$s" ]] || fail "archived skill $s still in $skills_dest"
  done
done

# Behavior contracts in rules
grep -q 'Skill Activation Gate' "$CODEX_RULES/00-hard-activation-contract.md" || fail "missing Skill Activation Gate in 00-hard-activation"
grep -q 'Turn-0 Skill Scan' "$CODEX_RULES/00-hard-activation-contract.md" || fail "missing Turn-0 Skill Scan (ultra-sensitive)"
grep -q 'Turn-0 Skill Scan' "$CODEX_RULES/10-fast-context.md" || fail "missing Turn-0 in 10-fast-context"
grep -q 'Visible Echo Contract' "$CODEX_RULES/00-hard-activation-contract.md" || fail "missing Visible Echo Contract"
grep -q 'Skill Scope Redirect' "$CODEX_RULES/00-hard-activation-contract.md" || fail "missing Skill Scope Redirect"
grep -q 'Multi-Skill Stack' "$CODEX_RULES/00-hard-activation-contract.md" || fail "missing Multi-Skill Stack"
[[ -f "$ROOT/scripts/grok-skill-gate.py" ]] || fail "missing grok-skill-gate.py"
[[ -f "$ROOT/grok/hooks/skill-orchestrator.json" ]] || fail "missing grok/hooks/skill-orchestrator.json"
grep -q 'Primary (this step)' "$CODEX_RULES/10-fast-context.md" || fail "missing multi-skill primary in 10-fast-context"
grep -q 'Scope redirect' "$CODEX_SKILLS/e2e-qa/SKILL.md" || fail "e2e-qa missing scope redirect"
for skill_md in "$CODEX_SKILLS"/*/SKILL.md; do
  [[ "$skill_md" == *"/_archive/"* ]] && continue
  base=$(basename "$(dirname "$skill_md")")
  grep -q 'ULTRA-SENSITIVE' "$skill_md" || fail "$base missing ULTRA-SENSITIVE"
  grep -q 'Skill activation' "$skill_md" || fail "$base missing Skill activation section"
  grep -q 'Skill scan:' "$skill_md" || fail "$base missing Skill scan echo in activation"
done
grep -q 'Deep Comprehension' "$CODEX_RULES/00-hard-activation-contract.md" || fail "missing Deep Comprehension"
grep -q 'product-ui-craft' "$CODEX_RULES/10-fast-context.md" || fail "missing product-ui-craft in 10-fast-context"
grep -q 'e2e-qa' "$CODEX_RULES/10-fast-context.md" || fail "missing e2e-qa in 10-fast-context"

# researcher multi-source
grep -q 'Multi-source contract' "$CODEX_SKILLS/researcher/SKILL.md" || fail "researcher missing multi-source contract"
grep -q 'Anti-stuck loop' "$CODEX_SKILLS/e2e-qa/SKILL.md" || fail "e2e-qa missing anti-stuck loop contract"
grep -q 'Execution ladder' "$CODEX_SKILLS/e2e-qa/SKILL.md" || fail "e2e-qa missing execution ladder"
grep -q 'blast radius' "$CODEX_SKILLS/e2e-qa/SKILL.md" || fail "e2e-qa missing blast radius harness"
grep -q 'completeness-harness.md' "$CODEX_SKILLS/e2e-qa/SKILL.md" || fail "e2e-qa missing completeness-harness reference"
[[ -f "$CODEX_SKILLS/e2e-qa/references/completeness-harness.md" ]] || fail "missing e2e-qa/references/completeness-harness.md"
grep -q 'Unknown scope is not L1' "$CODEX_SKILLS/e2e-qa/references/completeness-harness.md" || fail "completeness-harness missing unknown-scope rule"
grep -q 'Done only when' "$CODEX_SKILLS/e2e-qa/references/completeness-harness.md" || fail "completeness-harness missing done definition"
grep -q 'Anti-Fake-PASS' "$CODEX_RULES/00-hard-activation-contract.md" || fail "missing Anti-Fake-PASS gate"
[[ -f "$CODEX_RULES/00-universal-frontier-contract.md" ]] || fail "missing 00-universal-frontier-contract.md"
grep -q 'Platform-Native Enforcement' "$CODEX_RULES/00-hard-activation-contract.md" || fail "missing Platform-Native Enforcement section"
[[ -f "$ROOT/codex/hooks/skill-orchestrator.json" ]] || fail "missing codex/hooks/skill-orchestrator.json"
grep -q 'Platform Native Harness' "$CODEX_RULES/platform-boundary.md" || fail "platform-boundary not updated for universal frontier"
[[ ! -d "$CODEX_SKILLS/codex-research" ]] || fail "legacy codex-research folder still exists"

WF_COUNT=$(find "$ROOT/antigravity/.agents/workflows" -maxdepth 1 -name '*.md' | wc -l)
[[ "$WF_COUNT" -eq 13 ]] || fail "expected 13 active workflows, got $WF_COUNT"
for stale in brandkit stitch-skill taste-skill codex-research; do
  [[ ! -f "$ROOT/.agents/workflows/${stale}.md" ]] || fail "stale workflow $stale still in .agents"
done
[[ -f "$ROOT/scripts/install-codex-global.sh" ]] || fail "missing install-codex-global.sh"
[[ -f "$ROOT/scripts/install-global-harness.sh" ]] || fail "missing install-global-harness.sh"
[[ -f "$ROOT/codex/docs/harness-risk-register.md" ]] || fail "missing harness-risk-register.md"
[[ -f "$ROOT/codex/docs/researcher-workflow.md" ]] || fail "missing researcher-workflow.md"
[[ ! -f "$ROOT/codex/docs/codex-research-workflow.md" ]] || fail "legacy codex-research-workflow.md still exists"
[[ -x "$ROOT/scripts/antigravity-preflight.sh" ]] || fail "missing executable scripts/antigravity-preflight.sh"

# Archive intact
for s in imagegen-frontend-web taste-skill frontend-ui-quality ui-ux-pro-max; do
  [[ -d "$ARCHIVE/$s" ]] || fail "archive missing $s"
done

# Global Grok (if installed)
if [[ -d "$GROK_SKILLS" ]]; then
  [[ -f "$GROK_SKILLS/product-ui-craft/SKILL.md" ]] || fail "global ~/.grok/skills missing product-ui-craft — run install-grok-global.sh"
  [[ ! -d "$GROK_SKILLS/taste-skill" ]] || fail "global still has taste-skill"
  ok "global ~/.grok/skills aligned"
else
  echo "WARN: ~/.grok/skills not installed — run install-grok-global.sh"
fi

if [[ -d "${GROK_HOME:-$HOME/.grok}/.grok/rules" ]]; then
  ok "global ~/.grok/.grok/rules present"
else
  echo "WARN: global Grok rules missing — run install-grok-global.sh"
fi

ok "codex master ($USER_SKILL_COUNT user skills, behaviors in rules)"
echo ""
echo "Harness validation: PASS"