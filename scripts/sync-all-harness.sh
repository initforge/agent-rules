#!/usr/bin/env bash
# Sync harness: codex master → Antigravity, .agents live, .grok live (Grok = mirror, không master riêng)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_RULES="$ROOT/codex/rules"
CODEX_SKILLS="$ROOT/codex/skills"
ANT_AGENTS="$ROOT/antigravity/.agents"
LIVE_AGENTS="$ROOT/.agents"
# Grok live: chỉ global (~/.grok/) qua install-grok-global.sh — không mirror .grok/ trong repo (tránh duplicate 37 instructions)

SKIP_ANTIGRAVITY=("00-codex-runtime-intent.md" "default.rules")

should_skip_antigravity() {
  local name="$1"
  for s in "${SKIP_ANTIGRAVITY[@]}"; do
    [[ "$name" == "$s" ]] && return 0
  done
  return 1
}

mkdir -p "$ANT_AGENTS/rules" "$ANT_AGENTS/skills" "$LIVE_AGENTS/rules" "$LIVE_AGENTS/skills"

# --- Skills: codex → Antigravity live (exclude _archive, .system optional on project sync) ---
SKILL_RSYNC_EX=(--exclude '_archive' --exclude '_archive/**')
for dest in "$ANT_AGENTS/skills" "$LIVE_AGENTS/skills"; do
  rsync -a --delete "${SKILL_RSYNC_EX[@]}" "$CODEX_SKILLS/" "$dest/"
  rm -rf "$dest/_archive" 2>/dev/null || true
done

# Dọn mirror .grok cũ trong repo harness (gây duplicate với global)
rm -rf "$ROOT/.grok"

# --- Rules: codex → antigravity (bỏ file chỉ dành Codex) ---
find "$ANT_AGENTS/rules" -maxdepth 1 -type f -name '*.md' -delete 2>/dev/null || true
for f in "$CODEX_RULES"/*.md; do
  base="$(basename "$f")"
  should_skip_antigravity "$base" && continue
  cp "$f" "$ANT_AGENTS/rules/$base"
done

# Frontmatter cho Antigravity (adapter — không đổi body rule)
FM_SCRIPT="$ROOT/antigravity/scripts/add-rules-frontmatter.ps1"
if [[ -f "$FM_SCRIPT" ]]; then
  if command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -File "$FM_SCRIPT" -RulesDir "$ANT_AGENTS/rules"
  elif command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -File "$FM_SCRIPT" -RulesDir "$ANT_AGENTS/rules"
  else
    echo "[WARN] PowerShell not found — Antigravity rules copied without frontmatter refresh"
  fi
fi

# --- Workflows: antigravity master → .agents live (active only) ---
mkdir -p "$ANT_AGENTS/workflows" "$LIVE_AGENTS/workflows"
rsync -a --delete "$ANT_AGENTS/workflows/" "$LIVE_AGENTS/workflows/"

# --- Antigravity master → .agents live ---
rsync -a --delete "$ANT_AGENTS/rules/" "$LIVE_AGENTS/rules/"
rsync -a --delete "$ANT_AGENTS/skills/" "$LIVE_AGENTS/skills/"

RULES_CODEX=$(find "$CODEX_RULES" -maxdepth 1 -name '*.md' | wc -l)
RULES_AG=$(find "$LIVE_AGENTS/rules" -maxdepth 1 -name '*.md' | wc -l)
SKILLS_CODEX=$(find "$CODEX_SKILLS" -name SKILL.md ! -path '*/_archive/*' ! -path '*/.system/*' | wc -l)

echo "Harness sync (codex master):"
echo "  codex/rules:        $RULES_CODEX"
echo "  antigravity/rules:  $(find "$ANT_AGENTS/rules" -maxdepth 1 -name '*.md' | wc -l)"
echo "  .agents/rules:      $RULES_AG"
echo "  .grok/ in repo:     removed (use install-grok-global.sh)"
echo "  skills (each dest): $SKILLS_CODEX (+ .system not counted)"
echo "  workflows:          $(find "$LIVE_AGENTS/workflows" -maxdepth 1 -name '*.md' | wc -l)"
echo "Done. Run: scripts/validate-harness.sh"
if [[ "${HARNESS_SKIP_GLOBAL_INSTALL:-}" != "1" ]]; then
  echo ""
  echo "== Auto-install global runtime (Codex + Grok) =="
  HARNESS_SKIP_GLOBAL_INSTALL=1 "$ROOT/scripts/install-global-harness.sh"
fi