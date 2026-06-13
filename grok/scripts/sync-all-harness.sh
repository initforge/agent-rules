#!/usr/bin/env bash
# Sync Opus-emulation harness: grok master → .grok live + codex/rules + antigravity
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

add_always_apply() {
  local f="$1"
  if grep -q 'alwaysApply:' "$f" 2>/dev/null; then return; fi
  if head -1 "$f" | grep -q '^---'; then
    sed -i '1a alwaysApply: true' "$f"
  else
    sed -i '1i ---\nalwaysApply: true\n---\n' "$f"
  fi
}

pick_rule() {
  local platform="$1" name="$2"
  local variant="$PLAT/$platform/$name"
  if [[ -f "$variant" ]]; then echo "$variant"; else echo "$GROK_RULES/$name"; fi
}

# --- Grok CLI live ---
mkdir -p "$ROOT/.grok/rules" "$ROOT/.grok/skills"
cp "$GROK_RULES"/*.md "$ROOT/.grok/rules/"
rsync -a --delete "$GROK_SKILLS/" "$ROOT/.grok/skills/"
echo "Grok live: $(ls -1 "$ROOT/.grok/rules"/*.md | wc -l) rules, $(find "$GROK_SKILLS" -name SKILL.md | wc -l) skills"

# --- Codex ---
mkdir -p "$ROOT/codex/rules"
for name in "${CORE[@]}"; do
  cp "$(pick_rule codex "$name")" "$ROOT/codex/rules/$name"
done
cp "$GROK_RULES/platforms/codex/codex-overlay.md" "$ROOT/codex/rules/codex-overlay.md"
# Remove legacy fragmented rules
LEGACY_CODEX=(
  00-antigravity-runtime-intent.md 00-codex-runtime-intent.md 00-hard-activation-contract.md
  01-intent-contract.md 10-fast-context.md planning.md execution.md core.md
  context-tools.md tool-inventory.md prompt-intent-router.md quality-gates.md
  root-cause-verification.md deep-reasoning.md clean-code.md technical-debt-control.md
  default.rules
)
for f in "${LEGACY_CODEX[@]}"; do rm -f "$ROOT/codex/rules/$f"; done
echo "Codex rules: $(ls -1 "$ROOT/codex/rules"/*.md 2>/dev/null | wc -l) files"

# --- Antigravity master + live ---
for dest in "$ROOT/antigravity/.agents/rules" "$ROOT/.agents/rules"; do
  mkdir -p "$dest"
  for name in "${CORE[@]}"; do
    cp "$(pick_rule antigravity "$name")" "$dest/$name"
    add_always_apply "$dest/$name"
  done
  cp "$GROK_RULES/platforms/antigravity/antigravity-overlay.md" "$dest/antigravity-overlay.md"
  add_always_apply "$dest/antigravity-overlay.md"
  LEGACY_AG=(
    00-antigravity-runtime-intent.md 00-codex-runtime-intent.md 00-hard-activation-contract.md
    01-intent-contract.md 10-fast-context.md planning.md execution.md core.md
    context-tools.md tool-inventory.md prompt-intent-router.md quality-gates.md
    root-cause-verification.md clean-code.md technical-debt-control.md
    codex-overlay.md default.rules
  )
  for f in "${LEGACY_AG[@]}"; do rm -f "$dest/$f"; done
done
echo "Antigravity rules: $(ls -1 "$ROOT/.agents/rules"/*.md | wc -l) files (alwaysApply)"

echo "Done. Verify Grok: grok inspect"