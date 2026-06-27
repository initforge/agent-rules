#!/usr/bin/env bash
# Fail nếu codex master lệch mirror hoặc behaviors/skill contract thiếu
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_RULES="$ROOT/rules"
CODEX_SKILLS="$ROOT/skills"
ANT_RULES="$ROOT/platforms/antigravity/.agents/rules"
LIVE_AGENTS_RULES="$ROOT/.agents/rules"
GROK_SKILLS="${GROK_HOME:-$HOME/.grok}/skills"
ARCHIVE="$CODEX_SKILLS/_archive"

fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { echo "OK: $1"; }

echo "== Validate harness (codex master) =="

[[ -d "$CODEX_RULES" ]] || fail "missing rules"
[[ -d "$CODEX_SKILLS" ]] || fail "missing skills"
[[ ! -d "$ROOT/.grok" ]] || fail ".grok/ still in repo — run sync-all-harness.sh (removes duplicate Grok mirror)"

USER_SKILL_COUNT=$(find "$CODEX_SKILLS" -name SKILL.md ! -path '*/_archive/*' ! -path '*/.system/*' | wc -l)
[[ "$USER_SKILL_COUNT" -eq 35 ]] || fail "expected 35 user skills, got $USER_SKILL_COUNT"

for dest in "$ANT_RULES" "$LIVE_AGENTS_RULES"; do
  [[ -d "$dest" ]] || fail "missing $dest"
  for f in "$CODEX_RULES"/*.md; do
    base="$(basename "$f")"
    [[ "$base" == "00-codex-runtime-intent.md" || "$base" == "default.rules" || "$base" == "codex-overlay.md" ]] && continue
    [[ -f "$dest/$base" ]] || fail "missing $base in $dest"
  done
done

for skills_dest in "$ROOT/platforms/antigravity/.agents/skills" "$ROOT/.agents/skills"; do
  [[ -d "$skills_dest" ]] || fail "missing $skills_dest"
  [[ -d "$skills_dest/_archive" ]] && fail "_archive leaked to $skills_dest"
  for s in ui-ux-pro-max check-work finish-to-completion; do
    [[ -f "$skills_dest/$s/SKILL.md" ]] || fail "missing active skill $s in $skills_dest"
  done
done

# Behavior contracts in rules
  grep -q 'Turn-0 Skill Scan' "$CODEX_RULES/00-universal-frontier-contract.md" || fail "missing Turn-0 Skill Scan in universal frontier"
  grep -q 'Multi-Skill Stack' "$CODEX_RULES/00-universal-frontier-contract.md" || fail "missing Multi-Skill Stack in universal frontier"
  [[ -f "$ROOT/scripts/grok-skill-gate.py" ]] || fail "missing grok-skill-gate.py"
  [[ -f "$ROOT/platforms/grok/hooks/skill-orchestrator.json" ]] || fail "missing grok/hooks/skill-orchestrator.json"
  for base in finish-to-completion 5fedu-project best-of-n; do
    skill_md="$CODEX_SKILLS/$base/SKILL.md"
    [[ -f "$skill_md" ]] || fail "missing core skill $base"
    grep -q 'ULTRA-SENSITIVE' "$skill_md" || fail "$base missing ULTRA-SENSITIVE"
    grep -q 'Skill activation' "$skill_md" || fail "$base missing Skill activation section"
    grep -q 'Skill scan:' "$skill_md" || fail "$base missing Skill scan echo in activation"
  done
[[ -f "$CODEX_SKILLS/context-evolution-protocol/SKILL.md" ]] || fail "missing context-evolution-protocol skill"
grep -q 'Trigger-only' "$CODEX_SKILLS/context-evolution-protocol/SKILL.md" || fail "context-evolution-protocol missing trigger-only contract"
[[ -f "$CODEX_RULES/07-finish-to-completion.md" ]] || fail "missing 07-finish-to-completion.md"
grep -q 'Iron Law' "$CODEX_RULES/07-finish-to-completion.md" || fail "07-finish-to-completion missing Iron Law"
grep -q 'GAP còn lại' "$CODEX_RULES/07-finish-to-completion.md" || fail "07-finish-to-completion missing banned GAP pattern"
grep -q 'Scope Lock' "$CODEX_RULES/07-finish-to-completion.md" || fail "07-finish-to-completion missing Scope Lock"
[[ -f "$CODEX_SKILLS/finish-to-completion/SKILL.md" ]] || fail "missing finish-to-completion skill"
grep -q 'ULTRA-SENSITIVE' "$CODEX_SKILLS/finish-to-completion/SKILL.md" || fail "finish-to-completion missing ULTRA-SENSITIVE"
grep -q 'Anti-Fake-PASS' "$CODEX_RULES/00-universal-frontier-contract.md" || fail "missing Anti-Fake-PASS gate"
[[ -f "$CODEX_RULES/00-universal-frontier-contract.md" ]] || fail "missing 00-universal-frontier-contract.md"
grep -q 'Native Harness' "$CODEX_RULES/00-universal-frontier-contract.md" || fail "missing Native Harness section"
grep -q 'Intent Fidelity Gate' "$CODEX_RULES/01-agent-workflow-sop.md" || fail "01-agent-workflow-sop missing Intent Fidelity Gate"
grep -q 'Long Prompt Compiler Gate' "$CODEX_RULES/01-agent-workflow-sop.md" || fail "01-agent-workflow-sop missing Long Prompt Compiler Gate"
grep -q 'Locked Plan Acceptance Gate' "$CODEX_RULES/01-agent-workflow-sop.md" || fail "01-agent-workflow-sop missing Locked Plan Acceptance Gate"
grep -q 'No Unverified Interface/Schema Gate' "$CODEX_RULES/01-agent-workflow-sop.md" || fail "01-agent-workflow-sop missing No Unverified Interface/Schema Gate"
grep -q 'Evidence-backed Claim Gate' "$CODEX_RULES/01-agent-workflow-sop.md" || fail "01-agent-workflow-sop missing Evidence-backed Claim Gate"
grep -q '95% First-Pass Quality Gate' "$CODEX_RULES/01-agent-workflow-sop.md" || fail "01-agent-workflow-sop missing 95% First-Pass Quality Gate"
grep -q 'Browser Verification Gate' "$CODEX_RULES/01-agent-workflow-sop.md" || fail "01-agent-workflow-sop missing Browser Verification Gate"
grep -q 'Không plan ảo' "$CODEX_RULES/06-opus-emulation-contract.md" || fail "06-opus-emulation-contract missing anti fake-plan rule"
grep -q 'Prompt dài phải được biên dịch' "$CODEX_RULES/06-opus-emulation-contract.md" || fail "06-opus-emulation-contract missing long prompt compiler rule"
grep -q 'Antigravity Plan Quality Lock' "$ROOT/platforms/antigravity/.agents/rules/antigravity-overlay.md" || fail "antigravity overlay missing Plan Quality Lock"
grep -q '/browser' "$ROOT/platforms/antigravity/.agents/rules/antigravity-overlay.md" || fail "antigravity overlay missing /browser hard gate"
grep -q 'PLAN NOT LOCKED' "$ROOT/platforms/grok/AGENTS.md" || fail "grok entrypoint missing PLAN NOT LOCKED gate"
grep -q 'PLAN NOT LOCKED' "$ROOT/platforms/codex/rules/codex-overlay.md" || fail "codex overlay missing PLAN NOT LOCKED gate"
grep -q 'PLAN NOT LOCKED' "$ROOT/platforms/antigravity/GEMINI.md" || fail "antigravity GEMINI.md missing PLAN NOT LOCKED gate"
[[ -f "$ROOT/platforms/codex/hooks/skill-orchestrator.json" ]] || fail "missing codex/hooks/skill-orchestrator.json"
grep -q 'harness đồng bộ' "$CODEX_RULES/platform-boundary.md" || fail "platform-boundary not updated for universal frontier"

WF_COUNT=$(find "$ROOT/platforms/antigravity/.agents/workflows" -maxdepth 1 -name '*.md' | wc -l)
[[ "$WF_COUNT" -eq 14 ]] || fail "expected 14 active workflows, got $WF_COUNT"
for stale in brandkit stitch-skill taste-skill codex-research; do
  [[ ! -f "$ROOT/.agents/workflows/${stale}.md" ]] || fail "stale workflow $stale still in .agents"
done
[[ -f "$ROOT/scripts/install-codex-global.sh" ]] || fail "missing install-codex-global.sh"
[[ -f "$ROOT/scripts/install-global-harness.sh" ]] || fail "missing install-global-harness.sh"
[[ -f "$ROOT/platforms/codex/docs/harness-risk-register.md" ]] || fail "missing harness-risk-register.md"
[[ -f "$ROOT/platforms/codex/docs/researcher-workflow.md" ]] || fail "missing researcher-workflow.md"
[[ ! -f "$ROOT/platforms/codex/docs/codex-research-workflow.md" ]] || fail "legacy codex-research-workflow.md still exists"
[[ -x "$ROOT/scripts/antigravity-preflight.sh" ]] || fail "missing executable scripts/antigravity-preflight.sh"

# Active skills verification (no archive folder check as archive was cleaned up)

# Global Grok (if installed)
if [[ -d "$GROK_SKILLS" ]]; then
  [[ -f "$GROK_SKILLS/ui-ux-pro-max/SKILL.md" ]] || fail "global ~/.grok/skills missing ui-ux-pro-max — run install-grok-global.sh"
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
