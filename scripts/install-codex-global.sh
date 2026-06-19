#!/usr/bin/env bash
# Cài harness global Codex CLI từ codex master (rsync --delete — không drift skill cũ)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
RULES_DEST="$CODEX_HOME/rules"
SKILLS_DEST="$CODEX_HOME/skills"

HARNESS_SKIP_GLOBAL_INSTALL=1 "$ROOT/scripts/sync-all-harness.sh" >/dev/null

mkdir -p "$RULES_DEST" "$SKILLS_DEST"
rsync -a --delete "$ROOT/rules/" "$RULES_DEST/"
if [[ -f "$ROOT/platforms/codex/rules/codex-overlay.md" ]]; then
  cp "$ROOT/platforms/codex/rules/codex-overlay.md" "$RULES_DEST/codex-overlay.md"
fi
rsync -a --delete \
  --exclude '_archive' --exclude '_archive/**' \
  --exclude '.system' --exclude '.system/**' \
  "$ROOT/skills/" "$SKILLS_DEST/"
rm -rf "$SKILLS_DEST/_archive" "$SKILLS_DEST/.system" "$SKILLS_DEST/codex-research" 2>/dev/null || true

CODEX_SCRIPTS="$CODEX_HOME/scripts"
CODEX_HOOKS="$CODEX_HOME/hooks"
mkdir -p "$CODEX_SCRIPTS" "$CODEX_HOOKS" "$CODEX_HOME/skill-state/e2e-cache"
install -m 644 "$ROOT/scripts/grok-skill-gate.py" "$CODEX_SCRIPTS/skill-gate.py"
install -m 755 "$ROOT/scripts/grok-skill-gate.sh" "$CODEX_SCRIPTS/skill-gate.sh"
sed "s|\${CODEX_HOME}|$CODEX_HOME|g" "$ROOT/platforms/codex/hooks/skill-orchestrator.json" > "$CODEX_HOOKS/skill-orchestrator.json"

USER_SKILLS=$(find "$SKILLS_DEST" -name SKILL.md ! -path '*/.system/*' | wc -l)
echo "Installed global Codex mirror (from codex master):"
echo "  rules:  $RULES_DEST ($(find "$RULES_DEST" -maxdepth 1 -name '*.md' | wc -l) files)"
echo "  skills: $SKILLS_DEST ($USER_SKILLS user skills)"
echo "  hooks:   $CODEX_HOOKS/skill-orchestrator.json (frontier parity with Grok)"
echo "  scripts: $CODEX_SCRIPTS/skill-gate.py"
echo ""
echo "Pair with: scripts/install-grok-global.sh for full global runtime"