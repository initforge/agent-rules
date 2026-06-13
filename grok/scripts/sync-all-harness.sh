#!/usr/bin/env bash
# Sync Opus-emulation harness: grok master → .grok, codex, antigravity (rules + skills)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GROK_RULES="$ROOT/grok/rules"
GROK_SKILLS="$ROOT/grok/skills"
PLAT="$GROK_RULES/platforms"

CORE=(
  00-runtime-and-intent.md
  01-agent-workflow-sop.md
  02-code-quality-and-debt.md
  03-context-and-tools.md
  04-skills-and-5fedu.md
  05-harness-mutation-gate.md
  06-opus-emulation-contract.md
  platform-boundary.md
)

LEGACY=(
  00-antigravity-runtime-intent.md
  00-codex-runtime-intent.md
  00-hard-activation-contract.md
  01-intent-contract.md
  10-fast-context.md
  planning.md
  execution.md
  core.md
  context-tools.md
  tool-inventory.md
  prompt-intent-router.md
  quality-gates.md
  root-cause-verification.md
  deep-reasoning.md
  clean-code.md
  technical-debt-control.md
  default.rules
)

add_always_apply() {
  local f="$1"
  if grep -q 'alwaysApply:' "$f" 2>/dev/null; then return; fi
  if head -1 "$f" | grep -q '^---'; then
    sed -i '1a alwaysApply: true' "$f"
  else
    printf '%s\n' '---' 'alwaysApply: true' '---' | cat - "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
  fi
}

pick_rule() {
  local platform="$1" name="$2"
  local variant="$PLAT/$platform/$name"
  if [[ -f "$variant" ]]; then echo "$variant"; else echo "$GROK_RULES/$name"; fi
}

remove_legacy() {
  local dir="$1"
  local mode="${2:-antigravity}"
  for f in "${LEGACY[@]}"; do rm -f "$dir/$f"; done
  if [[ "$mode" == "antigravity" ]]; then
    rm -f "$dir/codex-overlay.md"
  fi
}

# --- Grok CLI live ---
mkdir -p "$ROOT/.grok/rules" "$ROOT/.grok/skills"
cp "$GROK_RULES"/*.md "$ROOT/.grok/rules/"
rsync -a --delete "$GROK_SKILLS/" "$ROOT/.grok/skills/"
echo "Grok live: $(ls -1 "$ROOT/.grok/rules"/*.md | wc -l) rules, $(find "$GROK_SKILLS" -name SKILL.md | wc -l) skills"

# --- Codex rules + skills ---
mkdir -p "$ROOT/codex/rules" "$ROOT/codex/skills"
for name in "${CORE[@]}"; do
  cp "$(pick_rule codex "$name")" "$ROOT/codex/rules/$name"
done
cp "$PLAT/codex/codex-overlay.md" "$ROOT/codex/rules/codex-overlay.md"
remove_legacy "$ROOT/codex/rules" codex
rsync -a --delete "$GROK_SKILLS/" "$ROOT/codex/skills/"
echo "Codex: $(ls -1 "$ROOT/codex/rules"/*.md | wc -l) rules, $(find "$ROOT/codex/skills" -name SKILL.md | wc -l) skills"

# --- Antigravity master + live ---
for dest in "$ROOT/antigravity/.agents/rules" "$ROOT/.agents/rules"; do
  mkdir -p "$dest"
  for name in "${CORE[@]}"; do
    cp "$(pick_rule antigravity "$name")" "$dest/$name"
    add_always_apply "$dest/$name"
  done
  cp "$PLAT/antigravity/antigravity-overlay.md" "$dest/antigravity-overlay.md"
  add_always_apply "$dest/antigravity-overlay.md"
  remove_legacy "$dest"
done

for skills_dest in "$ROOT/antigravity/.agents/skills" "$ROOT/.agents/skills"; do
  mkdir -p "$skills_dest"
  rsync -a --delete "$GROK_SKILLS/" "$skills_dest/"
done
echo "Antigravity: $(ls -1 "$ROOT/.agents/rules"/*.md | wc -l) rules, $(find "$ROOT/.agents/skills" -name SKILL.md | wc -l) skills"

echo "Done. Run: grok/scripts/validate-harness.sh && grok inspect"