#!/usr/bin/env bash
# Cài harness global Grok CLI từ codex master (mirror — không grok/ riêng)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GROK_HOME="${GROK_HOME:-$HOME/.grok}"
RULES_DEST="$GROK_HOME/.grok/rules"
SKILLS_DEST="$GROK_HOME/skills"

HARNESS_SKIP_GLOBAL_INSTALL=1 "$ROOT/scripts/sync-all-harness.sh" >/dev/null

mkdir -p "$RULES_DEST" "$SKILLS_DEST"
rsync -a --delete "$ROOT/rules/" "$RULES_DEST/"
if [[ -f "$ROOT/platforms/grok/rules/grok-overlay.md" ]]; then
  cp "$ROOT/platforms/grok/rules/grok-overlay.md" "$RULES_DEST/grok-overlay.md"
fi
rsync -a --delete \
  --exclude '_archive' --exclude '_archive/**' \
  --exclude '.system' --exclude '.system/**' \
  "$ROOT/skills/" "$SKILLS_DEST/"
rm -rf "$SKILLS_DEST/_archive" "$SKILLS_DEST/.system" "$SKILLS_DEST/codex-research" 2>/dev/null || true

HOOKS_DEST="$GROK_HOME/hooks"
HOOKS_BIN="$HOOKS_DEST/bin"
mkdir -p "$HOOKS_BIN"
install -m 755 "$ROOT/scripts/grok-skill-gate.sh" "$HOOKS_BIN/grok-skill-gate.sh"
install -m 644 "$ROOT/scripts/grok-skill-gate.py" "$HOOKS_BIN/grok-skill-gate.py"
sed "s|\${GROK_HOME}|$GROK_HOME|g" "$ROOT/platforms/grok/hooks/skill-orchestrator.json" > "$HOOKS_DEST/skill-orchestrator.json"
mkdir -p "$GROK_HOME/skill-state" "$GROK_HOME/skill-state/e2e-cache"
"$ROOT/scripts/grok-hook-healthcheck.sh" || echo "WARN: hook healthcheck failed — hooks may be fail-open"

USER_SKILLS=$(find "$SKILLS_DEST" -name SKILL.md ! -path '*/.system/*' | wc -l)
echo "Installed global Grok mirror (from codex master):"
echo "  rules:  $RULES_DEST ($(find "$RULES_DEST" -maxdepth 1 -name '*.md' | wc -l) files)"
echo "  skills: $SKILLS_DEST ($USER_SKILLS user skills, .system excluded)"
echo "  hooks:  $HOOKS_DEST/skill-orchestrator.json (advisory anti-stuck + skill state)"
echo "  note:   workflow-router is Codex-oriented — prefer /implement on Grok"
echo ""
echo "Codex mirror: run scripts/install-codex-global.sh (or install-global-harness.sh for both)"
echo "Next: NEW Grok session → /hooks (reload r) → test ladder with test-grok-skill-gate.sh"
