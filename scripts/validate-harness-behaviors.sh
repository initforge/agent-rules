#!/usr/bin/env bash
# Smoke test hành vi harness — không thay browser test model, chỉ verify artifact + grok inspect
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "BEHAVIOR FAIL: $1" >&2; FAILED=1; }
ok() { echo "BEHAVIOR OK: $1"; }
FAILED=0

echo "== Behavior smoke tests =="

"$ROOT/scripts/validate-harness.sh" || exit 1

# Ultra-sensitive activation in global Grok rules (if installed)
GROK_RULES="${GROK_HOME:-$HOME/.grok}/.grok/rules/00-universal-frontier-contract.md"
if [[ -f "$GROK_RULES" ]]; then
  grep -q 'Turn-0 Skill Scan' "$GROK_RULES" || fail "global Grok rules missing Turn-0 — run install-grok-global.sh"
  grep -q 'Visible Echo' "$GROK_RULES" || fail "global Grok rules missing Visible Echo — run install-grok-global.sh"
  ok "global Grok rules have Turn-0 + Visible Echo"
  for skill in finish-to-completion 5fedu-project best-of-n; do
    [[ -f "${GROK_HOME:-$HOME/.grok}/skills/$skill/SKILL.md" ]] || fail "global missing skill $skill"
    grep -q 'ULTRA-SENSITIVE' "${GROK_HOME:-$HOME/.grok}/skills/$skill/SKILL.md" || fail "global $skill missing ULTRA-SENSITIVE"
  done
  ok "global Grok sample skills ULTRA-SENSITIVE"
  HOOK_JSON="${GROK_HOME:-$HOME/.grok}/hooks/skill-orchestrator.json"
  HOOK_BIN="${GROK_HOME:-$HOME/.grok}/hooks/bin/grok-skill-gate.py"
  [[ -f "$HOOK_JSON" ]] || fail "global Grok hook missing — run install-grok-global.sh"
  [[ -f "$HOOK_BIN" ]] || fail "global grok-skill-gate.py missing — run install-grok-global.sh"
  ok "global Grok skill orchestrator hook installed"
  "$ROOT/scripts/test-grok-skill-gate.sh" || fail "grok-skill-gate unit tests"
  ok "grok-skill-gate unit tests pass"
fi

# Stale refs in active tree (exclude _archive, README)
STALE=$(grep -rE 'taste-skill|stitch-skill' \
  rules \
  $(find skills -maxdepth 2 -name '*.md' ! -path '*/_archive/*' 2>/dev/null) 2>/dev/null \
  | grep -v 'README.md' || true)
if [[ -n "$STALE" ]]; then
  echo "$STALE"
  fail "stale skill names in active codex paths"
else
  ok "no stale skill refs in active codex rules/skills"
fi

# grok inspect from /tmp — count global rules (not 37 duplicate)
if command -v grok >/dev/null 2>&1; then
  INSPECT=$(cd /tmp && grok inspect 2>/dev/null || true)
  GLOBAL_RULES=$(echo "$INSPECT" | grep -c '(global,' || true)
  PROJECT_DUP=$(echo "$INSPECT" | grep -c 'Projects/agent-rules/.grok/rules' || true)
  HAS_CRAFT=$(echo "$INSPECT" | grep -c 'frontend-ui-quality' || true)
  HAS_TASTE=$(echo "$INSPECT" | grep -c 'taste-skill' || true)

  if [[ "$PROJECT_DUP" -gt 0 ]]; then
    fail "grok inspect still loads repo .grok/rules duplicate ($PROJECT_DUP) — remove .grok/ and new session"
  else
    ok "no repo .grok/rules duplicate in inspect"
  fi

  if [[ "$GLOBAL_RULES" -lt 10 ]]; then
    fail "grok inspect global rules too few ($GLOBAL_RULES) — run install-grok-global.sh"
  else
    ok "grok inspect global rules: $GLOBAL_RULES"
  fi

  if [[ "$HAS_CRAFT" -lt 1 ]]; then
    fail "grok inspect missing frontend-ui-quality skill"
  else
    ok "grok inspect lists frontend-ui-quality"
  fi

  if [[ "$HAS_TASTE" -gt 0 ]]; then
    fail "grok inspect still lists taste-skill"
  else
    ok "grok inspect no taste-skill"
  fi
else
  echo "WARN: grok CLI not in PATH — skip inspect tests"
  FAILED=1
fi

echo ""
if [[ "$FAILED" -eq 0 ]]; then
  echo "Behavior validation: PASS"
  exit 0
else
  echo "Behavior validation: PARTIAL (see failures above)"
  exit 1
fi