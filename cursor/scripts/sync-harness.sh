#!/usr/bin/env bash
# Sync full Grok harness: rules + skills (master cursor/ → live .grok/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RULES_MASTER="$ROOT/cursor/rules"
SKILLS_MASTER="$ROOT/cursor/skills"
GROK_RULES="$ROOT/.grok/rules"
GROK_SKILLS="$ROOT/.grok/skills"
CURSOR_RULES="$ROOT/.cursor/rules"

if [[ ! -d "$SKILLS_MASTER" ]]; then
  echo "ERROR: $SKILLS_MASTER missing. Run: cp -r codex/skills cursor/skills"
  exit 1
fi

mkdir -p "$GROK_RULES" "$GROK_SKILLS" "$CURSOR_RULES"

cp "$RULES_MASTER"/*.md "$GROK_RULES/"
cp "$RULES_MASTER"/*.md "$CURSOR_RULES/"
rsync -a --delete "$SKILLS_MASTER/" "$GROK_SKILLS/"

RULE_COUNT=$(ls -1 "$RULES_MASTER"/*.md | wc -l)
SKILL_COUNT=$(find "$SKILLS_MASTER" -name 'SKILL.md' | wc -l)

echo "Harness synced:"
echo "  Rules: $RULE_COUNT → $GROK_RULES (+ .cursor/rules compat)"
echo "  Skills: $SKILL_COUNT SKILL.md → $GROK_SKILLS"
# Keep Antigravity live in sync when 06 changes (repo-local)
AG_RULE="$ROOT/antigravity/.agents/rules/06-opus-emulation-contract.md"
if [[ -f "$AG_RULE" ]]; then
  cp "$AG_RULE" "$ROOT/.agents/rules/06-opus-emulation-contract.md"
fi

echo "Verify: grok inspect"